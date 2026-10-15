import type { Area } from '$lib/features/area-management/types';
import { resolveTarget, type TargetConfig } from '$lib/features/voting/server/targets';
import type { AutoscaleConfig } from '$lib/features/autoscale/types';
import type { DashboardStats } from '../types';

export interface ComputeStatsInput {
	areas: Area[];
	targetConfigs: Record<number, TargetConfig>;
	autoscaleConfigs: Record<number, AutoscaleConfig>;
	tokenTotals: Record<number, number>;
	globalWorkersPerToken: number;
	/** Every known user's current token budget (tier weight) — one entry per `user_tiers` row. */
	userWeights: number[];
}

/**
 * Pure — no DB/HTTP access, so the admin dashboard's `load` just gathers
 * these pieces and hands them here. Mirrors the same target-resolution rule
 * the home page's `load` uses: a `workers`-mode target always resolves off
 * the autoscale baseline (`maxPokemonWorkers`), never live
 * `pokemon_mode.workers` — see CLAUDE.md's Voting section for why (the
 * feedback-loop this avoids).
 */
export function computeDashboardStats(input: ComputeStatsInput): DashboardStats {
	const {
		areas,
		targetConfigs,
		autoscaleConfigs,
		tokenTotals,
		globalWorkersPerToken,
		userWeights
	} = input;

	let areasMeetingTarget = 0;
	let areasBelowTarget = 0;
	let areasWithZeroTokens = 0;
	let effectiveWorkers = 0;
	let baselineWorkers = 0;
	let enabledAreas = 0;
	let throttledAreas = 0;

	for (const area of areas) {
		const autoscale = autoscaleConfigs[area.id];
		const maxPokemonWorkers = autoscale?.maxPokemonWorkers ?? area.pokemon_mode.workers;

		// The live count already reflects the last autoscale sync tick, so it's
		// the "actually running right now" number; the baseline is the
		// un-throttled ceiling it would run at if autoscale weren't scaling it
		// down (or just the live count itself when autoscale is off/unset).
		effectiveWorkers += area.pokemon_mode.workers;
		baselineWorkers += autoscale?.enabled ? maxPokemonWorkers : area.pokemon_mode.workers;
		if (autoscale?.enabled && area.pokemon_mode.workers < maxPokemonWorkers) throttledAreas++;

		if (!area.enabled) continue;
		enabledAreas++;
		const tokenTotal = tokenTotals[area.id] ?? 0;
		if (tokenTotal <= 0) areasWithZeroTokens++;

		const target = resolveTarget(targetConfigs[area.id], maxPokemonWorkers, globalWorkersPerToken);
		if (target === null) continue; // no target configured — doesn't count toward either bucket

		if (tokenTotal >= target) areasMeetingTarget++;
		else areasBelowTarget++;
	}

	const tokensSpent = Object.values(tokenTotals).reduce((sum, n) => sum + n, 0);
	const tokensAvailable = userWeights.reduce((sum, n) => sum + n, 0);

	return {
		totalAreas: areas.length,
		enabledAreas,
		areasMeetingTarget,
		areasBelowTarget,
		areasWithZeroTokens,
		effectiveWorkers,
		baselineWorkers,
		throttledAreas,
		tokensSpent,
		tokensAvailable
	};
}
