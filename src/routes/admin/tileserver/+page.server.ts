import { error, fail } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { getPool } from '$lib/server/db';
import {
	getTileSettings,
	setTileSettings,
	DEFAULT_TILE_SETTINGS,
	type QueryExecutor
} from '$lib/features/map/server/tileSettings';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user?.isAdmin) error(403, 'Admin access required.');

	const pool = getPool(env.LOCAL_DATABASE_URL);
	const executor = pool ? (pool as unknown as QueryExecutor) : null;

	const settings = executor ? await getTileSettings(executor) : DEFAULT_TILE_SETTINGS;

	return { settings };
};

export const actions: Actions = {
	saveSettings: async ({ request, locals }) => {
		if (!locals.user?.isAdmin) return fail(403, { message: 'Admin access required.' });

		const form = await request.formData();
		const urlTemplateRaw = form.get('urlTemplate');
		const attributionRaw = form.get('attribution');
		const maxZoomRaw = form.get('maxZoom');
		const tileSizeRaw = form.get('tileSize');
		const zoomOffsetRaw = form.get('zoomOffset');
		if (
			typeof urlTemplateRaw !== 'string' ||
			typeof attributionRaw !== 'string' ||
			typeof maxZoomRaw !== 'string' ||
			typeof tileSizeRaw !== 'string' ||
			typeof zoomOffsetRaw !== 'string'
		) {
			return fail(400, { message: 'Invalid settings payload.' });
		}

		const urlTemplate = urlTemplateRaw.trim();
		const attribution = attributionRaw.trim();
		const maxZoom = parseInt(maxZoomRaw, 10);
		const tileSize = parseInt(tileSizeRaw, 10);
		const zoomOffset = parseInt(zoomOffsetRaw, 10);

		if (!urlTemplate) {
			return fail(400, { message: 'Tile URL template is required.' });
		}
		if (
			!urlTemplate.includes('{z}') ||
			!urlTemplate.includes('{x}') ||
			!urlTemplate.includes('{y}')
		) {
			return fail(400, {
				message: 'Tile URL template must contain {z}, {x}, and {y} placeholders.'
			});
		}
		if (isNaN(maxZoom) || maxZoom < 1 || maxZoom > 24) {
			return fail(400, { message: 'Max zoom must be 1–24.' });
		}
		if (isNaN(tileSize) || tileSize < 64 || tileSize > 2048) {
			return fail(400, { message: 'Tile size must be 64–2048.' });
		}
		if (isNaN(zoomOffset) || zoomOffset < -8 || zoomOffset > 8) {
			return fail(400, { message: 'Zoom offset must be -8–8.' });
		}

		const pool = getPool(env.LOCAL_DATABASE_URL);
		if (!pool) {
			return fail(503, { message: 'Settings require LOCAL_DATABASE_URL to be configured.' });
		}
		const executor = pool as unknown as QueryExecutor;

		await setTileSettings(executor, urlTemplate, attribution, maxZoom, tileSize, zoomOffset);

		return { success: true };
	}
};
