/**
 * Per-area worker autoscaling: throttle an area's Pokemon worker count to a
 * percentage of a fixed baseline ("max"), based on how funded its vote
 * target currently is. `enabled` is per-area and defaults off; every area
 * still gets a row (see server/state.ts's ensureAutoscaleRows) so a
 * `workers`-mode vote target has a stable number to divide even when
 * autoscale itself is never turned on.
 */
export interface AutoscaleConfig {
	areaId: number;
	enabled: boolean;
	maxPokemonWorkers: number;
}

/** Discrete speed tiers — percentage of maxPokemonWorkers to run at. */
export type SpeedTier = 100 | 75 | 50 | 25 | 10;

export interface AutoscaleSyncResult {
	/** Area IDs whose worker count was changed this run. */
	updated: number[];
}
