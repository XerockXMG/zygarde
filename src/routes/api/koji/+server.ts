import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { geoJsonToLatLngs } from '$lib/features/map/geometry';
import {
	buildKojiRequest,
	extractRouteCoords,
	formatRouteText
} from '$lib/features/area-management/server/koji';
import { kojiPost } from '$lib/features/area-management/server/kojiHttp';
import type { GeoJsonGeometry } from '$lib/features/area-management/types';
import type { RequestHandler } from './$types';

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
