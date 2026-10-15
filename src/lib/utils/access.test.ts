import { describe, expect, it } from 'vitest';
import { hasAccess, hasAnyRole, legacyGuildIds, parseRoleIds } from './access';

describe('parseRoleIds', () => {
	it('returns an empty list when unset or blank', () => {
		expect(parseRoleIds(undefined)).toEqual([]);
		expect(parseRoleIds('  ')).toEqual([]);
	});

	it('parses a comma-separated list, trimming spaces and empty entries', () => {
		expect(parseRoleIds(' r1, r2 ,,r3 ')).toEqual(['r1', 'r2', 'r3']);
	});

	it('flattens the legacy {guildId: [roleId]} JSON shape to its role IDs', () => {
		expect(parseRoleIds('{"g1":["r1","r2"],"g2":["r3"]}')).toEqual(['r1', 'r2', 'r3']);
	});

	it('skips non-array and non-string values in the legacy shape', () => {
		expect(parseRoleIds('{"g1":"r1","g2":["r2",5]}')).toEqual(['r2']);
	});

	it('returns an empty list for malformed legacy JSON', () => {
		expect(parseRoleIds('{not json')).toEqual([]);
	});
});

describe('legacyGuildIds', () => {
	it('returns the server keys of the legacy shape', () => {
		expect(legacyGuildIds('{"g1":["r1"],"g2":[]}')).toEqual(['g1', 'g2']);
	});

	it('returns nothing for a plain role list, unset, or malformed JSON', () => {
		expect(legacyGuildIds('r1,r2')).toEqual([]);
		expect(legacyGuildIds(undefined)).toEqual([]);
		expect(legacyGuildIds('{bad')).toEqual([]);
	});
});

describe('hasAnyRole', () => {
	it('matches a listed role in any server', () => {
		expect(hasAnyRole(['r2'], { g1: ['r1'], g2: ['r2'] })).toBe(true);
	});

	it("treats a server's own ID as its @everyone role", () => {
		expect(hasAnyRole(['g1'], { g1: [] })).toBe(true);
	});

	it('does not match when the user has none of the roles', () => {
		expect(hasAnyRole(['r9'], { g1: ['r1'] })).toBe(false);
		expect(hasAnyRole(['r1'], {})).toBe(false);
	});

	it('never matches an empty role list', () => {
		expect(hasAnyRole([], { g1: ['r1'] })).toBe(false);
	});
});

describe('hasAccess', () => {
	it('returns false when the setting is unset or empty', () => {
		expect(hasAccess(undefined, { g1: ['r1'] })).toBe(false);
		expect(hasAccess('', { g1: ['r1'] })).toBe(false);
	});

	it('checks a plain role list', () => {
		expect(hasAccess('r1,r2', { g1: ['r2'] })).toBe(true);
		expect(hasAccess('r1,r2', { g1: ['r3'] })).toBe(false);
	});

	it('still accepts the legacy JSON shape', () => {
		expect(hasAccess('{"g1":["r1","r2"]}', { g1: ['r2'] })).toBe(true);
	});

	it('returns false for malformed legacy JSON', () => {
		expect(hasAccess('{not json', { g1: ['r1'] })).toBe(false);
	});
});
