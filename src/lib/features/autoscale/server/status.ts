/**
 * Read-only view of every autoscale-enabled area for /admin/autoscale: how
 * funded it is and what worker count the next sync pass would aim for. Pure
 * (no DB or Dragonite access), using the same rules as server/sync.ts — the
 * target resolves off the stored max, never the live worker count.
 */
import type { Area } from '$lib/features/area-management/types';
import { resolveTarget, type TargetConfig } from '$lib/features/voting/server/targets';
import { resolveSpeedTier, computeScaledWorkers } from '../tiers';
import type { AutoscaleConfig, SpeedTier } from '../types';

export interface AutoscaleStatusRow {
	areaId: number;
	name: string;
	areaEnabled: boolean;
	maxPokemonWorkers: number;
	currentWorkers: number;
	tokens: number;
	/** null when the area has no vote target, so sync skips it. */
	target: number | null;
	fundedPct: number | null;
	tier: SpeedTier | null;
	/** Worker count the next sync would set; null when sync skips the area. */
	scaledWorkers: number | null;
}

export function buildAutoscaleStatus(
	areas: Area[],
	autoscaleConfigs: Record<number, AutoscaleConfig>,
	targetConfigs: Record<number, TargetConfig>,
	tokenTotals: Record<number, number>,
	workersPerToken: number
): AutoscaleStatusRow[] {
	return areas
		.filter((a) => autoscaleConfigs[a.id]?.enabled)
		.map((a) => {
			const max = autoscaleConfigs[a.id].maxPokemonWorkers;
			const tokens = tokenTotals[a.id] ?? 0;
			const resolved = resolveTarget(targetConfigs[a.id], max, workersPerToken);
			const target = resolved !== null && resolved > 0 ? resolved : null;
			const fundedPct = target !== null ? (tokens / target) * 100 : null;
			const tier = fundedPct !== null ? resolveSpeedTier(fundedPct) : null;
			return {
				areaId: a.id,
				name: a.name,
				areaEnabled: a.enabled,
				maxPokemonWorkers: max,
				currentWorkers: a.pokemon_mode.workers,
				tokens,
				target,
				fundedPct,
				tier,
				scaledWorkers: tier !== null ? computeScaledWorkers(max, tier) : null
			};
		})
		.sort((a, b) => a.name.localeCompare(b.name));
}
