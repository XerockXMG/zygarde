// src/routes/admin/dashboard/+page.server.ts
import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { getPool } from '$lib/server/db';
import { logger } from '$lib/server/logger';
import { listAllAreas } from '$lib/features/area-management/server/dragonite';
import type { Area } from '$lib/features/area-management/types';
import {
	getAreaTargetConfigs,
	type QueryExecutor as TargetQueryExecutor
} from '$lib/features/voting/server/targets';
import {
	getVotingSettings,
	DEFAULT_VOTING_SETTINGS,
	type QueryExecutor as VotingSettingsQueryExecutor
} from '$lib/features/voting/server/settings';
import {
	getAutoscaleConfigs,
	type QueryExecutor as AutoscaleQueryExecutor
} from '$lib/features/autoscale/server/state';
import {
	getAreaTokenTotals,
	listUserTiers,
	type QueryExecutor as VoteQueryExecutor
} from '$lib/features/voting/server/votes';
import { computeDashboardStats } from '$lib/features/admin-dashboard/server/computeStats';
import {
	computeAreaRanking,
	computeVoteReport,
	getDashboardVoteRows,
	type QueryExecutor as VoteReportQueryExecutor
} from '$lib/features/admin-dashboard/server/voteReport';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user?.isAdmin) error(403, 'Admin access required.');

	let areas: Area[] = [];
	if (env.DRAGONITE_URL) {
		try {
			areas = await listAllAreas({ baseUrl: env.DRAGONITE_URL });
		} catch (err) {
			logger.error({ err }, 'Failed to load areas for admin dashboard');
		}
	}

	const pool = getPool(env.LOCAL_DATABASE_URL);
	const targetConfigs = pool
		? await getAreaTargetConfigs(pool as unknown as TargetQueryExecutor)
		: {};
	const votingSettings = pool
		? await getVotingSettings(pool as unknown as VotingSettingsQueryExecutor)
		: DEFAULT_VOTING_SETTINGS;
	const autoscaleConfigs = pool
		? await getAutoscaleConfigs(pool as unknown as AutoscaleQueryExecutor)
		: {};
	const tokenTotals = pool ? await getAreaTokenTotals(pool as unknown as VoteQueryExecutor) : {};
	const userTiers = pool ? await listUserTiers(pool as unknown as VoteQueryExecutor) : [];
	const voteRows = pool
		? await getDashboardVoteRows(pool as unknown as VoteReportQueryExecutor)
		: [];

	const stats = computeDashboardStats({
		areas,
		targetConfigs,
		autoscaleConfigs,
		tokenTotals,
		globalWorkersPerToken: votingSettings.workersPerToken,
		userWeights: userTiers.map((u) => u.weight)
	});

	const voteReport = computeVoteReport(areas, voteRows);
	const areaRanking = computeAreaRanking({
		areas,
		voteRows,
		targetConfigs,
		autoscaleConfigs,
		globalWorkersPerToken: votingSettings.workersPerToken
	});

	return { stats, voteReport, areaRanking };
};
