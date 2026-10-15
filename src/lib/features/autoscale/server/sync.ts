/**
 * One worker-autoscale sync pass: for every area with autoscale enabled,
 * resolve its vote target, compute a speed tier from % funded, and PATCH
 * Dragonite if the tier calls for a different Pokemon worker count than it
 * currently has. Called on a timer from server/scheduler.ts.
 */
import {
	listAllAreas,
	patchArea,
	type DragoniteConfig
} from '$lib/features/area-management/server/dragonite';
import {
	getAreaTokenTotals,
	type QueryExecutor as VoteQueryExecutor
} from '$lib/features/voting/server/votes';
import {
	getAreaTargetConfigs,
	resolveTarget,
	type QueryExecutor as TargetQueryExecutor
} from '$lib/features/voting/server/targets';
import {
	getVotingSettings,
	type QueryExecutor as SettingsQueryExecutor
} from '$lib/features/voting/server/settings';
import { logger } from '$lib/server/logger';
import {
	getAutoscaleConfigs,
	ensureAutoscaleRows,
	type QueryExecutor as StateQueryExecutor
} from './state';
import { resolveSpeedTier, computeScaledWorkers } from '../tiers';
import type { AutoscaleSyncResult } from '../types';

export type QueryExecutor = VoteQueryExecutor &
	TargetQueryExecutor &
	SettingsQueryExecutor &
	StateQueryExecutor;

export async function runAutoscaleSync(
	dragoniteConfig: DragoniteConfig,
	localExecutor: QueryExecutor
): Promise<AutoscaleSyncResult> {
	const areas = await listAllAreas(dragoniteConfig);

	// Keep every area's baseline row up to date first — a `workers`-mode vote
	// target needs this even for areas that never touch autoscale itself.
	await ensureAutoscaleRows(
		localExecutor,
		areas.map((a) => ({ id: a.id, pokemonWorkers: a.pokemon_mode.workers }))
	);

	const autoscaleConfigs = await getAutoscaleConfigs(localExecutor);
	const candidates = areas.filter((a) => a.enabled && autoscaleConfigs[a.id]?.enabled);

	const result: AutoscaleSyncResult = { updated: [] };
	if (candidates.length === 0) return result;

	const targetConfigs = await getAreaTargetConfigs(localExecutor);
	const tokenTotals = await getAreaTokenTotals(localExecutor);
	const votingSettings = await getVotingSettings(localExecutor);

	for (const area of candidates) {
		const config = autoscaleConfigs[area.id];
		const targetConfig = targetConfigs[area.id];
		if (!targetConfig) {
			logger.warn(
				{ areaId: area.id },
				'Autoscale enabled but no vote target configured — skipping'
			);
			continue;
		}

		// Always resolve the target off the stored max, never the area's live
		// worker count. A `workers`-mode target is computed AS a function of
		// worker count — feeding it the live (already-throttled) count would
		// shrink the target every time autoscale scales workers down, making
		// the area look more funded and immediately scaling it back up.
		const target = resolveTarget(
			targetConfig,
			config.maxPokemonWorkers,
			votingSettings.workersPerToken
		);
		if (target === null || target <= 0) continue;

		const tokenTotal = tokenTotals[area.id] ?? 0;
		const fundedPct = (tokenTotal / target) * 100;
		const tier = resolveSpeedTier(fundedPct);
		const scaledWorkers = computeScaledWorkers(config.maxPokemonWorkers, tier);

		if (scaledWorkers === area.pokemon_mode.workers) continue;

		try {
			await patchArea(dragoniteConfig, area.id, { pokemon_mode: { workers: scaledWorkers } });
			result.updated.push(area.id);
			logger.info(
				{ areaId: area.id, tier, scaledWorkers, fundedPct: Math.round(fundedPct) },
				'Autoscale updated area worker count'
			);
		} catch (err) {
			logger.error({ err, areaId: area.id }, 'Autoscale failed to update area worker count');
		}
	}

	return result;
}
