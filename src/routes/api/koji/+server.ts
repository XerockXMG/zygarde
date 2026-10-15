import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { geoJsonToLatLngs } from '$lib/features/map/geometry';
import {
	buildKojiRequest,
	extractRouteCoords,
	formatRouteText
} from '$lib/features/area-management/server/koji';
import type { GeoJsonGeometry } from '$lib/features/area-management/types';
import type { RequestHandler } from './$types';

// Use node:http/https directly so we can set TCP keepalive on the socket.
// Native fetch (undici) doesn't expose this, and without it a stateful firewall
// or NAT device between us and Kōji will silently drop the idle connection while
// Kōji is busy computing (can take many minutes for large areas).
//
// No application-level socket timeout is set: TCP keepalive (10 s) handles dead
// connections, and an idle timeout would fire during normal long computations.
//
// Kōji's Actix backend sometimes closes the connection with RST after sending a
// complete response (e.g. when an internal plugin like TSP is missing). Node.js
// fires 'error' on the response stream instead of 'end' in that case, even though
// all data was already received. We detect this and resolve rather than reject.
function kojiPost(
	fullUrl: string,
	bodyStr: string,
	extraHeaders: Record<string, string>
): Promise<{ status: number; body: string }> {
	return new Promise((resolve, reject) => {
		const u = new URL(fullUrl);
		const isHttps = u.protocol === 'https:';
		const bodyBuf = Buffer.from(bodyStr);

		const req = (isHttps ? httpsRequest : httpRequest)(
			{
				hostname: u.hostname,
				port: u.port || (isHttps ? 443 : 80),
				path: u.pathname + u.search,
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Content-Length': bodyBuf.length,
					Connection: 'close',
					...extraHeaders
				}
			},
			(res) => {
				const chunks: Buffer[] = [];
				let settled = false;

				const settle = (value: { status: number; body: string }) => {
					if (!settled) {
						settled = true;
						resolve(value);
					}
				};

				res.on('data', (c: Buffer) => chunks.push(c));
				res.on('end', () =>
					settle({ status: res.statusCode ?? 200, body: Buffer.concat(chunks).toString() })
				);
				res.on('error', (err) => {
					if (!settled && chunks.length > 0 && res.statusCode) {
						const body = Buffer.concat(chunks).toString();
						try {
							// If the body parses, the RST fired after a complete response
							// (Kōji's Actix closes with RST when an internal plugin is missing).
							// For large responses, RST can fire mid-transmission and leave
							// partial JSON — validate here rather than surfacing a confusing
							// parse error downstream.
							JSON.parse(body);
							settle({ status: res.statusCode, body });
						} catch {
							settled = true;
							reject(
								new Error(
									`Kōji closed the connection before sending a complete response (RST mid-transmission, ${body.length} bytes). ` +
										`First 300 chars: ${body.slice(0, 300)}`
								)
							);
						}
					} else if (!settled) {
						settled = true;
						reject(err);
					}
				});
			}
		);

		req.on('socket', (sock) => {
			// TCP keepalive probes every 10 s — prevents NAT/firewall from dropping
			// the idle connection while Kōji is computing.
			sock.setKeepAlive(true, 10_000);
		});

		req.on('error', reject);
		req.write(bodyBuf);
		req.end();
	});
}

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.isAdmin) error(403, 'Admin access required');

	const kojiUrl = (env.KOJI_URL ?? '').replace(/\/$/, '');
	if (!kojiUrl) error(503, 'KOJI_URL is not configured. Add it to your .env file.');

	const payload = (await request.json()) as Record<string, unknown>;
	const areaId = payload.areaId;
	const geofence = payload.geofence;
	const routeType = payload.routeType === 'bootstrap' ? 'bootstrap' : 'spawnpoint';
	const radius = Number(payload.radius) || 0;
	const minPoints = Number(payload.minPoints) || 0;
	const maxClusters = Number(payload.maxClusters) || 0;
	const clusterMode = typeof payload.clusterMode === 'string' ? payload.clusterMode : 'Balanced';
	const calculationMode =
		typeof payload.calculationMode === 'string' ? payload.calculationMode : 'Radius';
	const tth = typeof payload.tth === 'string' ? payload.tth : 'All';

	if (!geofence || typeof geofence !== 'object') error(400, 'No geofence provided');
	const geometry = geofence as GeoJsonGeometry;
	const vertexCount = geoJsonToLatLngs(geometry).flat().length;
	if (vertexCount < 3) error(400, 'Geofence has fewer than 3 usable vertices');

	const { endpointPath, body: kojiBody } = buildKojiRequest(geometry, {
		routeType,
		radius,
		minPoints,
		maxClusters,
		clusterMode,
		calculationMode,
		tth
	});
	const kojiEndpoint = `${kojiUrl}${endpointPath}`;

	const authHeaders: Record<string, string> = {};
	if (env.KOJI_SECRET) authHeaders['Authorization'] = `Bearer ${env.KOJI_SECRET}`;

	const enc = new TextEncoder();

	const stream = new ReadableStream({
		async start(controller) {
			const ping = setInterval(() => {
				try {
					controller.enqueue(enc.encode(': ping\n\n'));
				} catch {
					/* stream closed */
				}
			}, 20_000);

			const send = (data: unknown) => {
				try {
					controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`));
				} catch {
					/* closed */
				}
			};

			try {
				let kojiRes: { status: number; body: string };
				try {
					kojiRes = await kojiPost(kojiEndpoint, JSON.stringify(kojiBody), authHeaders);
				} catch (e) {
					const msg = e instanceof Error ? e.message : String(e);
					send({ error: `Could not reach Kōji at ${kojiUrl}: ${msg}` });
					return;
				}

				if (kojiRes.status < 200 || kojiRes.status >= 300) {
					send({ error: `Kōji returned ${kojiRes.status}: ${kojiRes.body.slice(0, 200)}` });
					return;
				}

				let result: { data?: { features?: unknown }; stats?: unknown };
				try {
					result = JSON.parse(kojiRes.body);
				} catch {
					send({
						error: `Kōji response was not valid JSON (${kojiRes.body.length} bytes). First 300 chars: ${kojiRes.body.slice(0, 300)}`
					});
					return;
				}

				const coords = extractRouteCoords(result?.data?.features);

				if (coords.length === 0) {
					send({
						error:
							'Kōji returned no route points. Try adjusting the parameters or check that spawnpoints exist within this geofence.'
					});
					return;
				}

				const routeText = formatRouteText(coords);
				const token = randomBytes(8).toString('hex');
				const prefix = routeType === 'bootstrap' ? 'bootstrap' : 'spawn';
				const areaIdPart = typeof areaId === 'number' ? areaId : 'unknown';
				const cacheKey = `${prefix}_area${areaIdPart}_${token}.txt`;
				try {
					const cacheDir = join(process.cwd(), 'route-backups');
					await mkdir(cacheDir, { recursive: true });
					await writeFile(join(cacheDir, cacheKey), routeText, 'utf8');
				} catch (fsErr) {
					send({
						error: `Route generated but failed to cache on disk: ${fsErr instanceof Error ? fsErr.message : fsErr}`
					});
					return;
				}

				send({ coords, stats: result?.stats ?? null, cacheKey });
			} finally {
				clearInterval(ping);
				controller.close();
			}
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			'X-Accel-Buffering': 'no'
		}
	});
};
