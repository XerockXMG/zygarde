import { describe, expect, it } from 'vitest';
import {
	parseVoteTiers,
	resolveTierFromRoles,
	resolveTier,
	resolveOverrideTier,
	DEFAULT_TIER,
	NO_ACCESS_TIER
} from './tiers';

describe('parseVoteTiers', () => {
	it('returns the default tier when config is undefined', () => {
		expect(parseVoteTiers(undefined)).toEqual([{ name: 'Default', weight: 1 }]);
	});

	it('returns the default tier when config is an empty string', () => {
		expect(parseVoteTiers('')).toEqual([{ name: 'Default', weight: 1 }]);
	});

	it('returns no tiers (not the default) when config is invalid JSON or not an array', () => {
		expect(parseVoteTiers('{not json')).toEqual([]);
		expect(parseVoteTiers('{"name":"VIP","weight":2}')).toEqual([]);
	});

	it("parses each tier's roles, as an array or a comma-separated string", () => {
		const json = JSON.stringify([
			{ name: 'VIP', weight: 2, roles: ['r1', 'r2'] },
			{ name: 'Gold', weight: 4, roles: 'r3, r4' }
		]);
		expect(parseVoteTiers(json)).toEqual([
			{ name: 'VIP', weight: 2, roles: ['r1', 'r2'] },
			{ name: 'Gold', weight: 4, roles: ['r3', 'r4'] }
		]);
	});

	it('parses a valid tier list', () => {
		const json = JSON.stringify([
			{ name: 'Free', weight: 1 },
			{ name: 'VIP', weight: 5 }
		]);
		expect(parseVoteTiers(json)).toEqual([
			{ name: 'Free', weight: 1 },
			{ name: 'VIP', weight: 5 }
		]);
	});

	it('returns the default tier when the array is empty', () => {
		expect(parseVoteTiers('[]')).toEqual([{ name: 'Default', weight: 1 }]);
	});
});

describe('resolveTierFromRoles with roles in VOTE_TIERS', () => {
	const tiers = [
		{ name: 'Free', weight: 1, roles: ['guild-1'] },
		{ name: 'VIP', weight: 2, roles: ['vip-role'] },
		{ name: 'Gold', weight: 4, roles: ['gold-role'] }
	];

	it('matches the highest-weight tier the user holds a role for, in any server', () => {
		const result = resolveTierFromRoles(tiers, undefined, {
			'guild-1': ['vip-role'],
			'guild-2': ['gold-role']
		});
		expect(result).toEqual({ name: 'Gold', weight: 4 });
	});

	it("matches a tier listing a server's own ID for any member of that server", () => {
		expect(resolveTierFromRoles(tiers, undefined, { 'guild-1': [] })).toEqual({
			name: 'Free',
			weight: 1
		});
	});

	it('returns NO_ACCESS_TIER when no tier matches', () => {
		expect(resolveTierFromRoles(tiers, undefined, { 'guild-9': ['x'] })).toEqual(NO_ACCESS_TIER);
	});

	it("prefers a tier's own roles over VOTE_TIER_ROLES", () => {
		const legacy = JSON.stringify({ VIP: { 'guild-1': ['legacy-role'] } });
		expect(resolveTierFromRoles(tiers, legacy, { 'guild-1': ['legacy-role'] })).toEqual({
			name: 'Free',
			weight: 1
		});
	});
});

describe('resolveTierFromRoles with VOTE_TIERS unset', () => {
	it('gives every user the implicit 1-token tier', () => {
		const tiers = parseVoteTiers(undefined);
		expect(resolveTierFromRoles(tiers, undefined, {})).toBe(DEFAULT_TIER);
		expect(DEFAULT_TIER.weight).toBe(1);
	});

	it('does not apply to a configured tier that happens to be named Default', () => {
		const tiers = parseVoteTiers('[{"name":"Default","weight":1,"roles":["r1"]}]');
		expect(resolveTierFromRoles(tiers, undefined, {})).toEqual(NO_ACCESS_TIER);
	});
});

describe('resolveTierFromRoles with legacy VOTE_TIER_ROLES', () => {
	const tiers = [
		{ name: 'Free', weight: 1 },
		{ name: 'Supporter', weight: 3 },
		{ name: 'VIP', weight: 5 }
	];

	it('matches the highest-weight tier the user qualifies for', () => {
		const tierRoles = JSON.stringify({
			VIP: { g1: ['vip-role'] },
			Supporter: { g1: ['vip-role', 'supporter-role'] }
		});
		const result = resolveTierFromRoles(tiers, tierRoles, { g1: ['vip-role'] });
		expect(result).toEqual({ name: 'VIP', weight: 5 });
	});

	it('matches a lower tier when the user only qualifies for that one', () => {
		const tierRoles = JSON.stringify({
			VIP: { g1: ['vip-role'] },
			Supporter: { g1: ['supporter-role'] }
		});
		const result = resolveTierFromRoles(tiers, tierRoles, { g1: ['supporter-role'] });
		expect(result).toEqual({ name: 'Supporter', weight: 3 });
	});

	it('falls back to NO_ACCESS_TIER (weight 0) when nothing matches, not the cheapest configured tier', () => {
		const tierRoles = JSON.stringify({ VIP: { g1: ['vip-role'] } });
		const result = resolveTierFromRoles(tiers, tierRoles, { g1: ['some-other-role'] });
		expect(result).toEqual(NO_ACCESS_TIER);
		expect(result.weight).toBe(0);
	});

	it('falls back to NO_ACCESS_TIER when tierRolesJson is undefined', () => {
		const result = resolveTierFromRoles(tiers, undefined, { g1: ['vip-role'] });
		expect(result).toEqual(NO_ACCESS_TIER);
	});

	it('falls back to NO_ACCESS_TIER when the user has no guild roles at all', () => {
		const tierRoles = JSON.stringify({ VIP: { g1: ['vip-role'] } });
		const result = resolveTierFromRoles(tiers, tierRoles, {});
		expect(result).toEqual(NO_ACCESS_TIER);
	});
});

describe('resolveTier', () => {
	const tiers = [
		{ name: 'Free', weight: 1 },
		{ name: 'VIP', weight: 5 }
	];

	it('returns the override when one is given, ignoring roles', () => {
		const tierRoles = JSON.stringify({ VIP: { g1: ['vip-role'] } });
		const result = resolveTier(
			tiers,
			tierRoles,
			{ g1: ['vip-role'] },
			{
				tierName: 'Custom',
				weight: 99
			}
		);
		expect(result).toEqual({ tierName: 'Custom', weight: 99 });
	});

	it('delegates to role-based resolution when there is no override', () => {
		const tierRoles = JSON.stringify({ VIP: { g1: ['vip-role'] } });
		const result = resolveTier(tiers, tierRoles, { g1: ['vip-role'] }, null);
		expect(result).toEqual({ tierName: 'VIP', weight: 5 });
	});

	it('delegates to NO_ACCESS_TIER (weight 0) when there is no override and roles do not match', () => {
		const tierRoles = JSON.stringify({ VIP: { g1: ['vip-role'] } });
		const result = resolveTier(tiers, tierRoles, { g1: ['unrelated-role'] }, null);
		expect(result).toEqual({ tierName: NO_ACCESS_TIER.name, weight: 0 });
	});
});

describe('resolveOverrideTier', () => {
	const tiers = [
		{ name: 'Free', weight: 1 },
		{ name: 'VIP', weight: 5 }
	];

	it('returns null when there is no override', () => {
		expect(resolveOverrideTier(tiers, null)).toBeNull();
	});

	it('returns the matching tier when the override name is configured', () => {
		expect(resolveOverrideTier(tiers, 'VIP')).toEqual({ tierName: 'VIP', weight: 5 });
	});

	it('returns null when the override name no longer matches any configured tier', () => {
		expect(resolveOverrideTier(tiers, 'Retired')).toBeNull();
	});
});
