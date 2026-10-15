export interface VoteTier {
	name: string;
	weight: number;
	/** Role IDs that grant this tier (see utils/access.ts); unset falls back to VOTE_TIER_ROLES. */
	roles?: string[];
}

export interface ResolvedTier {
	tierName: string;
	weight: number;
}
