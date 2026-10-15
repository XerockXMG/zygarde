import { error, fail } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { getPool } from '$lib/server/db';
import { logger } from '$lib/server/logger';
import { listAllAreas } from '$lib/features/area-management/server/dragonite';
import type { Area } from '$lib/features/area-management/types';
import { getAreaTokenTotals } from '$lib/features/voting/server/votes';
import { getAreaTargetConfigs } from '$lib/features/voting/server/targets';
import { getVotingSettings, setAutoscaleInterval } from '$lib/features/voting/server/settings';
import { getAutoscaleConfigs } from '$lib/features/autoscale/server/state';
import { buildAutoscaleStatus } from '$lib/features/autoscale/server/status';
import {
	runAutoscaleSync,
	type QueryExecutor as AutoscaleQueryExecutor
} from '$lib/features/autoscale/server/sync';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user?.isAdmin) error(403, 'Admin access required.');

	const pool = getPool(env.LOCAL_DATABASE_URL);
	if (!pool) {
		error(503, 'Autoscale settings require LOCAL_DATABASE_URL to be configured.');
	}
	// The sync's executor type is the union of every module's, so it covers
	// each query below.
	const executor = pool as unknown as AutoscaleQueryExecutor;

	const [votingSettings, autoscaleConfigs, targetConfigs, tokenTotals] = await Promise.all([
		getVotingSettings(executor),
		getAutoscaleConfigs(executor),
		getAreaTargetConfigs(executor),
		getAreaTokenTotals(executor)
	]);

	// The status table needs area names and live worker counts from
	// Dragonite; the settings still work when it's down.
	let areas: Area[] = [];
	let dragoniteError: string | null = null;
	if (!env.DRAGONITE_URL) {
		dragoniteError = 'Dragonite is not configured.';
	} else {
		try {
			areas = await listAllAreas({ baseUrl: env.DRAGONITE_URL });
		} catch (err) {
			logger.error({ err }, 'Failed to load areas for the autoscale page');
			dragoniteError = 'Could not reach Dragonite, so area status is unavailable.';
		}
	}

	return {
		autoscaleIntervalMinutes: votingSettings.autoscaleIntervalMinutes,
		rows: buildAutoscaleStatus(
			areas,
			autoscaleConfigs,
			targetConfigs,
			tokenTotals,
			votingSettings.workersPerToken
		),
		dragoniteError
	};
};

export const actions: Actions = {
	saveInterval: async ({ request, locals }) => {
		if (!locals.user?.isAdmin) return fail(403, { message: 'Admin access required.' });

		const form = await request.formData();
		const raw = form.get('autoscaleIntervalMinutes');
		if (typeof raw !== 'string') return fail(400, { message: 'Invalid settings payload.' });
		const minutes = parseInt(raw, 10);
		if (isNaN(minutes) || minutes < 1 || minutes > 1440) {
			return fail(400, { message: 'Autoscale sync interval must be 1–1440 minutes' });
		}

		const pool = getPool(env.LOCAL_DATABASE_URL);
		if (!pool) {
			return fail(503, { message: 'Settings require LOCAL_DATABASE_URL to be configured.' });
		}

		await setAutoscaleInterval(pool as unknown as AutoscaleQueryExecutor, minutes);
		return { success: true };
	},

	// Runs a sync pass immediately rather than waiting out the scheduler's
	// current interval — most useful right after enabling autoscale on an
	// area, or after lowering autoscaleIntervalMinutes (which only takes
	// effect on the *next* scheduled tick, not the one already pending).
	runAutoscaleNow: async ({ locals }) => {
		if (!locals.user?.isAdmin) return fail(403, { message: 'Admin access required.' });

		if (!env.DRAGONITE_URL) return fail(503, { message: 'Dragonite is not configured.' });
		const pool = getPool(env.LOCAL_DATABASE_URL);
		if (!pool) return fail(503, { message: 'Autoscale is not available right now.' });
		const executor = pool as unknown as AutoscaleQueryExecutor;

		try {
			const result = await runAutoscaleSync({ baseUrl: env.DRAGONITE_URL }, executor);
			return { success: true, autoscaleUpdatedCount: result.updated.length };
		} catch (err) {
			logger.error({ err }, 'Manual autoscale sync run failed');
			return fail(502, { message: 'Autoscale sync failed — Dragonite may be unreachable.' });
		}
	}
};
