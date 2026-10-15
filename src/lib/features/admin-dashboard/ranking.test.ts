import { describe, expect, it } from 'vitest';
import { goalPercent, percentOf, sortAndLimitRanking } from './ranking';
import type { AreaRankRow } from './types';

function row(name: string, tokens: number, subscriberTokens: number, voters = 1): AreaRankRow {
	return {
		id: name.length,
		name,
		enabled: true,
		tokens,
		subscriberTokens,
		voters,
		subscriberVoters: 0,
		target: null,
		baselineWorkers: 10
	};
}

const ROWS = [row('Northside', 7, 3), row('Riverside', 19, 9), row('Lakeview', 16, 15)];

describe('sortAndLimitRanking', () => {
	it('sorts by all tokens', () => {
		expect(sortAndLimitRanking(ROWS, 'all', 'all').map((r) => r.name)).toEqual([
			'Riverside',
			'Lakeview',
			'Northside'
		]);
	});

	it('sorts by subscriber tokens', () => {
		expect(sortAndLimitRanking(ROWS, 'subscribers', 'all').map((r) => r.name)).toEqual([
			'Lakeview',
			'Riverside',
			'Northside'
		]);
	});

	it('breaks ties on the other token count, then voters, then name', () => {
		const tied = [row('B', 5, 1), row('A', 5, 1), row('C', 5, 2), row('D', 5, 1, 3)];
		expect(sortAndLimitRanking(tied, 'all', 'all').map((r) => r.name)).toEqual([
			'C',
			'D',
			'A',
			'B'
		]);
	});

	it('limits to the top N without mutating the input', () => {
		const input = [...ROWS];
		expect(sortAndLimitRanking(input, 'all', 5)).toHaveLength(3);
		expect(sortAndLimitRanking(input, 'all', 10)).toHaveLength(3);
		expect(sortAndLimitRanking([...ROWS, ...ROWS], 'all', 5)).toHaveLength(5);
		expect(input.map((r) => r.name)).toEqual(['Northside', 'Riverside', 'Lakeview']);
	});
});

describe('goalPercent', () => {
	it('is null without a positive target', () => {
		expect(goalPercent(5, null)).toBeNull();
		expect(goalPercent(5, 0)).toBeNull();
	});

	it('rounds tokens over target to a whole percent, over 100 allowed', () => {
		expect(goalPercent(19, 20)).toBe(95);
		expect(goalPercent(5, 1)).toBe(500);
	});
});

describe('percentOf', () => {
	it('handles a zero whole', () => {
		expect(percentOf(3, 0)).toBe(0);
		expect(percentOf(54, 80)).toBe(68);
	});
});
