import type { Area } from '$lib/features/area-management/types';
import type { AutoscaleConfig } from '$lib/features/autoscale/types';
import { resolveTarget, type TargetConfig } from '$lib/features/voting/server/targets';
import type { AreaRankRow, VoteReport, VoterRank } from '../types';

export interface QueryExecutor {
	execute<T = unknown>(sql: string, params?: unknown[]): Promise<[T, unknown]>;
}

/** One non-zero `area_votes` allocation, joined with its voter's current tier/subscription state. */
export interface DashboardVoteRow {
	areaId: number;
	discordId: string;
	username: string;
	amount: number;
	tierName: string | null;
	/** The voter's current token budget (`user_tiers.weight`); 0 when they have no resolved tier. */
	weight: number;
	/** True when the voter's tier comes from an admin override rather than their Discord roles. */
	isOverride: boolean;
	/** True while the voter is inside a failing Discord-role subscription check streak. */
	isFailingSubscription: boolean;
}

interface DashboardVoteDbRow {
	area_id: number;
	discord_id: string;
	username: string;
	amount: number | string;
	tier_name: string | null;
	weight: number | string | null;
	is_override: number | string;
	is_failing: number | string;
}

export async function getDashboardVoteRows(executor: QueryExecutor): Promise<DashboardVoteRow[]> {
	const [rows] = await executor.execute<DashboardVoteDbRow[]>(
		`SELECT av.area_id AS area_id, av.discord_id AS discord_id,
		        COALESCE(ut.username, av.username) AS username, av.amount AS amount,
		        ut.tier_name AS tier_name, ut.weight AS weight,
		        IF(uto.discord_id IS NOT NULL, 1, 0) AS is_override,
		        IF(src.failing_since IS NOT NULL, 1, 0) AS is_failing
		 FROM area_votes av
		 LEFT JOIN user_tiers ut ON av.discord_id = ut.discord_id
		 LEFT JOIN user_tier_overrides uto ON av.discord_id = uto.discord_id
		 LEFT JOIN subscription_role_checks src ON av.discord_id = src.discord_id
		 WHERE av.amount > 0`
	);
	return rows.map((row) => ({
		areaId: Number(row.area_id),
		discordId: row.discord_id,
		username: row.username,
		amount: Number(row.amount),
		tierName: row.tier_name,
		weight: Number(row.weight ?? 0),
		isOverride: Number(row.is_override) === 1,
		isFailingSubscription: Number(row.is_failing) === 1
	}));
}

/**
 * An "active subscriber" is a voter whose tier was resolved from their
 * Discord roles (weight > 0, not an admin override) and who isn't currently
 * inside a failing subscription-role check streak. Uses only stored state —
 * never a live Discord lookup — so the dashboard can't trip rate limits.
 */
export function isActiveSubscriber(row: DashboardVoteRow): boolean {
	return row.weight > 0 && !row.isOverride && !row.isFailingSubscription;
}

/** How many voters the Top Voters list keeps; the page shows 5 or 10 of them. */
export const TOP_LIMIT = 10;

function rowsForKnownAreas(areas: Area[], voteRows: DashboardVoteRow[]): DashboardVoteRow[] {
	const known = new Set(areas.map((a) => a.id));
	return voteRows.filter((r) => known.has(r.areaId) && r.amount > 0);
}

/**
 * Pure — the dashboard's `load` gathers the Dragonite areas and the vote rows
 * and hands them here. Votes on area ids Dragonite no longer knows about
 * (deleted areas whose `area_votes` rows linger) are ignored throughout, so
 * every count and list here describes areas that actually exist.
 */
export function computeVoteReport(
	areas: Area[],
	voteRows: DashboardVoteRow[],
	limit = TOP_LIMIT
): VoteReport {
	const rows = rowsForKnownAreas(areas, voteRows);

	const votedAreaIds = new Set(rows.map((r) => r.areaId));
	const enabledAreasWithNoVotes = areas
		.filter((a) => a.enabled && !votedAreaIds.has(a.id))
		.map((a) => ({ id: a.id, name: a.name }))
		.sort((a, b) => a.name.localeCompare(b.name));

	const byVoter = new Map<string, VoterRank>();
	for (const row of rows) {
		const voter = byVoter.get(row.discordId) ?? {
			discordId: row.discordId,
			username: row.username,
			tierName: row.tierName,
			tokens: 0,
			areas: 0
		};
		voter.tokens += row.amount;
		voter.areas += 1;
		byVoter.set(row.discordId, voter);
	}
	const topVoters = [...byVoter.values()]
		.sort(
			(a, b) => b.tokens - a.tokens || b.areas - a.areas || a.username.localeCompare(b.username)
		)
		.slice(0, limit);

	const subscriberRows = rows.filter(isActiveSubscriber);

	return {
		areasWithVotes: votedAreaIds.size,
		areasWithNoVotes: areas.length - votedAreaIds.size,
		enabledAreasWithNoVotes,
		voterCount: byVoter.size,
		subscriberVoterCount: new Set(subscriberRows.map((r) => r.discordId)).size,
		topVoters
	};
}

export interface AreaRankingInput {
	areas: Area[];
	voteRows: DashboardVoteRow[];
	targetConfigs: Record<number, TargetConfig>;
	autoscaleConfigs: Record<number, AutoscaleConfig>;
	globalWorkersPerToken: number;
}

/**
 * One row per existing area with at least one token, sorted by tokens (the
 * page re-sorts/limits client-side — see ../ranking.ts). The token target
 * follows the same rule as everywhere else: `workers`-mode targets resolve
 * off the stored autoscale max, never the live count (CLAUDE.md, Voting).
 * `baselineWorkers` matches computeStats' baseline: the autoscale max where
 * autoscale is enabled, otherwise the live count — the stored max is a
 * stale snapshot for areas autoscale isn't managing.
 */
export function computeAreaRanking(input: AreaRankingInput): AreaRankRow[] {
	const { areas, targetConfigs, autoscaleConfigs, globalWorkersPerToken } = input;
	const areaById = new Map(areas.map((a) => [a.id, a]));

	const byArea = new Map<
		number,
		{ tokens: number; subscriberTokens: number; voters: Set<string>; subscribers: Set<string> }
	>();
	for (const row of rowsForKnownAreas(areas, input.voteRows)) {
		const entry = byArea.get(row.areaId) ?? {
			tokens: 0,
			subscriberTokens: 0,
			voters: new Set<string>(),
			subscribers: new Set<string>()
		};
		entry.tokens += row.amount;
		entry.voters.add(row.discordId);
		if (isActiveSubscriber(row)) {
			entry.subscriberTokens += row.amount;
			entry.subscribers.add(row.discordId);
		}
		byArea.set(row.areaId, entry);
	}

	return [...byArea.entries()]
		.map(([id, e]) => {
			const area = areaById.get(id)!;
			const autoscale = autoscaleConfigs[id];
			const live = area.pokemon_mode.workers;
			const target = resolveTarget(
				targetConfigs[id],
				autoscale?.maxPokemonWorkers ?? live,
				globalWorkersPerToken
			);
			return {
				id,
				name: area.name,
				enabled: area.enabled,
				tokens: e.tokens,
				subscriberTokens: e.subscriberTokens,
				voters: e.voters.size,
				subscriberVoters: e.subscribers.size,
				target: target !== null && target > 0 ? target : null,
				baselineWorkers: autoscale?.enabled ? autoscale.maxPokemonWorkers : live
			};
		})
		.sort((a, b) => b.tokens - a.tokens || b.voters - a.voters || a.name.localeCompare(b.name));
}
