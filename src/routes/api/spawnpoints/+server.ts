import { error, json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { hasAccess } from '$lib/utils/access';
import { getPool } from '$lib/server/db';
import { geoJsonToLatLngs } from '$lib/features/map/geometry';
import { listAllAreas } from '$lib/features/area-management/server/dragonite';
import {
	getSettings,
	DEFAULT_SETTINGS,
	type QueryExecutor as SettingsQueryExecutor
} from '$lib/features/spawnpoints/server/settings';
import {
	getSpawnpointCount,
	type QueryExecutor as GolbatQueryExecutor
} from '$lib/features/spawnpoints/server/golbat';
import type { SpawnpointMode } from '$lib/features/spawnpoints/types';
import type { RequestHandler } from './$types';

const VALID_MODES: SpawnpointMode[] = ['all', 'recent', 'confirmed'];

interface SpawnpointCountRequest {
	areaId: number;
	mode: SpawnpointMode;
	refresh?: boolean;
}

export const POST: RequestHandler = async ({ request, locals }) => {
	const user = locals.user;
	const isAdmin = user?.isAdmin ?? false;
	const canSee = isAdmin || (!!user && hasAccess(env.SPAWNPOINT_ACCESS, user.guildRoles));
	if (!canSee) error(403, 'Forbidden');

	let body: SpawnpointCountRequest;
	try {
		body = await request.json();
	} catch {
		error(400, 'Invalid JSON body');
	}
	const { areaId, mode, refresh } = body;

	if (!Number.isInteger(areaId) || areaId <= 0) error(400, 'Invalid area id');
	if (!VALID_MODES.includes(mode)) error(400, 'Invalid mode');

	const baseUrl = env.DRAGONITE_URL;
	if (!baseUrl) error(503, 'Dragonite is not configured.');

	let areas;
	try {
		areas = await listAllAreas({ baseUrl });
	} catch {
		error(502, 'Failed to load area data.');
	}
	const area = areas.find((a) => a.id === areaId);
	if (!area) error(404, 'Area not found.');

	// The client's own area list is already filtered by offline-area access
	// server-side (see +page.server.ts), but this route resolves the area
	// independently by id — so it must re-apply the same visibility rule,
	// or a SPAWNPOINT_ACCESS-only user could probe counts for areas they
	// can't otherwise see.
	const canSeeOfflineAreas =
		isAdmin || (!!user && hasAccess(env.OFFLINE_AREA_ACCESS, user.guildRoles));
	if (!area.enabled && !canSeeOfflineAreas) error(404, 'Area not found.');

	const rings = geoJsonToLatLngs(area.geofence).filter((ring) => ring.length >= 3);
	if (rings.length === 0) error(400, 'Area has no usable geofence.');

	// Only admins can force-bypass the cache — never trust the client's flag alone.
	const forceRefresh = !!(refresh && isAdmin);

	// Both aliases wrap the same LOCAL_DATABASE_URL pool — the real Golbat
	// connection is internal to golbat.ts, created from GOLBAT_DATABASE_URL.
	// "cacheExecutor" names what this one actually is: the L2-cache executor.
	const pool = getPool(env.LOCAL_DATABASE_URL);
	const settingsExecutor = pool ? (pool as unknown as SettingsQueryExecutor) : null;
	const cacheExecutor = pool ? (pool as unknown as GolbatQueryExecutor) : null;

	const settings = settingsExecutor ? await getSettings(settingsExecutor) : DEFAULT_SETTINGS;

	const result = await getSpawnpointCount(
		cacheExecutor,
		areaId,
		rings,
		mode,
		settings.recentDays,
		settings.cacheTtlHours,
		forceRefresh
	);

	if (result === null) error(503, 'Golbat database unavailable');

	return json(result);
};
