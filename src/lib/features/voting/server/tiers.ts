import { hasAnyRole, parseRoleIds } from '$lib/utils/access';
import { logger } from '$lib/server/logger';
import type { VoteTier, ResolvedTier } from '../types';

/**
 * The single implicit tier when VOTE_TIERS is unset: every logged-in user
 * gets it, so voting works out of the box with 1 token each.
 * resolveTierFromRoles recognises it by identity, so it must only come from
 * parseVoteTiers.
 */
export const DEFAULT_TIER: VoteTier = { name: 'Default', weight: 1 };

// Returned by resolveTierFromRoles when a user's roles don't match any
// configured tier (or their external subscription has lapsed past its grace
// period — see subscriptions/server/sync.ts). Distinct from DEFAULT_TIER:
// DEFAULT_TIER is the single implicit tier used when VOTE_TIERS itself is
// unconfigured (everyone weighted equally); NO_ACCESS_TIER is for a
// deployment that *does* have real tiers configured, applied to a user
// who currently doesn't qualify for any of them. Always weight 0 — no
// configured tier's roles matching, or no active subscription, means
// no tokens, not a quiet fallback to the cheapest paid tier.
export const NO_ACCESS_TIER: VoteTier = { name: 'No Subscription', weight: 0 };

/** A tier's `roles`: a JSON array of role IDs, or a comma-separated string. */
function parseTierRoles(value: unknown): string[] | undefined {
	if (Array.isArray(value)) return value.filter((r): r is string => typeof r === 'string');
	if (typeof value === 'string') return parseRoleIds(value);
	return undefined;
}

/**
 * Parse VOTE_TIERS: `[{"name":"VIP","weight":2,"roles":["roleId",...]}, ...]`.
 * Unset (or `[]`) gives the implicit DEFAULT_TIER. Malformed JSON gives no
 * tiers at all — everyone gets 0 tokens and an error is logged — rather than
 * quietly handing every user a token because of a typo.
 */
export function parseVoteTiers(json: string | undefined): VoteTier[] {
	if (!json?.trim()) return [DEFAULT_TIER];
	let parsed: unknown;
	try {
		parsed = JSON.parse(json);
	} catch {
		logger.error('VOTE_TIERS is not valid JSON; no voting tiers are active');
		return [];
	}
	if (!Array.isArray(parsed)) {
		logger.error('VOTE_TIERS must be a JSON array; no voting tiers are active');
		return [];
	}
	if (parsed.length === 0) return [DEFAULT_TIER];
	return parsed
		.filter(
			(t): t is { name: string; weight: number; roles?: unknown } =>
				!!t && typeof t.name === 'string' && typeof t.weight === 'number'
		)
		.map((t) => {
			const roles = parseTierRoles(t.roles);
			return roles ? { name: t.name, weight: t.weight, roles } : { name: t.name, weight: t.weight };
		});
}

/**
 * The highest-weight tier whose roles the user holds, or NO_ACCESS_TIER.
 * A tier's roles come from its own `roles` in VOTE_TIERS, falling back to the
 * older VOTE_TIER_ROLES setting (`{"TierName": <role setting>}`). With
 * VOTE_TIERS unset, everyone gets DEFAULT_TIER.
 */
export function resolveTierFromRoles(
	tiers: VoteTier[],
	legacyTierRolesJson: string | undefined,
	guildRoles: Record<string, string[]>
): VoteTier {
	if (tiers.length === 1 && tiers[0] === DEFAULT_TIER) return DEFAULT_TIER;

	let legacy: Record<string, unknown> = {};
	if (legacyTierRolesJson?.trim()) {
		try {
			legacy = JSON.parse(legacyTierRolesJson);
		} catch {
			legacy = {};
		}
	}

	const sorted = [...tiers].sort((a, b) => b.weight - a.weight);
	for (const tier of sorted) {
		const legacyRoles = legacy[tier.name];
		const roles =
			tier.roles ??
			(legacyRoles === undefined
				? []
				: parseRoleIds(
						typeof legacyRoles === 'string' ? legacyRoles : JSON.stringify(legacyRoles)
					));
		if (hasAnyRole(roles, guildRoles)) return { name: tier.name, weight: tier.weight };
	}

	return NO_ACCESS_TIER;
}

export function resolveTier(
	tiers: VoteTier[],
	tierRolesJson: string | undefined,
	guildRoles: Record<string, string[]>,
	override: ResolvedTier | null
): ResolvedTier {
	if (override) return override;
	const tier = resolveTierFromRoles(tiers, tierRolesJson, guildRoles);
	return { tierName: tier.name, weight: tier.weight };
}

export function resolveOverrideTier(
	tiers: VoteTier[],
	overrideTierName: string | null
): ResolvedTier | null {
	if (!overrideTierName) return null;
	const match = tiers.find((t) => t.name === overrideTierName);
	return match ? { tierName: match.name, weight: match.weight } : null;
}
