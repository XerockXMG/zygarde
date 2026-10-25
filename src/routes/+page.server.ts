import { error, fail } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { listAllAreas, patchArea } from '$lib/features/area-management/server/dragonite';
import { hasAccess } from '$lib/utils/access';
import { logger } from '$lib/server/logger';
import { getPool } from '$lib/server/db';
import { isValidPolygonGeoJson } from '$lib/features/map/geometry';
import {
	archiveGeofence,
	listGeofenceArchive,
	getArchiveEntry,
	deleteGeofenceArchive as dbDeleteGeofenceArchive,
	type QueryExecutor as ArchiveQueryExecutor
} from '$lib/features/map/server/geofenceArchive';
import {
	recordRouteRun,
	getRouteRuns,
	type QueryExecutor as RouteRunQueryExecutor
} from '$lib/features/area-management/server/routeRuns';
import {
	getAreaTokenTotals,
	getUserAllocations,
	getUserTokenBudget,
	allocateTokens as dbAllocateTokens,
	setPrimary as dbSetPrimary,
	getAllVoteDetails,
	TokenBudgetExceededError,
	type QueryExecutor as VoteQueryExecutor
} from '$lib/features/voting/server/votes';
import { sendTokenWebhook } from '$lib/features/voting/server/discord';
import { alertWebhookUrl } from '$lib/server/alerts';
import {
	getAreaTargetConfigs,
	setAreaTarget as dbSetAreaTarget,
	resolveTarget,
	type QueryExecutor as TargetQueryExecutor
} from '$lib/features/voting/server/targets';
import {
	getVotingSettings,
	type QueryExecutor as VotingSettingsQueryExecutor
} from '$lib/features/voting/server/settings';
import {
	getAutoscaleConfigs,
	ensureAutoscaleRows,
	enableAutoscale as dbEnableAutoscale,
	disableAutoscale as dbDisableAutoscale,
	type QueryExecutor as AutoscaleQueryExecutor
} from '$lib/features/autoscale/server/state';
import {
	listMyRequests,
	submitRequest as dbSubmitRequest,
	deleteMyRequest,
	type QueryExecutor as RequestQueryExecutor
} from '$lib/features/area-requests/server/requests';
import { tempAreaToday } from '$lib/features/area-requests/server/timezone';
import { validateTemporaryDates } from '$lib/features/area-requests/dates';
import {
	MAX_PENDING_REQUESTS,
	MAX_REQUEST_NOTE_LENGTH,
	requestGeofenceProblem
} from '$lib/features/area-requests/limits';
import { sendRequestWebhook } from '$lib/features/area-requests/server/discord';
import {
	getTileSettings,
	DEFAULT_TILE_SETTINGS,
	type QueryExecutor as TileSettingsQueryExecutor
} from '$lib/features/map/server/tileSettings';
import { parseStartView } from '$lib/features/map/server/startView';
import type { Area, ToggleField } from '$lib/features/area-management/types';
import type { PageServerLoad, Actions } from './$types';
import { readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { parseRouteText } from '$lib/features/area-management/server/koji';
import { syncGeofenceToKoji } from '$lib/features/area-management/server/kojiGeofenceSync';
import type {
	GeoJsonGeometry,
	GeoJsonPolygon,
	KojiSyncResult
} from '$lib/features/area-management/types';

const TOGGLE_FIELDS: ToggleField[] = [
	'enabled',
	'enable_pokemon',
	'enable_forts',
	'enable_quests',
	'enable_rare_pokemon'
];

function parseWorkerCount(v: FormDataEntryValue | null): number | null {
	if (typeof v !== 'string' || v.trim() === '') return null;
	const n = Number(v);
	return Number.isInteger(n) && n >= 0 ? n : null;
}

async function findVotableArea(areaId: number, canSeeOfflineAreas: boolean): Promise<Area | null> {
	const baseUrl = env.DRAGONITE_URL;
	if (!baseUrl) return null;
	const areas = await listAllAreas({ baseUrl });
	const area = areas.find((a) => a.id === areaId);
	return area && (area.enabled || canSeeOfflineAreas) ? area : null;
}

/**
 * Fire-and-forget token-change alert; skips the extra queries when the alert
 * is disabled. The target resolves off the stored autoscale baseline, same as
 * `load`, never live pokemon_mode.workers (see autoscale/server/sync.ts).
 */
function notifyTokenChange(
	pool: VoteQueryExecutor,
	area: Area,
	username: string,
	previousAmount: number,
	newAmount: number
): void {
	if (!alertWebhookUrl('tokenChanges') || previousAmount === newAmount) return;
	(async () => {
		const [totals, targetConfigs, votingSettings, autoscaleConfigs] = await Promise.all([
			getAreaTokenTotals(pool),
			getAreaTargetConfigs(pool as unknown as TargetQueryExecutor),
			getVotingSettings(pool as unknown as VotingSettingsQueryExecutor),
			getAutoscaleConfigs(pool as unknown as AutoscaleQueryExecutor)
		]);
		const maxPokemonWorkers =
			autoscaleConfigs[area.id]?.maxPokemonWorkers ?? area.pokemon_mode.workers;
		await sendTokenWebhook({
			username,
			areaName: area.name,
			previousAmount,
			newAmount,
			areaTotal: totals[area.id] ?? 0,
			target: resolveTarget(
				targetConfigs[area.id],
				maxPokemonWorkers,
				votingSettings.workersPerToken
			),
			geofence: area.geofence
		});
	})().catch((err) => logger.warn({ err, areaId: area.id }, 'Token webhook failed'));
}

export const load: PageServerLoad = async ({ locals }) => {
	const baseUrl = env.DRAGONITE_URL;
	if (!baseUrl) {
		error(503, 'Dragonite is not configured — set DRAGONITE_URL in your .env file.');
	}

	let areas;
	try {
		areas = await listAllAreas({ baseUrl });
	} catch (err) {
		logger.error({ err }, 'Failed to load areas from Dragonite');
		error(503, 'Failed to load areas from Dragonite.');
	}

	const user = locals.user;
	const isAdmin = user?.isAdmin ?? false;
	const canSeeOfflineAreas =
		isAdmin || (!!user && hasAccess(env.OFFLINE_AREA_ACCESS, user.guildRoles));
	// ROUTE_ACCESS covers every route layer; the older per-layer
	// POKEMON_/FORT_/QUEST_ROUTE_ACCESS settings still grant their own layer.
	const canSeeRoutes = (legacyLayerSetting: string | undefined) =>
		isAdmin ||
		(!!user &&
			(hasAccess(env.ROUTE_ACCESS, user.guildRoles) ||
				hasAccess(legacyLayerSetting, user.guildRoles)));
	const canSeePokemonRoutes = canSeeRoutes(env.POKEMON_ROUTE_ACCESS);
	const canSeeFortRoutes = canSeeRoutes(env.FORT_ROUTE_ACCESS);
	const canSeeQuestRoutes = canSeeRoutes(env.QUEST_ROUTE_ACCESS);
	const canSeeSpawnpoints =
		isAdmin || (!!user && hasAccess(env.SPAWNPOINT_ACCESS, user.guildRoles));

	const permissions = {
		canEdit: isAdmin,
		canSeeOfflineAreas,
		canSeePokemonRoutes,
		canSeeFortRoutes,
		canSeeQuestRoutes,
		canSeeSpawnpoints,
		canSyncKoji: isAdmin && !!env.KOJI_URL
	};

	const visibleAreas = canSeeOfflineAreas ? areas : areas.filter((a) => a.enabled);

	const pool = getPool(env.LOCAL_DATABASE_URL);
	const voteExecutor = pool ? (pool as unknown as VoteQueryExecutor) : null;

	const tokenTotals = voteExecutor ? await getAreaTokenTotals(voteExecutor) : {};
	const { allocations, primaryAreaId } =
		voteExecutor && user
			? await getUserAllocations(voteExecutor, user.discordId)
			: { allocations: {} as Record<number, number>, primaryAreaId: null as number | null };
	const tokenBudget =
		voteExecutor && user ? await getUserTokenBudget(voteExecutor, user.discordId) : 0;
	const voteDetailsByArea = voteExecutor && isAdmin ? await getAllVoteDetails(voteExecutor) : {};

	// Target configs are read unconditionally — the resolved goal number is
	// shown to every user, not just admins. Only the raw editable config
	// (targetConfigs, used to pre-fill the admin form) is admin-gated below.
	const targetExecutor = pool ? (pool as unknown as TargetQueryExecutor) : null;
	const targetConfigs = targetExecutor ? await getAreaTargetConfigs(targetExecutor) : {};
	const votingSettingsExecutor = pool ? (pool as unknown as VotingSettingsQueryExecutor) : null;
	const votingSettings = votingSettingsExecutor
		? await getVotingSettings(votingSettingsExecutor)
		: { workersPerToken: 1 };

	// Every area gets a max_pokemon_workers baseline here (backfilled once,
	// disabled by default) regardless of whether autoscale is ever turned on
	// for it — a `workers`-mode vote target always resolves off this stored
	// max, never live pokemon_mode.workers. Otherwise autoscale throttling an
	// area down would shrink its own target too, making it look more funded
	// and immediately scaling back up (see autoscale/server/sync.ts).
	const autoscaleExecutor = pool ? (pool as unknown as AutoscaleQueryExecutor) : null;
	if (autoscaleExecutor) {
		await ensureAutoscaleRows(
			autoscaleExecutor,
			areas.map((a) => ({ id: a.id, pokemonWorkers: a.pokemon_mode.workers }))
		);
	}
	const autoscaleConfigs = autoscaleExecutor ? await getAutoscaleConfigs(autoscaleExecutor) : {};

	const targetsByArea: Record<number, number | null> = {};
	for (const a of visibleAreas) {
		const maxPokemonWorkers = autoscaleConfigs[a.id]?.maxPokemonWorkers ?? a.pokemon_mode.workers;
		targetsByArea[a.id] = resolveTarget(
			targetConfigs[a.id],
			maxPokemonWorkers,
			votingSettings.workersPerToken
		);
	}

	const requestExecutor = pool ? (pool as unknown as RequestQueryExecutor) : null;
	const myRequests =
		requestExecutor && user ? await listMyRequests(requestExecutor, user.discordId) : [];

	const tileSettingsExecutor = pool ? (pool as unknown as TileSettingsQueryExecutor) : null;
	const tileSettings = tileSettingsExecutor
		? await getTileSettings(tileSettingsExecutor)
		: DEFAULT_TILE_SETTINGS;

	const archiveExecutor = pool ? (pool as unknown as ArchiveQueryExecutor) : null;
	const geofenceHistory =
		archiveExecutor && isAdmin ? await listGeofenceArchive(archiveExecutor) : {};

	const routeRunExecutor = pool ? (pool as unknown as RouteRunQueryExecutor) : null;
	const routeRuns = routeRunExecutor && isAdmin ? await getRouteRuns(routeRunExecutor) : {};

	return {
		user,
		permissions,
		tokenTotals,
		allocations,
		primaryAreaId,
		tokenBudget,
		targetsByArea,
		targetConfigs: isAdmin ? targetConfigs : {},
		autoscaleConfigs: isAdmin ? autoscaleConfigs : {},
		voteDetailsByArea,
		myRequests,
		tileSettings,
		startView: parseStartView(env.START_LAT, env.START_LON, env.START_ZOOM),
		geofenceHistory,
		routeRuns,
		areas: visibleAreas.map((a) => ({
			...a,
			pokemon_mode: {
				workers: isAdmin ? a.pokemon_mode.workers : 0,
				route: canSeePokemonRoutes ? a.pokemon_mode.route : []
			},
			fort_mode: {
				workers: isAdmin ? a.fort_mode.workers : 0,
				route: canSeeFortRoutes ? a.fort_mode.route : []
			},
			quest_mode: {
				workers: isAdmin ? a.quest_mode.workers : 0,
				route: canSeeQuestRoutes ? a.quest_mode.route : []
			},
			rare_pokemon_mode: { workers: isAdmin ? a.rare_pokemon_mode.workers : 0, route: [] }
		}))
	};
};

/**
 * The "Also update in Kōji" half of saveGeofence/restoreGeofence, run only
 * after Dragonite has already accepted the new shape. Matches the Kōji
 * geofence by the area's exact Dragonite name and never creates one — see
 * kojiGeofenceSync.ts for why it deliberately doesn't use save-koji. Never
 * fails the action: the Dragonite save already happened, so a Kōji problem is
 * reported back as `skipped`/`failed` for the admin to see instead.
 */
async function syncAreaGeofenceToKoji(
	areaId: number,
	areaName: string,
	geometry: GeoJsonGeometry
): Promise<KojiSyncResult> {
	if (!env.KOJI_URL) return { status: 'skipped', reason: 'Kōji is not configured.' };
	const result = await syncGeofenceToKoji(
		{ baseUrl: env.KOJI_URL, secret: env.KOJI_SECRET },
		areaName,
		geometry
	);
	if (result.status === 'synced') {
		logger.info({ areaId, areaName, kojiId: result.kojiId }, 'Synced geofence to Kōji');
	} else {
		logger.warn({ areaId, areaName, ...result }, 'Geofence not synced to Kōji');
	}
	return result;
}

export const actions: Actions = {
	toggleField: async ({ request, locals }) => {
		if (!locals.user?.isAdmin) return fail(403, { message: 'Admin access required.' });

		const form = await request.formData();
		const areaIdRaw = form.get('areaId');
		const areaId = Number(areaIdRaw);
		const field = form.get('field') as string;
		const value = form.get('value') === 'true';

		if (!areaIdRaw || !Number.isInteger(areaId) || !TOGGLE_FIELDS.includes(field as ToggleField)) {
			return fail(400, { message: 'Invalid toggle request' });
		}

		try {
			await patchArea({ baseUrl: env.DRAGONITE_URL ?? '' }, areaId, { [field]: value });
		} catch (err) {
			logger.error({ err, areaId, field }, 'Failed to update area');
			return fail(502, { message: 'Failed to update area — Dragonite may be unreachable.' });
		}
		return { success: true };
	},

	saveWorkers: async ({ request, locals }) => {
		if (!locals.user?.isAdmin) return fail(403, { message: 'Admin access required.' });

		const form = await request.formData();
		const areaIdRaw = form.get('areaId');
		const areaId = Number(areaIdRaw);
		if (!areaIdRaw || !Number.isInteger(areaId)) return fail(400, { message: 'Invalid area id' });

		const pokemonWorkers = parseWorkerCount(form.get('pokemon_workers'));
		const fortWorkers = parseWorkerCount(form.get('fort_workers'));
		const questWorkers = parseWorkerCount(form.get('quest_workers'));
		const rareWorkers = parseWorkerCount(form.get('rare_workers'));

		if (
			pokemonWorkers === null ||
			fortWorkers === null ||
			questWorkers === null ||
			rareWorkers === null
		) {
			return fail(400, { message: 'Worker counts must be whole numbers ≥ 0' });
		}

		try {
			await patchArea({ baseUrl: env.DRAGONITE_URL ?? '' }, areaId, {
				pokemon_mode: { workers: pokemonWorkers },
				fort_mode: { workers: fortWorkers },
				quest_mode: { workers: questWorkers },
				rare_pokemon_mode: { workers: rareWorkers }
			});
		} catch (err) {
			logger.error({ err, areaId }, 'Failed to update worker counts');
			return fail(502, {
				message: 'Failed to update worker counts — Dragonite may be unreachable.'
			});
		}
		return { success: true };
	},

	enableAutoscale: async ({ request, locals }) => {
		if (!locals.user?.isAdmin) return fail(403, { message: 'Admin access required.' });

		const form = await request.formData();
		const areaIdRaw = form.get('areaId');
		const areaId = Number(areaIdRaw);
		if (!areaIdRaw || !Number.isInteger(areaId)) return fail(400, { message: 'Invalid area id' });

		const pool = getPool(env.LOCAL_DATABASE_URL);
		if (!pool) return fail(503, { message: 'Autoscale is not available right now.' });
		const targetExecutor = pool as unknown as TargetQueryExecutor;
		const autoscaleExecutor = pool as unknown as AutoscaleQueryExecutor;

		// Autoscale's whole basis is "% of vote target funded" — without a
		// target configured there's nothing to scale against, and the area
		// would silently sit at the lowest tier with no visible reason why.
		const targetConfigs = await getAreaTargetConfigs(targetExecutor);
		if (!targetConfigs[areaId]) {
			return fail(400, {
				message: 'Set a vote target for this area before enabling autoscale.'
			});
		}

		let areas;
		try {
			areas = await listAllAreas({ baseUrl: env.DRAGONITE_URL ?? '' });
		} catch (err) {
			logger.error({ err, areaId }, 'Failed to load areas before enabling autoscale');
			return fail(502, { message: 'Failed to load current area data.' });
		}
		const area = areas.find((a) => a.id === areaId);
		if (!area) return fail(404, { message: 'Area not found.' });

		// (Re-)snapshot the current live count as the new 100%-speed ceiling —
		// this also covers a re-enable after a manual edit made while disabled.
		await dbEnableAutoscale(autoscaleExecutor, areaId, area.pokemon_mode.workers);
		return { success: true };
	},

	disableAutoscale: async ({ request, locals }) => {
		if (!locals.user?.isAdmin) return fail(403, { message: 'Admin access required.' });

		const form = await request.formData();
		const areaIdRaw = form.get('areaId');
		const areaId = Number(areaIdRaw);
		if (!areaIdRaw || !Number.isInteger(areaId)) return fail(400, { message: 'Invalid area id' });

		const pool = getPool(env.LOCAL_DATABASE_URL);
		if (!pool) return fail(503, { message: 'Autoscale is not available right now.' });
		const autoscaleExecutor = pool as unknown as AutoscaleQueryExecutor;

		const autoscaleConfigs = await getAutoscaleConfigs(autoscaleExecutor);
		const config = autoscaleConfigs[areaId];

		await dbDisableAutoscale(autoscaleExecutor, areaId);

		// Hand control back to the manual Worker form at full stored capacity,
		// rather than leaving the area at whatever tier it was last throttled
		// to.
		if (config) {
			try {
				await patchArea({ baseUrl: env.DRAGONITE_URL ?? '' }, areaId, {
					pokemon_mode: { workers: config.maxPokemonWorkers }
				});
			} catch (err) {
				logger.error({ err, areaId }, 'Failed to restore worker count after disabling autoscale');
				return fail(502, {
					message: 'Autoscale disabled, but restoring the worker count failed — set it manually.'
				});
			}
		}
		return { success: true };
	},

	allocateTokens: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { message: 'Login required to allocate tokens.' });

		const pool = getPool(env.LOCAL_DATABASE_URL);
		if (!pool) return fail(503, { message: 'Voting is not available right now.' });

		const form = await request.formData();
		const idRaw = form.get('id');
		const areaId = Number(idRaw);
		if (!idRaw || !Number.isInteger(areaId) || areaId <= 0) {
			return fail(400, { message: 'Invalid area id' });
		}

		const amountRaw = form.get('amount');
		const amount = Number(amountRaw);
		if (!amountRaw || !Number.isInteger(amount) || amount < 0) {
			return fail(400, { message: 'Invalid token amount' });
		}

		const canSeeOfflineAreas =
			locals.user.isAdmin || hasAccess(env.OFFLINE_AREA_ACCESS, locals.user.guildRoles);
		const area = await findVotableArea(areaId, canSeeOfflineAreas);
		if (!area) {
			return fail(400, { message: 'That area does not exist or is not visible to you.' });
		}

		const executor = pool as unknown as VoteQueryExecutor;
		let previousAmount: number;
		try {
			previousAmount = await dbAllocateTokens(
				executor,
				areaId,
				locals.user.discordId,
				locals.user.username,
				amount
			);
		} catch (err) {
			if (err instanceof TokenBudgetExceededError) {
				return fail(400, { message: 'Not enough tokens left in your budget.' });
			}
			logger.error({ err, areaId, amount }, 'Failed to allocate tokens');
			return fail(502, { message: 'Failed to save your token allocation.' });
		}
		notifyTokenChange(executor, area, locals.user.username, previousAmount, amount);
		return { success: true };
	},

	setPrimary: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { message: 'Login required.' });

		const pool = getPool(env.LOCAL_DATABASE_URL);
		if (!pool) return fail(503, { message: 'Voting is not available right now.' });

		const form = await request.formData();
		const idRaw = form.get('id');
		const areaId = Number(idRaw);
		if (!idRaw || !Number.isInteger(areaId) || areaId < 0) {
			return fail(400, { message: 'Invalid area id' });
		}

		let area: Area | null = null;
		if (areaId > 0) {
			const canSeeOfflineAreas =
				locals.user.isAdmin || hasAccess(env.OFFLINE_AREA_ACCESS, locals.user.guildRoles);
			area = await findVotableArea(areaId, canSeeOfflineAreas);
			if (!area) {
				return fail(400, { message: 'That area does not exist or is not visible to you.' });
			}
		}

		const executor = pool as unknown as VoteQueryExecutor;
		let autoAllocated: boolean;
		try {
			autoAllocated = await dbSetPrimary(
				executor,
				areaId,
				locals.user.discordId,
				locals.user.username
			);
		} catch (err) {
			if (err instanceof TokenBudgetExceededError) {
				return fail(400, { message: 'Not enough tokens left in your budget.' });
			}
			logger.error({ err, areaId }, 'Failed to set primary area');
			return fail(502, { message: 'Failed to update your primary area.' });
		}
		// Making an unfunded area primary auto-allocates 1 token to it.
		if (autoAllocated && area) notifyTokenChange(executor, area, locals.user.username, 0, 1);
		return { success: true };
	},

	setAreaTarget: async ({ request, locals }) => {
		if (!locals.user?.isAdmin) return fail(403, { message: 'Admin access required.' });

		const pool = getPool(env.LOCAL_DATABASE_URL);
		if (!pool) return fail(503, { message: 'Voting is not available right now.' });

		const form = await request.formData();
		const areaIdRaw = form.get('areaId');
		const areaId = Number(areaIdRaw);
		if (!areaIdRaw || !Number.isInteger(areaId) || areaId <= 0) {
			return fail(400, { message: 'Invalid area id' });
		}

		const modeRaw = form.get('mode');
		if (modeRaw !== 'static' && modeRaw !== 'workers') {
			return fail(400, { message: 'Invalid target mode' });
		}

		const staticValue = Number(form.get('staticValue'));
		if (!Number.isInteger(staticValue) || staticValue < 0) {
			return fail(400, { message: 'Target must be a whole number ≥ 0' });
		}

		const overrideRaw = form.get('workersPerTokenOverride');
		let workersPerTokenOverride: number | null = null;
		if (typeof overrideRaw === 'string' && overrideRaw.trim() !== '') {
			const parsed = Number(overrideRaw);
			if (!Number.isInteger(parsed) || parsed < 1) {
				return fail(400, { message: 'Workers-per-token override must be a whole number ≥ 1' });
			}
			workersPerTokenOverride = parsed;
		}

		try {
			await dbSetAreaTarget(
				pool as unknown as TargetQueryExecutor,
				areaId,
				modeRaw,
				staticValue,
				workersPerTokenOverride
			);
		} catch (err) {
			logger.error({ err, areaId }, 'Failed to save area vote target');
			return fail(502, { message: 'Failed to save the token target.' });
		}
		return { success: true };
	},

	saveGeofence: async ({ request, locals }) => {
		if (!locals.user?.isAdmin) return fail(403, { message: 'Admin access required.' });

		const form = await request.formData();
		const areaIdRaw = form.get('areaId');
		const areaId = Number(areaIdRaw);
		if (!areaIdRaw || !Number.isInteger(areaId)) return fail(400, { message: 'Invalid area id' });

		const syncKoji = form.get('syncKoji') === '1';

		const geofenceRaw = form.get('geofence');
		if (typeof geofenceRaw !== 'string' || !geofenceRaw.trim()) {
			return fail(400, { message: 'Geofence GeoJSON is required.' });
		}

		let parsed: unknown;
		try {
			parsed = JSON.parse(geofenceRaw);
		} catch {
			return fail(400, { message: 'Geofence must be valid JSON.' });
		}

		if (!isValidPolygonGeoJson(parsed)) {
			return fail(400, {
				message: 'Geofence must be a GeoJSON Polygon with at least 3 distinct coordinate pairs.'
			});
		}

		const baseUrl = env.DRAGONITE_URL;
		if (!baseUrl) return fail(503, { message: 'Dragonite is not configured.' });

		let areas;
		try {
			areas = await listAllAreas({ baseUrl });
		} catch (err) {
			logger.error({ err, areaId }, 'Failed to load areas before geofence save');
			return fail(502, { message: 'Failed to load current area data.' });
		}
		const area = areas.find((a) => a.id === areaId);
		if (!area) return fail(404, { message: 'Area not found.' });

		const pool = getPool(env.LOCAL_DATABASE_URL);
		if (pool) {
			try {
				await archiveGeofence(pool as unknown as ArchiveQueryExecutor, {
					areaId,
					areaName: area.name,
					geofence: area.geofence,
					archivedByDiscordId: locals.user.discordId,
					archivedByUsername: locals.user.username
				});
			} catch (err) {
				logger.warn({ err, areaId }, 'Failed to archive previous geofence (continuing with save)');
			}
		}

		try {
			await patchArea({ baseUrl }, areaId, { geofence: parsed });
		} catch (err) {
			logger.error({ err, areaId }, 'Failed to save geofence');
			return fail(502, { message: 'Failed to save geofence — Dragonite may be unreachable.' });
		}
		if (!syncKoji) return { success: true };
		return { success: true, koji: await syncAreaGeofenceToKoji(areaId, area.name, parsed) };
	},

	saveRoute: async ({ request, locals }) => {
		if (!locals.user?.isAdmin) return fail(403, { message: 'Admin access required.' });

		const form = await request.formData();
		const areaIdRaw = form.get('areaId');
		const areaId = Number(areaIdRaw);
		if (!areaIdRaw || !Number.isInteger(areaId)) return fail(400, { message: 'Invalid area id' });

		const cacheKeyRaw = form.get('cacheKey');
		const cacheKey = typeof cacheKeyRaw === 'string' ? cacheKeyRaw.trim() : '';
		if (!cacheKey || !/^[a-zA-Z0-9_-]+\.txt$/.test(cacheKey)) {
			return fail(400, { message: 'Invalid cache key.' });
		}

		const cachePath = join(process.cwd(), 'route-backups', cacheKey);
		let routeText: string;
		try {
			routeText = await readFile(cachePath, 'utf8');
		} catch {
			return fail(404, {
				message: `Cache file not found: ${cacheKey}. You may need to regenerate the route.`
			});
		}

		const route = parseRouteText(routeText);
		if (route.length === 0) {
			return fail(400, { message: 'Cached route file was empty or unreadable.', cacheKey });
		}

		const baseUrl = env.DRAGONITE_URL;
		if (!baseUrl) return fail(503, { message: 'Dragonite is not configured.', cacheKey });

		try {
			await patchArea({ baseUrl }, areaId, { pokemon_mode: { route } });
		} catch (err) {
			logger.error({ err, areaId, cacheKey }, 'Failed to save Kōji route');
			return fail(502, {
				message: 'Failed to save route — Dragonite may be unreachable.',
				cacheKey
			});
		}

		await unlink(cachePath).catch(() => {});

		// Best-effort — don't fail the save if the local DB is unavailable.
		const runPool = getPool(env.LOCAL_DATABASE_URL);
		if (runPool) {
			const routeType = cacheKey.startsWith('bootstrap_') ? 'bootstrap' : 'spawnpoint';
			await recordRouteRun(runPool as unknown as RouteRunQueryExecutor, {
				areaId,
				routeType,
				stopCount: route.length
			}).catch((err: unknown) => {
				logger.warn({ err, areaId, routeType }, 'Failed to record route run');
			});
		}

		return { success: true };
	},

	restoreGeofence: async ({ request, locals }) => {
		if (!locals.user?.isAdmin) return fail(403, { message: 'Admin access required.' });

		const form = await request.formData();
		const archiveIdRaw = form.get('archiveId');
		const archiveId = Number(archiveIdRaw);
		if (!archiveIdRaw || !Number.isInteger(archiveId)) {
			return fail(400, { message: 'Invalid archive id' });
		}
		const syncKoji = form.get('syncKoji') === '1';

		const pool = getPool(env.LOCAL_DATABASE_URL);
		if (!pool) return fail(503, { message: 'Geofence history is not available right now.' });
		const archiveExecutor = pool as unknown as ArchiveQueryExecutor;

		const archived = await getArchiveEntry(archiveExecutor, archiveId);
		if (!archived) return fail(404, { message: 'Archive entry not found.' });

		const baseUrl = env.DRAGONITE_URL;
		if (!baseUrl) return fail(503, { message: 'Dragonite is not configured.' });

		let areas;
		try {
			areas = await listAllAreas({ baseUrl });
		} catch (err) {
			logger.error(
				{ err, areaId: archived.areaId },
				'Failed to load areas before geofence restore'
			);
			return fail(502, { message: 'Failed to load current area data.' });
		}
		const area = areas.find((a) => a.id === archived.areaId);
		if (!area) return fail(404, { message: 'Area not found.' });

		try {
			await archiveGeofence(archiveExecutor, {
				areaId: archived.areaId,
				areaName: area.name,
				geofence: area.geofence,
				archivedByDiscordId: locals.user.discordId,
				archivedByUsername: locals.user.username
			});
		} catch (err) {
			logger.warn(
				{ err, areaId: archived.areaId },
				'Failed to archive current geofence before restore (continuing)'
			);
		}

		try {
			await patchArea({ baseUrl }, archived.areaId, { geofence: archived.geofence });
		} catch (err) {
			logger.error({ err, areaId: archived.areaId }, 'Failed to restore geofence');
			return fail(502, { message: 'Failed to restore geofence — Dragonite may be unreachable.' });
		}
		if (!syncKoji || !archived.geofence) return { success: true };
		return {
			success: true,
			koji: await syncAreaGeofenceToKoji(archived.areaId, area.name, archived.geofence)
		};
	},

	deleteGeofenceArchive: async ({ request, locals }) => {
		if (!locals.user?.isAdmin) return fail(403, { message: 'Admin access required.' });

		const form = await request.formData();
		const archiveIdRaw = form.get('archiveId');
		const archiveId = Number(archiveIdRaw);
		if (!archiveIdRaw || !Number.isInteger(archiveId)) {
			return fail(400, { message: 'Invalid archive id' });
		}

		const pool = getPool(env.LOCAL_DATABASE_URL);
		if (!pool) return fail(503, { message: 'Geofence history is not available right now.' });

		await dbDeleteGeofenceArchive(pool as unknown as ArchiveQueryExecutor, archiveId);
		return { success: true };
	},

	submitRequest: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { message: 'Login required to submit a request.' });

		const pool = getPool(env.LOCAL_DATABASE_URL);
		if (!pool) return fail(503, { message: 'Area requests are not available right now.' });
		const executor = pool as unknown as RequestQueryExecutor;

		const form = await request.formData();
		const type = form.get('type');
		const geofenceRaw = form.get('geofence');
		const note = form.get('note');
		const existingAreaIdRaw = form.get('existingAreaId');
		const existingAreaName = form.get('existingAreaName');

		if (type !== 'addition' && type !== 'removal') {
			return fail(400, { message: 'Invalid request type.' });
		}
		if (typeof note !== 'string' || !note.trim()) {
			return fail(400, { message: 'A note explaining your request is required.' });
		}
		if (note.length > MAX_REQUEST_NOTE_LENGTH) {
			return fail(400, {
				message: `Note is too long (max ${MAX_REQUEST_NOTE_LENGTH} characters).`
			});
		}
		if (typeof geofenceRaw !== 'string' || !geofenceRaw.trim()) {
			return fail(400, { message: 'Geofence is required.' });
		}

		let parsed: unknown;
		try {
			parsed = JSON.parse(geofenceRaw);
		} catch {
			return fail(400, { message: 'Geofence must be valid JSON.' });
		}

		if (type === 'addition' && !isValidPolygonGeoJson(parsed)) {
			return fail(400, {
				message: 'Geofence must be a GeoJSON Polygon with at least 3 distinct coordinate pairs.'
			});
		}
		if (type === 'addition') {
			const problem = requestGeofenceProblem(parsed as GeoJsonPolygon);
			if (problem) return fail(400, { message: problem });
		}

		const pending = (await listMyRequests(executor, locals.user.discordId)).filter(
			(r) => r.status === 'pending'
		).length;
		if (pending >= MAX_PENDING_REQUESTS) {
			return fail(429, {
				message: `You already have ${MAX_PENDING_REQUESTS} pending requests. Wait for those to be reviewed.`
			});
		}
		if (
			type === 'addition' &&
			((typeof existingAreaIdRaw === 'string' && existingAreaIdRaw.trim()) ||
				(typeof existingAreaName === 'string' && existingAreaName.trim()))
		) {
			// existingAreaId/Name are a removal-only concept (the area being
			// removed) — an addition request naming one means the client tried
			// to submit an "Add" request for a geofence it captured from an
			// already-running area (Select Area mode auto-sets Type to
			// "Remove Area"; this rejects a manual switch back to "Add Area").
			return fail(400, { message: 'An addition request cannot reference an existing area.' });
		}

		let temporary: { startsOn: string; expiresOn: string } | null = null;
		if (form.get('temporary') === '1') {
			if (type === 'removal')
				return fail(400, { message: 'Only area additions can be temporary.' });
			const startsOn = form.get('startsOn');
			const expiresOn = form.get('expiresOn');
			const dateError = validateTemporaryDates(
				typeof startsOn === 'string' ? startsOn : '',
				typeof expiresOn === 'string' ? expiresOn : '',
				tempAreaToday()
			);
			if (dateError) return fail(400, { message: dateError });
			temporary = { startsOn: startsOn as string, expiresOn: expiresOn as string };
		}

		// The area identity of a removal request is resolved server-side: the
		// client's existingAreaName/geofence are labels an admin later acts on,
		// so they must come from Dragonite rather than the submitted form.
		let geofence: GeoJsonGeometry;
		let existingAreaId: number | null;
		let existingAreaLabel: string | null;

		if (type === 'removal') {
			const requestedAreaId =
				typeof existingAreaIdRaw === 'string' && existingAreaIdRaw
					? Number(existingAreaIdRaw)
					: null;
			if (requestedAreaId === null || !Number.isInteger(requestedAreaId)) {
				return fail(400, { message: 'An existing area must be selected for a removal request.' });
			}

			const baseUrl = env.DRAGONITE_URL;
			if (!baseUrl) return fail(503, { message: 'Dragonite is not configured.' });

			let areas;
			try {
				areas = await listAllAreas({ baseUrl });
			} catch (err) {
				logger.error({ err, areaId: requestedAreaId }, 'Failed to load areas before area request');
				return fail(502, { message: 'Failed to load current area data.' });
			}

			const area = areas.find((a) => a.id === requestedAreaId);
			if (!area) return fail(404, { message: 'That area does not exist.' });

			const areaGeofence = area.geofence;
			if (
				!areaGeofence ||
				(areaGeofence.type !== 'Polygon' && areaGeofence.type !== 'MultiPolygon')
			) {
				return fail(400, { message: 'Geofence must be a GeoJSON Polygon or MultiPolygon.' });
			}

			geofence = areaGeofence;
			existingAreaId = area.id;
			existingAreaLabel = area.name;
		} else {
			geofence = parsed as GeoJsonGeometry;
			existingAreaId = null;
			existingAreaLabel = null;
		}

		try {
			await dbSubmitRequest(executor, {
				type,
				geofence: JSON.stringify(geofence),
				existingAreaId,
				existingAreaName: existingAreaLabel,
				userNote: note.trim(),
				discordId: locals.user.discordId,
				username: locals.user.username,
				temporary
			});
		} catch (err) {
			logger.error({ err, discordId: locals.user.discordId }, 'Failed to submit area request');
			return fail(502, { message: 'Failed to submit your request.' });
		}

		sendRequestWebhook(type, locals.user.username, note.trim(), existingAreaLabel, geofence).catch(
			() => {}
		);

		return { success: true };
	},

	deleteRequest: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { message: 'Login required.' });

		const pool = getPool(env.LOCAL_DATABASE_URL);
		if (!pool) return fail(503, { message: 'Area requests are not available right now.' });
		const executor = pool as unknown as RequestQueryExecutor;

		const form = await request.formData();
		const idRaw = form.get('id');
		const id = Number(idRaw);
		if (!idRaw || !Number.isInteger(id)) return fail(400, { message: 'Invalid request id.' });

		const deleted = await deleteMyRequest(executor, id, locals.user.discordId);
		if (!deleted) return fail(404, { message: 'Request not found or not yours.' });

		return { success: true };
	}
};
