// src/routes/admin/requests/+page.server.ts
import { error, fail } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { getPool } from '$lib/server/db';
import { logger } from '$lib/server/logger';
import {
	patchArea,
	createArea,
	listAllAreas,
	parseQuestHours
} from '$lib/features/area-management/server/dragonite';
import { saveGeofence as saveKojiGeofence } from '$lib/features/area-management/server/koji';
import { checkKojiGeofenceName } from '$lib/features/area-management/server/kojiGeofenceSync';
import { isValidPolygonGeoJson } from '$lib/features/map/geometry';
import {
	listRequestsForAdmin,
	countRequestsByStatus,
	getRequestById,
	resolveRequest as dbResolveRequest,
	approveAsCreated,
	type RequestStatus,
	type QueryExecutor as RequestQueryExecutor
} from '$lib/features/area-requests/server/requests';
import { sendResolutionDm } from '$lib/features/area-requests/server/discord';
import {
	getTileSettings,
	DEFAULT_TILE_SETTINGS,
	type QueryExecutor as TileSettingsQueryExecutor
} from '$lib/features/map/server/tileSettings';
import { parseStartView } from '$lib/features/map/server/startView';
import {
	setAreaTarget as dbSetAreaTarget,
	type QueryExecutor as TargetQueryExecutor
} from '$lib/features/voting/server/targets';
import {
	enableAutoscale as dbEnableAutoscale,
	type QueryExecutor as AutoscaleQueryExecutor
} from '$lib/features/autoscale/server/state';
import type { AreaMapSummary } from '$lib/features/area-requests/types';
import type { PageServerLoad, Actions } from './$types';

const VALID_STATUSES: (RequestStatus | 'all')[] = ['pending', 'approved', 'rejected', 'all'];

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user?.isAdmin) error(403, 'Admin access required.');

	const pool = getPool(env.LOCAL_DATABASE_URL);
	if (!pool) error(503, 'Area requests require LOCAL_DATABASE_URL to be configured.');
	const executor = pool as unknown as RequestQueryExecutor;

	const statusParam = url.searchParams.get('status') ?? 'pending';
	const statusFilter = VALID_STATUSES.includes(statusParam as RequestStatus | 'all')
		? (statusParam as RequestStatus | 'all')
		: 'pending';

	const [requests, statusCounts] = await Promise.all([
		listRequestsForAdmin(executor, statusFilter),
		countRequestsByStatus(executor)
	]);

	let areas: AreaMapSummary[] = [];
	if (env.DRAGONITE_URL) {
		try {
			const fullAreas = await listAllAreas({ baseUrl: env.DRAGONITE_URL });
			areas = fullAreas.map((a) => ({
				id: a.id,
				name: a.name,
				enabled: a.enabled,
				geofence: a.geofence
			}));
		} catch (err) {
			logger.error(
				{ err },
				'Failed to load areas for request-review map — map will show no background'
			);
		}
	}

	const tileSettingsExecutor = pool as unknown as TileSettingsQueryExecutor;
	const tileSettings = await getTileSettings(tileSettingsExecutor).catch(
		() => DEFAULT_TILE_SETTINGS
	);

	const startView = parseStartView(env.START_LAT, env.START_LON, env.START_ZOOM);
	return { requests, statusFilter, statusCounts, areas, tileSettings, startView };
};

export const actions: Actions = {
	resolveRequest: async ({ request, locals, url }) => {
		if (!locals.user?.isAdmin) return fail(403, { message: 'Admin access required.' });

		const pool = getPool(env.LOCAL_DATABASE_URL);
		if (!pool) return fail(503, { message: 'Area requests are not available right now.' });
		const executor = pool as unknown as RequestQueryExecutor;

		const form = await request.formData();
		const id = Number(form.get('id'));
		const status = form.get('status');
		const adminNote = form.get('adminNote')?.toString().trim() || null;

		if (!id || !Number.isInteger(id)) return fail(400, { message: 'Invalid request id.' });
		if (status !== 'approved' && status !== 'rejected') {
			return fail(400, { message: 'Invalid status.' });
		}

		const reqRow = await getRequestById(executor, id);
		if (!reqRow) return fail(404, { message: 'Request not found.' });
		if (reqRow.status !== 'pending') return fail(409, { message: 'Request already resolved.' });

		// Disable the area *before* marking the row approved, so a failed or
		// misconfigured patch can't leave the DB claiming a removal happened.
		if (status === 'approved' && reqRow.type === 'removal') {
			if (!reqRow.existing_area_id) {
				return fail(400, { message: 'This removal request has no target area.' });
			}

			const baseUrl = env.DRAGONITE_URL;
			if (!baseUrl) return fail(503, { message: 'Dragonite is not configured.' });

			try {
				await patchArea({ baseUrl }, reqRow.existing_area_id, { enabled: false });
			} catch (err) {
				logger.error(
					{ err, requestId: id, areaId: reqRow.existing_area_id },
					'Failed to disable area for approved removal request'
				);
				return fail(502, { message: 'Failed to disable the area — Dragonite may be unreachable.' });
			}
		}

		try {
			await dbResolveRequest(
				executor,
				id,
				status,
				adminNote,
				locals.user.discordId,
				locals.user.username
			);
		} catch (err) {
			logger.error({ err, requestId: id }, 'Failed to resolve area request');
			return fail(502, { message: 'Failed to resolve the request.' });
		}

		sendResolutionDm(
			reqRow.discord_id,
			reqRow.type,
			status,
			adminNote,
			url.origin, // the site's own address (ORIGIN in production)
			JSON.parse(reqRow.geofence)
		).catch(() => {});

		return { success: true };
	},

	createArea: async ({ request, locals, url }) => {
		if (!locals.user?.isAdmin) return fail(403, { message: 'Admin access required.' });

		const pool = getPool(env.LOCAL_DATABASE_URL);
		if (!pool) return fail(503, { message: 'Area requests are not available right now.' });
		const executor = pool as unknown as RequestQueryExecutor;

		const baseUrl = env.DRAGONITE_URL;
		if (!baseUrl) return fail(503, { message: 'Dragonite is not configured.' });

		const form = await request.formData();
		const requestId = Number(form.get('requestId'));
		const name = form.get('name')?.toString().trim();
		const enabled = form.get('enabled') === '1';
		const pokemonWorkers = Math.max(0, Number(form.get('pokemon_workers') ?? 0));
		const fortWorkers = Math.max(0, Number(form.get('fort_workers') ?? 0));
		const questWorkers = Math.max(0, Number(form.get('quest_workers') ?? 0));
		const rareWorkers = Math.max(0, Number(form.get('rare_workers') ?? 0));
		const geofenceRaw = form.get('geofence')?.toString().trim() ?? '';
		const adminNote = form.get('adminNote')?.toString().trim() || null;

		const setTarget = form.get('setTarget') === '1';
		const targetModeRaw = form.get('targetMode');
		const enableAutoscaleFlag = form.get('enableAutoscale') === '1';
		const setKojiGeofence = form.get('setKojiGeofence') === '1';
		const kojiProject = form.get('kojiProject')?.toString().trim() || null;

		if (!requestId || !Number.isInteger(requestId))
			return fail(400, { message: 'Invalid request id.' });
		if (!name) return fail(400, { message: 'Area name is required.' });

		let targetMode: 'static' | 'workers' = 'static';
		let targetStaticValue = 0;
		let targetWorkersPerTokenOverride: number | null = null;
		if (setTarget) {
			if (targetModeRaw !== 'static' && targetModeRaw !== 'workers') {
				return fail(400, { message: 'Invalid target mode.' });
			}
			targetMode = targetModeRaw;

			targetStaticValue = Number(form.get('targetStaticValue'));
			if (!Number.isInteger(targetStaticValue) || targetStaticValue < 0) {
				return fail(400, { message: 'Target must be a whole number ≥ 0.' });
			}

			const overrideRaw = form.get('targetWorkersPerTokenOverride');
			if (typeof overrideRaw === 'string' && overrideRaw.trim() !== '') {
				const parsed = Number(overrideRaw);
				if (!Number.isInteger(parsed) || parsed < 1) {
					return fail(400, { message: 'Workers-per-token override must be a whole number ≥ 1.' });
				}
				targetWorkersPerTokenOverride = parsed;
			}
		}
		if (enableAutoscaleFlag && !setTarget) {
			return fail(400, { message: 'Set a token target before enabling autoscale.' });
		}

		let kojiGeofenceName = '';
		let kojiBaseUrl = '';
		if (setKojiGeofence) {
			const rawName = form.get('kojiGeofenceName')?.toString().trim();
			if (!rawName) return fail(400, { message: 'Kōji geofence name is required.' });
			kojiGeofenceName = rawName;

			if (!env.KOJI_URL) return fail(503, { message: 'Kōji is not configured.' });
			kojiBaseUrl = env.KOJI_URL;

			// save-koji upserts by name and would wipe an existing fence's parent,
			// mode, and properties — so refuse up front, before the Dragonite area
			// exists, rather than clobbering someone else's geofence.
			let nameCheck;
			try {
				nameCheck = await checkKojiGeofenceName(
					{ baseUrl: kojiBaseUrl, secret: env.KOJI_SECRET },
					kojiGeofenceName
				);
			} catch (err) {
				logger.error({ err, kojiGeofenceName }, 'Failed to check Kōji for an existing geofence');
				return fail(502, {
					message:
						'Could not check Kōji for an existing geofence with that name — try again, or untick the Kōji option.'
				});
			}
			if (nameCheck === 'taken') {
				return fail(409, {
					message: `Kōji already has a geofence named "${kojiGeofenceName}" (names match case-insensitively). Pick a different Kōji name, or untick the Kōji option and edit that geofence instead.`
				});
			}
			if (nameCheck === 'unverifiable') {
				return fail(400, { message: 'Kōji geofence name cannot be only digits.' });
			}
		}

		let parsedGeofence: unknown;
		try {
			parsedGeofence = JSON.parse(geofenceRaw);
		} catch {
			return fail(400, { message: 'Geofence must be valid JSON.' });
		}
		if (!isValidPolygonGeoJson(parsedGeofence)) {
			return fail(400, {
				message: 'Geofence must be a GeoJSON Polygon with at least 3 distinct coordinate pairs.'
			});
		}

		const reqRow = await getRequestById(executor, requestId);
		if (!reqRow) return fail(404, { message: 'Request not found.' });
		if (reqRow.status !== 'pending') return fail(409, { message: 'Request already resolved.' });

		let newAreaId: number;
		try {
			const created = await createArea(
				{ baseUrl },
				{
					name,
					enabled,
					geofence: parsedGeofence,
					pokemonWorkers,
					fortWorkers,
					questWorkers,
					rareWorkers,
					questHours: parseQuestHours(env.DEFAULT_QUEST_HOURS)
				}
			);
			newAreaId = created.id;
		} catch (err) {
			logger.error({ err, requestId }, 'Failed to create area from request');
			return fail(502, { message: 'Failed to create the area — Dragonite may be unreachable.' });
		}

		try {
			await approveAsCreated(
				executor,
				requestId,
				adminNote,
				locals.user.discordId,
				locals.user.username,
				newAreaId
			);
		} catch (err) {
			logger.error(
				{ err, requestId, newAreaId },
				'Area created but failed to mark request approved — resolve manually'
			);
		}

		// Area (and the request row) are already committed at this point —
		// a failure here is logged but doesn't fail the action, same as the
		// approveAsCreated call above.
		if (setTarget) {
			try {
				await dbSetAreaTarget(
					pool as unknown as TargetQueryExecutor,
					newAreaId,
					targetMode,
					targetStaticValue,
					targetWorkersPerTokenOverride
				);
			} catch (err) {
				logger.error({ err, newAreaId }, 'Area created but failed to save its token target');
			}
		}
		if (enableAutoscaleFlag) {
			try {
				await dbEnableAutoscale(
					pool as unknown as AutoscaleQueryExecutor,
					newAreaId,
					pokemonWorkers
				);
			} catch (err) {
				logger.error({ err, newAreaId }, 'Area created but failed to enable autoscale');
			}
		}
		if (setKojiGeofence) {
			try {
				await saveKojiGeofence(
					{ baseUrl: kojiBaseUrl, secret: env.KOJI_SECRET },
					{ name: kojiGeofenceName, geometry: parsedGeofence, parent: kojiProject }
				);
			} catch (err) {
				logger.error(
					{ err, newAreaId, kojiGeofenceName },
					'Area created but failed to save its geofence to Kōji'
				);
			}
		}

		sendResolutionDm(
			reqRow.discord_id,
			'addition',
			'approved',
			adminNote,
			url.origin, // the site's own address (ORIGIN in production)
			parsedGeofence
		).catch(() => {});

		return { success: true, areaId: newAreaId, areaName: name };
	}
};
