/**
 * In-process periodic jobs, started once at boot from hooks.server.ts —
 * the subscription role-check sync (see features/subscriptions/server/sync.ts),
 * the worker-autoscale sync (see features/autoscale/server/sync.ts) and the
 * orphaned-vote cleanup (see features/voting/server/orphans.ts).
 * Errors are logged and swallowed; a job failing here must never take down
 * the app.
 */
import { env } from '$env/dynamic/private';
import { getPool } from './db';
import { logger } from './logger';
import { NO_ACCESS_TIER } from '$lib/features/voting/server/tiers';
import { parseCsvIds } from '$lib/utils/csv';
import {
	getVotingSettings,
	DEFAULT_VOTING_SETTINGS,
	type QueryExecutor as SettingsQueryExecutor
} from '$lib/features/voting/server/settings';
import {
	syncSubscriptionRoleChecks,
	type QueryExecutor as LocalQueryExecutor
} from '$lib/features/subscriptions/server/sync';
import {
	runAutoscaleSync,
	type QueryExecutor as AutoscaleQueryExecutor
} from '$lib/features/autoscale/server/sync';
import { listAllAreas } from '$lib/features/area-management/server/dragonite';
import { cleanupOrphanedVotes } from '$lib/features/voting/server/orphans';
import type { QueryExecutor as VoteQueryExecutor } from '$lib/features/voting/server/votes';

// Once a day is plenty of granularity for a grace period measured in days.
const SUBSCRIPTION_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;

async function runSubscriptionSync(): Promise<void> {
	const localPool = getPool(env.LOCAL_DATABASE_URL);
	if (!localPool) return;

	try {
		const settings = await getVotingSettings(localPool as unknown as SettingsQueryExecutor);

		// A user who no longer holds the required Discord role gets no
		// tokens, full stop — not a quiet fallback to whatever the cheapest
		// configured paid tier happens to be (see NO_ACCESS_TIER's own doc
		// comment in tiers.ts).
		const result = await syncSubscriptionRoleChecks(
			localPool as unknown as LocalQueryExecutor,
			env.DISCORD_BOT_TOKEN ?? '',
			env.SUBSCRIPTION_REQUIRED_ROLES ?? '',
			parseCsvIds(env.DISCORD_GUILD_IDS),
			settings.subscriptionGracePeriodDays,
			NO_ACCESS_TIER.name,
			NO_ACCESS_TIER.weight
		);

		if (result.downgraded.length > 0) {
			logger.info(
				{ count: result.downgraded.length, discordIds: result.downgraded },
				'Subscription role-check sync downgraded lapsed users'
			);
		} else {
			logger.info('Subscription role-check sync ran, no users needed downgrading');
		}
	} catch (err) {
		logger.error({ err }, 'Subscription role-check sync failed');
	}
}

let started = false;

export function startSubscriptionSyncScheduler(): void {
	if (started) return;
	started = true;
	if (!env.LOCAL_DATABASE_URL || !env.DISCORD_BOT_TOKEN || !env.SUBSCRIPTION_REQUIRED_ROLES) return;

	void runSubscriptionSync();
	setInterval(() => {
		void runSubscriptionSync();
	}, SUBSCRIPTION_SYNC_INTERVAL_MS);
}

async function runWorkerAutoscaleSync(): Promise<void> {
	const localPool = getPool(env.LOCAL_DATABASE_URL);
	const baseUrl = env.DRAGONITE_URL;
	if (!localPool || !baseUrl) return;

	try {
		const result = await runAutoscaleSync(
			{ baseUrl },
			localPool as unknown as AutoscaleQueryExecutor
		);
		if (result.updated.length > 0) {
			logger.info({ areaIds: result.updated }, 'Worker autoscale sync updated area worker counts');
		}
	} catch (err) {
		logger.error({ err }, 'Worker autoscale sync failed');
	}
}

async function currentAutoscaleIntervalMs(): Promise<number> {
	const localPool = getPool(env.LOCAL_DATABASE_URL);
	if (!localPool) return DEFAULT_VOTING_SETTINGS.autoscaleIntervalMinutes * 60_000;
	try {
		const settings = await getVotingSettings(localPool as unknown as SettingsQueryExecutor);
		return settings.autoscaleIntervalMinutes * 60_000;
	} catch {
		return DEFAULT_VOTING_SETTINGS.autoscaleIntervalMinutes * 60_000;
	}
}

let autoscaleStarted = false;

/**
 * Self-rescheduling with setTimeout (not setInterval) rather than a fixed
 * interval, so an admin change to voting_settings.autoscale_interval_minutes
 * (see /admin/autoscale) takes effect on the very next tick instead of requiring
 * an app restart.
 */
export function startWorkerAutoscaleScheduler(): void {
	if (autoscaleStarted) return;
	autoscaleStarted = true;
	if (!env.LOCAL_DATABASE_URL || !env.DRAGONITE_URL) return;

	const tick = async () => {
		await runWorkerAutoscaleSync();
		setTimeout(() => void tick(), await currentAutoscaleIntervalMs());
	};

	void tick();
}

// Hourly is plenty: a deleted area's votes are freed within about two hours
// (it must be missing on two consecutive runs, see orphans.ts).
const ORPHAN_VOTE_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
let orphanAreaIdsLastRun = new Set<number>();

async function runOrphanVoteCleanup(): Promise<void> {
	const localPool = getPool(env.LOCAL_DATABASE_URL);
	const baseUrl = env.DRAGONITE_URL;
	if (!localPool || !baseUrl) return;

	try {
		const areas = await listAllAreas({ baseUrl });
		const result = await cleanupOrphanedVotes(
			localPool as unknown as VoteQueryExecutor,
			new Set(areas.map((a) => a.id)),
			orphanAreaIdsLastRun
		);
		orphanAreaIdsLastRun = new Set([...result.pendingAreaIds, ...result.removedAreaIds]);

		if (result.removedAreaIds.length > 0) {
			logger.info(
				{
					areaIds: result.removedAreaIds,
					freedTokens: result.freedTokens,
					removedPrimaries: result.removedPrimaries
				},
				'Removed votes on deleted areas and returned the tokens'
			);
		}
		if (result.pendingAreaIds.length > 0) {
			logger.info(
				{ areaIds: result.pendingAreaIds },
				'Votes reference areas missing from Dragonite; removing them next run if still missing'
			);
		}
	} catch (err) {
		// A Dragonite outage must not count as "every area is missing"
		orphanAreaIdsLastRun = new Set();
		logger.error({ err }, 'Orphaned vote cleanup failed');
	}
}

let orphanCleanupStarted = false;

export function startOrphanVoteCleanupScheduler(): void {
	if (orphanCleanupStarted) return;
	orphanCleanupStarted = true;
	if (!env.LOCAL_DATABASE_URL || !env.DRAGONITE_URL) return;

	void runOrphanVoteCleanup();
	setInterval(() => {
		void runOrphanVoteCleanup();
	}, ORPHAN_VOTE_CLEANUP_INTERVAL_MS);
}
