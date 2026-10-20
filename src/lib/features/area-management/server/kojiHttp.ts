import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

// Use node:http/https directly so we can set TCP keepalive on the socket.
// Native fetch (undici) doesn't expose this, and without it a stateful firewall
// or NAT device between us and Kōji will silently drop the idle connection while
// Kōji is busy computing (can take many minutes for large areas).
//
// No application-level socket timeout is set by default: TCP keepalive (10 s) handles dead
// connections, and an idle timeout would fire during normal long computations. Callers that
// can't wait indefinitely (e.g. bootstrap generation on Create area) pass opts.timeoutMs,
// which is an overall deadline for the whole request, not an idle timeout.
//
// Kōji's Actix backend sometimes closes the connection with RST after sending a
// complete response (e.g. when an internal plugin like TSP is missing). Node.js
// fires 'error' on the response stream instead of 'end' in that case, even though
// all data was already received. We detect this and resolve rather than reject.
export function kojiPost(
	fullUrl: string,
	bodyStr: string,
	extraHeaders: Record<string, string>,
	opts?: { timeoutMs?: number }
): Promise<{ status: number; body: string }> {
	return new Promise((resolveRaw, rejectRaw) => {
		let timer: ReturnType<typeof setTimeout> | undefined;
		const resolve = (value: { status: number; body: string }) => {
			clearTimeout(timer);
			resolveRaw(value);
		};
		const reject = (err: unknown) => {
			clearTimeout(timer);
			rejectRaw(err);
		};
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
		if (opts?.timeoutMs) {
			const seconds = Math.round(opts.timeoutMs / 1000);
			timer = setTimeout(
				() => req.destroy(new Error(`Kōji did not respond within ${seconds} s`)),
				opts.timeoutMs
			);
		}
		req.write(bodyBuf);
		req.end();
	});
}

export type KojiPost = typeof kojiPost;
