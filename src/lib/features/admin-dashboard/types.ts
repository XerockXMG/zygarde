export interface DashboardStats {
	totalAreas: number;
	/** Areas currently enabled in Dragonite. */
	enabledAreas: number;
	/** Enabled areas with a configured target whose funded tokens meet or exceed it. */
	areasMeetingTarget: number;
	/** Enabled areas with a configured target whose funded tokens fall short of it. */
	areasBelowTarget: number;
	/** Enabled areas with no tokens allocated to them at all, whether or not a target is configured. */
	areasWithZeroTokens: number;
	/** Sum of every area's live (currently running) Pokemon worker count. */
	effectiveWorkers: number;
	/** Sum of every area's un-throttled baseline — the autoscale max where enabled, otherwise the live count. */
	baselineWorkers: number;
	/** Autoscale-enabled areas currently running below their max. */
	throttledAreas: number;
	/** Sum of tokens currently allocated to areas across all users. */
	tokensSpent: number;
	/** Sum of every known user's token budget (tier weight), spent or not. */
	tokensAvailable: number;
}

export interface AreaRef {
	id: number;
	name: string;
}

export interface VoterRank {
	discordId: string;
	username: string;
	tierName: string | null;
	/** Tokens this voter currently has allocated across all (existing) areas. */
	tokens: number;
	/** How many areas they have tokens on. */
	areas: number;
}

/** One row of the dashboard's area ranking table (see voteReport.ts's computeAreaRanking). */
export interface AreaRankRow {
	id: number;
	name: string;
	enabled: boolean;
	/** Tokens allocated to this area by everyone. */
	tokens: number;
	/** The part of `tokens` from active subscribers. */
	subscriberTokens: number;
	/** Distinct voters with tokens on this area. */
	voters: number;
	/** The part of `voters` who are active subscribers. */
	subscriberVoters: number;
	/** Resolved token target, or null when none is configured (or it resolves to 0). */
	target: number | null;
	/** Autoscale max where autoscale is enabled, otherwise the live Pokémon worker count. */
	baselineWorkers: number;
}

export interface VoteReport {
	/** Areas (enabled or not) with at least one token allocated. */
	areasWithVotes: number;
	/** Areas (enabled or not) with no tokens allocated. */
	areasWithNoVotes: number;
	/** Enabled areas with no tokens allocated, sorted by name. */
	enabledAreasWithNoVotes: AreaRef[];
	/** Distinct users with at least one token allocated. */
	voterCount: number;
	/** Distinct voters who are active subscribers (see voteReport.ts's isActiveSubscriber). */
	subscriberVoterCount: number;
	topVoters: VoterRank[];
}
