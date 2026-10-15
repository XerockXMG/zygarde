import type { SpeedTier } from './types';

/**
 * Map a "% of vote target funded" figure to a discrete speed tier.
 * Percentages are of the resolved vote target, so an over-funded area
 * (>100%) still maps to the top tier rather than something higher.
 */
export function resolveSpeedTier(fundedPct: number): SpeedTier {
	if (fundedPct >= 100) return 100;
	if (fundedPct >= 60) return 75;
	if (fundedPct >= 30) return 50;
	if (fundedPct > 0) return 25;
	return 10;
}

/**
 * Scale the stored max Pokemon worker count by a speed tier. Rounds to the
 * nearest worker, floored at 1 — even the lowest tier should slow an area
 * down, not fully starve it.
 */
export function computeScaledWorkers(maxPokemonWorkers: number, tier: SpeedTier): number {
	return Math.max(1, Math.round((maxPokemonWorkers * tier) / 100));
}
