import type { AreaRankRow } from './types';

/** Pure, client-safe helpers behind the dashboard's area ranking table controls. */

export type RankingSort = 'all' | 'subscribers';
export type RankingShow = 5 | 10 | 'all';

/**
 * Sorts by all tokens or by subscriber tokens (ties: the other token count,
 * then voters, then name), then keeps the top `show` rows.
 */
export function sortAndLimitRanking(
	rows: AreaRankRow[],
	sort: RankingSort,
	show: RankingShow
): AreaRankRow[] {
	const primary = (r: AreaRankRow) => (sort === 'subscribers' ? r.subscriberTokens : r.tokens);
	const secondary = (r: AreaRankRow) => (sort === 'subscribers' ? r.tokens : r.subscriberTokens);
	const sorted = [...rows].sort(
		(a, b) =>
			primary(b) - primary(a) ||
			secondary(b) - secondary(a) ||
			b.voters - a.voters ||
			a.name.localeCompare(b.name)
	);
	return show === 'all' ? sorted : sorted.slice(0, show);
}

/** Tokens as a whole-number percentage of the target, or null when there's no target. */
export function goalPercent(tokens: number, target: number | null): number | null {
	if (target === null || target <= 0) return null;
	return Math.round((tokens / target) * 100);
}

/** Whole-number percentage of `part` in `whole`, 0 when `whole` is 0. */
export function percentOf(part: number, whole: number): number {
	return whole > 0 ? Math.round((part / whole) * 100) : 0;
}
