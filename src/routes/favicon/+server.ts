import { redirect } from '@sveltejs/kit';
import { readFile } from 'node:fs/promises';
import { env } from '$env/dynamic/private';
import { resolveCustomFavicon } from '$lib/server/pageHead';
import type { RequestHandler } from './$types';

/**
 * Serves the operator-supplied favicon from `FAVICON_PATH` (e.g. a file
 * bind-mounted into the container). Falls back to the bundled favicon when
 * it isn't configured or readable, so a stale `/favicon?v=…` link never 404s.
 */
export const GET: RequestHandler = async () => {
	const custom = resolveCustomFavicon(env.FAVICON_PATH);
	if (!custom) redirect(302, '/favicon.svg');

	let body: Buffer;
	try {
		body = await readFile(custom.path);
	} catch {
		redirect(302, '/favicon.svg');
	}

	return new Response(new Uint8Array(body), {
		headers: {
			'content-type': custom.contentType,
			// The link carries the file's mtime as ?v=, so a replaced file gets a new URL.
			'cache-control': 'public, max-age=86400'
		}
	});
};
