import { describe, expect, it } from 'vitest';
import { computeDashboardStats, type ComputeStatsInput } from './computeStats';
import type { Area } from '$lib/features/area-management/types';
import type { TargetConfig } from '$lib/features/voting/server/targets';
import type { AutoscaleConfig } from '$lib/features/autoscale/types';

function area(id: number, overrides: Partial<Area> = {}): Area {
	return {
		id,
		name: `Area ${id}`,
		enabled: true,
		enable_pokemon: true,
		enable_forts: true,
		enable_quests: true,
		enable_rare_pokemon: true,
		geofence: null,
		pokemon_mode: { workers: 10, route: [] },
		fort_mode: { workers: 0, route: [] },
		quest_mode: { workers: 0, route: [] },
		rare_pokemon_mode: { workers: 0, route: [] },
		...overrides
	};
}

function input(overrides: Partial<ComputeStatsInput> = {}): ComputeStatsInput {
	return {
		areas: [],
		targetConfigs: {},
		autoscaleConfigs: {},
		tokenTotals: {},
		globalWorkersPerToken: 1,
		userWeights: [],
		...overrides
	};
}

const staticTarget = (value: number): TargetConfig => ({
	mode: 'static',
	staticValue: value,
	workersPerTokenOverride: null
});

describe('computeDashboardStats — totalAreas', () => {
	it('counts every area regardless of enabled status', () => {
		const stats = computeDashboardStats(
			input({ areas: [area(1, { enabled: true }), area(2, { enabled: false })] })
		);
		expect(stats.totalAreas).toBe(2);
	});
});

describe('computeDashboardStats — token-goal buckets', () => {
	it('buckets an enabled, funded area as meeting target', () => {
		const stats = computeDashboardStats(
			input({
				areas: [area(1, { pokemon_mode: { workers: 10, route: [] } })],
				targetConfigs: { 1: staticTarget(5) },
				tokenTotals: { 1: 5 }
			})
		);
		expect(stats.areasMeetingTarget).toBe(1);
		expect(stats.areasBelowTarget).toBe(0);
	});

	it('buckets an enabled, underfunded area as below target', () => {
		const stats = computeDashboardStats(
			input({
				areas: [area(1)],
				targetConfigs: { 1: staticTarget(5) },
				tokenTotals: { 1: 4 }
			})
		);
		expect(stats.areasMeetingTarget).toBe(0);
		expect(stats.areasBelowTarget).toBe(1);
	});

	it('treats a total above target as meeting it too', () => {
		const stats = computeDashboardStats(
			input({
				areas: [area(1)],
				targetConfigs: { 1: staticTarget(5) },
				tokenTotals: { 1: 9 }
			})
		);
		expect(stats.areasMeetingTarget).toBe(1);
	});

	it('excludes disabled areas from both buckets even with a funded target', () => {
		const stats = computeDashboardStats(
			input({
				areas: [area(1, { enabled: false })],
				targetConfigs: { 1: staticTarget(5) },
				tokenTotals: { 1: 100 }
			})
		);
		expect(stats.areasMeetingTarget).toBe(0);
		expect(stats.areasBelowTarget).toBe(0);
	});

	it('excludes enabled areas with no target configured from both buckets', () => {
		const stats = computeDashboardStats(
			input({ areas: [area(1)], targetConfigs: {}, tokenTotals: { 1: 100 } })
		);
		expect(stats.areasMeetingTarget).toBe(0);
		expect(stats.areasBelowTarget).toBe(0);
	});

	it('resolves a workers-mode target off the autoscale baseline, not the live (already-throttled) count', () => {
		// Live count is throttled to 2, but the stored baseline is 10 — the
		// target must resolve off 10, or a throttled area would look more
		// funded than it is and immediately scale back up.
		const stats = computeDashboardStats(
			input({
				areas: [area(1, { pokemon_mode: { workers: 2, route: [] } })],
				targetConfigs: { 1: { mode: 'workers', staticValue: 0, workersPerTokenOverride: null } },
				autoscaleConfigs: { 1: { areaId: 1, enabled: true, maxPokemonWorkers: 10 } },
				globalWorkersPerToken: 5, // target = ceil(10 / 5) = 2
				tokenTotals: { 1: 2 }
			})
		);
		expect(stats.areasMeetingTarget).toBe(1);
	});
});

describe('computeDashboardStats — areasWithZeroTokens', () => {
	it('counts enabled areas with no votes at all, with or without a target', () => {
		const stats = computeDashboardStats(
			input({
				areas: [area(1), area(2), area(3)],
				targetConfigs: { 1: staticTarget(5) },
				tokenTotals: { 3: 2 }
			})
		);
		expect(stats.areasWithZeroTokens).toBe(2);
	});

	it('counts an area whose vote rows sum to zero', () => {
		const stats = computeDashboardStats(input({ areas: [area(1)], tokenTotals: { 1: 0 } }));
		expect(stats.areasWithZeroTokens).toBe(1);
	});

	it('excludes disabled areas', () => {
		const stats = computeDashboardStats(input({ areas: [area(1, { enabled: false })] }));
		expect(stats.areasWithZeroTokens).toBe(0);
	});
});

describe('computeDashboardStats — worker throttle totals', () => {
	it('matches the README example: a 10-worker area throttled to 10% plus a full-speed 20-worker area', () => {
		const throttled: AutoscaleConfig = { areaId: 1, enabled: true, maxPokemonWorkers: 10 };
		const stats = computeDashboardStats(
			input({
				areas: [
					area(1, { pokemon_mode: { workers: 1, route: [] } }), // live, already throttled to 10%
					area(2, { pokemon_mode: { workers: 20, route: [] } })
				],
				autoscaleConfigs: { 1: throttled }
			})
		);
		expect(stats.effectiveWorkers).toBe(21);
		expect(stats.baselineWorkers).toBe(30);
	});

	it('uses the live count as both effective and baseline when autoscale is disabled/unset', () => {
		const stats = computeDashboardStats(
			input({ areas: [area(1, { pokemon_mode: { workers: 7, route: [] } })] })
		);
		expect(stats.effectiveWorkers).toBe(7);
		expect(stats.baselineWorkers).toBe(7);
	});

	it('includes disabled areas in the worker totals', () => {
		const stats = computeDashboardStats(
			input({ areas: [area(1, { enabled: false, pokemon_mode: { workers: 5, route: [] } })] })
		);
		expect(stats.effectiveWorkers).toBe(5);
		expect(stats.baselineWorkers).toBe(5);
	});

	it('uses the live count, not the stored max, when an autoscale row exists but is disabled', () => {
		const stats = computeDashboardStats(
			input({
				areas: [area(1, { pokemon_mode: { workers: 8, route: [] } })],
				autoscaleConfigs: { 1: { areaId: 1, enabled: false, maxPokemonWorkers: 20 } }
			})
		);
		expect(stats.effectiveWorkers).toBe(8);
		expect(stats.baselineWorkers).toBe(8);
	});
});

describe('computeDashboardStats — tokens', () => {
	it('sums spent tokens across all areas and available across all users', () => {
		const stats = computeDashboardStats(
			input({
				tokenTotals: { 1: 3, 2: 4 },
				userWeights: [1, 3, 5]
			})
		);
		expect(stats.tokensSpent).toBe(7);
		expect(stats.tokensAvailable).toBe(9);
	});

	it('is zero for both when there are no votes/users', () => {
		const stats = computeDashboardStats(input());
		expect(stats.tokensSpent).toBe(0);
		expect(stats.tokensAvailable).toBe(0);
	});
});

describe('computeDashboardStats — enabled and throttled areas', () => {
	it('counts enabled areas', () => {
		const stats = computeDashboardStats(
			input({ areas: [area(1), area(2, { enabled: false }), area(3)] })
		);
		expect(stats.enabledAreas).toBe(2);
	});

	it('counts autoscale-enabled areas running below their max', () => {
		const stats = computeDashboardStats(
			input({
				areas: [
					area(1, { pokemon_mode: { workers: 5, route: [] } }),
					area(2, { pokemon_mode: { workers: 10, route: [] } }),
					area(3, { pokemon_mode: { workers: 5, route: [] } })
				],
				autoscaleConfigs: {
					1: { areaId: 1, enabled: true, maxPokemonWorkers: 10 },
					2: { areaId: 2, enabled: true, maxPokemonWorkers: 10 },
					3: { areaId: 3, enabled: false, maxPokemonWorkers: 10 }
				}
			})
		);
		expect(stats.throttledAreas).toBe(1);
	});
});
