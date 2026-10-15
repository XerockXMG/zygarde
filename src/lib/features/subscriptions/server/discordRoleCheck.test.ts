import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkUserHasRequiredRole } from './discordRoleCheck';

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('checkUserHasRequiredRole', () => {
	it('returns true when the user holds one of the required roles in a listed server', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({ ok: true, json: async () => ({ roles: ['r1', 'r2'] }) })
		);

		await expect(checkUserHasRequiredRole('bot-token', 'r1,r9', ['g1'], 'u1')).resolves.toBe(true);
	});

	it("returns false when the user's roles don't match", async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({ ok: true, json: async () => ({ roles: ['other-role'] }) })
		);

		await expect(checkUserHasRequiredRole('bot-token', 'r1', ['g1'], 'u1')).resolves.toBe(false);
	});

	it('returns false when the user is not a member of any listed server', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));

		await expect(checkUserHasRequiredRole('bot-token', 'r1', ['g1'], 'u1')).resolves.toBe(false);
	});

	it('also checks servers named in the legacy JSON shape', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue({ ok: true, json: async () => ({ roles: ['r1'] }) });
		vi.stubGlobal('fetch', fetchMock);

		await expect(checkUserHasRequiredRole('bot-token', '{"g1":["r1"]}', [], 'u1')).resolves.toBe(
			true
		);
		expect(fetchMock.mock.calls[0][0]).toContain('/guilds/g1/members/u1');
	});

	it('returns false without calling Discord when no roles or no servers are configured', async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);

		await expect(checkUserHasRequiredRole('bot-token', '', ['g1'], 'u1')).resolves.toBe(false);
		await expect(checkUserHasRequiredRole('bot-token', '{bad', ['g1'], 'u1')).resolves.toBe(false);
		await expect(checkUserHasRequiredRole('bot-token', 'r1', [], 'u1')).resolves.toBe(false);
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
