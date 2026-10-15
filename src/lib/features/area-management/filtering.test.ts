import { describe, expect, it } from 'vitest';
import { matchesCriteriaFilters } from './filtering';
import { DEFAULT_CRITERIA_FILTERS, type Area, type CriteriaFilters } from './types';

function area(overrides: Partial<Area> = {}): Area {
	return {
		id: 1,
		name: 'Test Area',
		enabled: true,
		enable_pokemon: true,
		enable_forts: true,
		enable_quests: true,
		enable_rare_pokemon: true,
		geofence: null,
		pokemon_mode: { workers: 10, route: [] },
		fort_mode: { workers: 2, route: [] },
		quest_mode: { workers: 1, route: [] },
		rare_pokemon_mode: { workers: 0, route: [] },
		...overrides
	};
}

const NOW = new Date('2026-09-24T00:00:00Z').getTime();

function criteria(overrides: Partial<CriteriaFilters> = {}): CriteriaFilters {
	return { ...DEFAULT_CRITERIA_FILTERS, ...overrides };
}

describe('matchesCriteriaFilters — token funding', () => {
	it('ANY matches regardless of target/total', () => {
		expect(
			matchesCriteriaFilters(area(), criteria({ tokenFunding: 'ANY' }), {
				tokenTotal: 0,
				target: null,
				routeRuns: undefined
			})
		).toBe(true);
	});

	it('excludes areas with no target when a funding filter is active', () => {
		expect(
			matchesCriteriaFilters(area(), criteria({ tokenFunding: 'UNDER' }), {
				tokenTotal: 5,
				target: null,
				routeRuns: undefined
			})
		).toBe(false);
	});

	it('UNDER matches only when total is strictly below target', () => {
		const c = criteria({ tokenFunding: 'UNDER' });
		expect(
			matchesCriteriaFilters(area(), c, { tokenTotal: 4, target: 5, routeRuns: undefined })
		).toBe(true);
		expect(
			matchesCriteriaFilters(area(), c, { tokenTotal: 5, target: 5, routeRuns: undefined })
		).toBe(false);
	});

	it('MEETING matches only on exact equality', () => {
		const c = criteria({ tokenFunding: 'MEETING' });
		expect(
			matchesCriteriaFilters(area(), c, { tokenTotal: 5, target: 5, routeRuns: undefined })
		).toBe(true);
		expect(
			matchesCriteriaFilters(area(), c, { tokenTotal: 6, target: 5, routeRuns: undefined })
		).toBe(false);
	});

	it('ABOVE matches only when total is strictly above target', () => {
		const c = criteria({ tokenFunding: 'ABOVE' });
		expect(
			matchesCriteriaFilters(area(), c, { tokenTotal: 6, target: 5, routeRuns: undefined })
		).toBe(true);
		expect(
			matchesCriteriaFilters(area(), c, { tokenTotal: 5, target: 5, routeRuns: undefined })
		).toBe(false);
	});
});

describe('matchesCriteriaFilters — worker count range', () => {
	it('filters by the selected worker mode, ignoring other modes', () => {
		const a = area({
			pokemon_mode: { workers: 3, route: [] },
			fort_mode: { workers: 50, route: [] }
		});
		const c = criteria({ workerMode: 'pokemon_mode', workerMin: 5 });
		expect(
			matchesCriteriaFilters(a, c, { tokenTotal: 0, target: null, routeRuns: undefined })
		).toBe(false);
		expect(
			matchesCriteriaFilters(a, criteria({ workerMode: 'fort_mode', workerMin: 5 }), {
				tokenTotal: 0,
				target: null,
				routeRuns: undefined
			})
		).toBe(true);
	});

	it('min and max are both inclusive', () => {
		const a = area({ pokemon_mode: { workers: 10, route: [] } });
		const ctx = { tokenTotal: 0, target: null, routeRuns: undefined };
		expect(matchesCriteriaFilters(a, criteria({ workerMin: 10 }), ctx)).toBe(true);
		expect(matchesCriteriaFilters(a, criteria({ workerMax: 10 }), ctx)).toBe(true);
		expect(matchesCriteriaFilters(a, criteria({ workerMin: 11 }), ctx)).toBe(false);
		expect(matchesCriteriaFilters(a, criteria({ workerMax: 9 }), ctx)).toBe(false);
	});

	it('null min/max leaves that bound unrestricted', () => {
		const a = area({ pokemon_mode: { workers: 0, route: [] } });
		expect(
			matchesCriteriaFilters(a, criteria({ workerMin: null, workerMax: null }), {
				tokenTotal: 0,
				target: null,
				routeRuns: undefined
			})
		).toBe(true);
	});
});

describe('matchesCriteriaFilters — route freshness', () => {
	const a = area();

	it('NEVER matches only when no run exists for the selected route type', () => {
		const c = criteria({ routeFreshness: 'NEVER', routeType: 'spawnpoint' });
		expect(
			matchesCriteriaFilters(a, c, { tokenTotal: 0, target: null, routeRuns: undefined }, NOW)
		).toBe(true);
		expect(
			matchesCriteriaFilters(
				a,
				c,
				{
					tokenTotal: 0,
					target: null,
					routeRuns: { spawnpoint: { generatedAt: new Date(NOW).toISOString(), stopCount: 1 } }
				},
				NOW
			)
		).toBe(false);
	});

	it('WITHIN_7D excludes areas with no run and areas older than 7 days', () => {
		const c = criteria({ routeFreshness: 'WITHIN_7D', routeType: 'spawnpoint' });
		expect(
			matchesCriteriaFilters(a, c, { tokenTotal: 0, target: null, routeRuns: undefined }, NOW)
		).toBe(false);

		const recent = new Date(NOW - 2 * 86_400_000).toISOString();
		expect(
			matchesCriteriaFilters(
				a,
				c,
				{
					tokenTotal: 0,
					target: null,
					routeRuns: { spawnpoint: { generatedAt: recent, stopCount: 1 } }
				},
				NOW
			)
		).toBe(true);

		const old = new Date(NOW - 10 * 86_400_000).toISOString();
		expect(
			matchesCriteriaFilters(
				a,
				c,
				{
					tokenTotal: 0,
					target: null,
					routeRuns: { spawnpoint: { generatedAt: old, stopCount: 1 } }
				},
				NOW
			)
		).toBe(false);
	});

	it('STALE_90D matches only runs older than 90 days', () => {
		const c = criteria({ routeFreshness: 'STALE_90D', routeType: 'bootstrap' });
		const fresh = new Date(NOW - 10 * 86_400_000).toISOString();
		const stale = new Date(NOW - 100 * 86_400_000).toISOString();
		expect(
			matchesCriteriaFilters(
				a,
				c,
				{
					tokenTotal: 0,
					target: null,
					routeRuns: { bootstrap: { generatedAt: fresh, stopCount: 1 } }
				},
				NOW
			)
		).toBe(false);
		expect(
			matchesCriteriaFilters(
				a,
				c,
				{
					tokenTotal: 0,
					target: null,
					routeRuns: { bootstrap: { generatedAt: stale, stopCount: 1 } }
				},
				NOW
			)
		).toBe(true);
	});

	it('respects routeType when checking freshness', () => {
		const c = criteria({ routeFreshness: 'WITHIN_30D', routeType: 'bootstrap' });
		const recent = new Date(NOW - 2 * 86_400_000).toISOString();
		expect(
			matchesCriteriaFilters(
				a,
				c,
				{
					tokenTotal: 0,
					target: null,
					routeRuns: { spawnpoint: { generatedAt: recent, stopCount: 1 } }
				},
				NOW
			)
		).toBe(false);
	});
});
