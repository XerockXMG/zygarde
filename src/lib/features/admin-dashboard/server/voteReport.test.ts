import { describe, expect, it, vi } from 'vitest';
import {
	computeAreaRanking,
	computeVoteReport,
	getDashboardVoteRows,
	isActiveSubscriber,
	type DashboardVoteRow
} from './voteReport';
import type { Area } from '$lib/features/area-management/types';

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

function vote(
	areaId: number,
	discordId: string,
	amount: number,
	overrides: Partial<DashboardVoteRow> = {}
): DashboardVoteRow {
	return {
		areaId,
		discordId,
		username: `user-${discordId}`,
		amount,
		tierName: 'VIP',
		weight: 2,
		isOverride: false,
		isFailingSubscription: false,
		...overrides
	};
}

describe('getDashboardVoteRows', () => {
	it('maps DB rows, coercing numeric strings and flags', async () => {
		const execute = vi.fn().mockResolvedValue([
			[
				{
					area_id: 3,
					discord_id: 'u1',
					username: 'alice',
					amount: '2',
					tier_name: null,
					weight: null,
					is_override: '1',
					is_failing: 0
				}
			],
			undefined
		]);
		const rows = await getDashboardVoteRows({ execute });
		expect(execute.mock.calls[0][0]).toContain('av.amount > 0');
		expect(rows).toEqual([
			{
				areaId: 3,
				discordId: 'u1',
				username: 'alice',
				amount: 2,
				tierName: null,
				weight: 0,
				isOverride: true,
				isFailingSubscription: false
			}
		]);
	});
});

describe('isActiveSubscriber', () => {
	it('requires a role-resolved, non-failing, non-zero tier', () => {
		expect(isActiveSubscriber(vote(1, 'a', 1))).toBe(true);
		expect(isActiveSubscriber(vote(1, 'a', 1, { weight: 0 }))).toBe(false);
		expect(isActiveSubscriber(vote(1, 'a', 1, { isOverride: true }))).toBe(false);
		expect(isActiveSubscriber(vote(1, 'a', 1, { isFailingSubscription: true }))).toBe(false);
	});
});

describe('computeVoteReport — area counts', () => {
	it('splits areas into voted / not voted, and lists enabled unvoted areas by name', () => {
		const report = computeVoteReport(
			[area(1), area(2, { name: 'Zeta' }), area(3, { name: 'Alpha' }), area(4, { enabled: false })],
			[vote(1, 'a', 1)]
		);
		expect(report.areasWithVotes).toBe(1);
		expect(report.areasWithNoVotes).toBe(3);
		expect(report.enabledAreasWithNoVotes).toEqual([
			{ id: 3, name: 'Alpha' },
			{ id: 2, name: 'Zeta' }
		]);
	});

	it('ignores votes on areas Dragonite no longer has', () => {
		const report = computeVoteReport([area(1)], [vote(99, 'a', 5)]);
		expect(report.areasWithVotes).toBe(0);
		expect(report.voterCount).toBe(0);
		expect(report.topVoters).toEqual([]);
	});
});

describe('computeVoteReport — voters', () => {
	it('counts distinct voters and subscribers', () => {
		const report = computeVoteReport(
			[area(1), area(2)],
			[
				vote(1, 'a', 1),
				vote(2, 'a', 1),
				vote(1, 'b', 1, { isOverride: true }),
				vote(1, 'c', 1, { isFailingSubscription: true })
			]
		);
		expect(report.voterCount).toBe(3);
		expect(report.subscriberVoterCount).toBe(1);
	});

	it('ranks voters by tokens, then areas, then name, capped at the limit', () => {
		const report = computeVoteReport(
			[area(1), area(2)],
			[
				vote(1, 'low', 1),
				vote(1, 'wide', 1),
				vote(2, 'wide', 1),
				vote(1, 'big', 4),
				vote(1, 'wide2', 2)
			],
			3
		);
		expect(report.topVoters.map((v) => [v.discordId, v.tokens, v.areas])).toEqual([
			['big', 4, 1],
			['wide', 2, 2],
			['wide2', 2, 1]
		]);
	});
});

describe('computeAreaRanking', () => {
	const staticTarget = (value: number) => ({
		mode: 'static' as const,
		staticValue: value,
		workersPerTokenOverride: null
	});

	function rank(overrides: Partial<Parameters<typeof computeAreaRanking>[0]> = {}) {
		return computeAreaRanking({
			areas: [area(1), area(2), area(3)],
			voteRows: [],
			targetConfigs: {},
			autoscaleConfigs: {},
			globalWorkersPerToken: 10,
			...overrides
		});
	}

	it('splits tokens and voters into all vs active subscribers, sorted by tokens', () => {
		const rows = rank({
			voteRows: [
				vote(1, 'a', 2),
				vote(1, 'b', 3, { isFailingSubscription: true }),
				vote(2, 'a', 1),
				vote(3, 'c', 1, { isOverride: true })
			]
		});
		expect(
			rows.map((r) => [r.id, r.tokens, r.subscriberTokens, r.voters, r.subscriberVoters])
		).toEqual([
			[1, 5, 2, 2, 1],
			[2, 1, 1, 1, 1],
			[3, 1, 0, 1, 0]
		]);
	});

	it('only includes existing areas with votes', () => {
		const rows = rank({ voteRows: [vote(1, 'a', 1), vote(99, 'a', 4)] });
		expect(rows.map((r) => r.id)).toEqual([1]);
	});

	it('resolves a workers-mode target off the stored autoscale max, not the live count', () => {
		const rows = rank({
			areas: [area(1, { pokemon_mode: { workers: 20, route: [] } })],
			voteRows: [vote(1, 'a', 1)],
			targetConfigs: { 1: { mode: 'workers', staticValue: 0, workersPerTokenOverride: null } },
			autoscaleConfigs: { 1: { areaId: 1, enabled: true, maxPokemonWorkers: 40 } }
		});
		expect(rows[0].target).toBe(4);
		expect(rows[0].baselineWorkers).toBe(40);
	});

	it('uses the live count as the baseline when autoscale is off', () => {
		const rows = rank({
			areas: [area(1, { pokemon_mode: { workers: 20, route: [] } })],
			voteRows: [vote(1, 'a', 1)],
			autoscaleConfigs: { 1: { areaId: 1, enabled: false, maxPokemonWorkers: 12 } }
		});
		expect(rows[0].baselineWorkers).toBe(20);
	});

	it('reports no target when none is configured or it resolves to 0', () => {
		const rows = rank({
			voteRows: [vote(1, 'a', 2), vote(2, 'a', 1), vote(3, 'a', 1)],
			targetConfigs: { 2: staticTarget(0), 3: staticTarget(3) }
		});
		expect(rows.map((r) => [r.id, r.target])).toEqual([
			[1, null],
			[2, null],
			[3, 3]
		]);
	});
});
