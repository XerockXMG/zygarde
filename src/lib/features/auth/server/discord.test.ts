import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	buildAuthorizeUrl,
	exchangeCode,
	fetchDiscordUser,
	fetchGuildRoles,
	oauthRedirectUri
} from './discord';

const config = {
	clientId: 'client-123',
	clientSecret: 'secret-abc',
	redirectUri: 'http://localhost:5173/auth/discord/callback'
};

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('buildAuthorizeUrl', () => {
	it('builds the Discord authorize URL with the expected query params', () => {
		const url = new URL(buildAuthorizeUrl(config, 'state-xyz'));
		expect(url.origin + url.pathname).toBe('https://discord.com/oauth2/authorize');
		expect(url.searchParams.get('client_id')).toBe('client-123');
		expect(url.searchParams.get('redirect_uri')).toBe(config.redirectUri);
		expect(url.searchParams.get('response_type')).toBe('code');
		expect(url.searchParams.get('scope')).toBe('identify guilds');
		expect(url.searchParams.get('state')).toBe('state-xyz');
	});
});

describe('exchangeCode', () => {
	it('posts the code to the token endpoint and returns the access token', async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ access_token: 'token-456' })
		});
		vi.stubGlobal('fetch', fetchMock);

		const token = await exchangeCode(config, 'code-789');

		expect(token).toBe('token-456');
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe('https://discord.com/api/v10/oauth2/token');
		expect(init.method).toBe('POST');
		const body = new URLSearchParams(init.body as string);
		expect(body.get('code')).toBe('code-789');
		expect(body.get('client_id')).toBe('client-123');
		expect(body.get('grant_type')).toBe('authorization_code');
	});

	it('throws when Discord responds with a non-OK status', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400 }));
		await expect(exchangeCode(config, 'bad-code')).rejects.toThrow('400');
	});
});

describe('fetchDiscordUser', () => {
	it('fetches the current user with a bearer token', async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ id: 'u1', username: 'someone', avatar: 'hash' })
		});
		vi.stubGlobal('fetch', fetchMock);

		const user = await fetchDiscordUser('token-456');

		expect(user).toEqual({ id: 'u1', username: 'someone', avatar: 'hash' });
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe('https://discord.com/api/v10/users/@me');
		expect(init.headers.Authorization).toBe('Bearer token-456');
	});

	it('throws when Discord responds with a non-OK status', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));
		await expect(fetchDiscordUser('bad-token')).rejects.toThrow('401');
	});
});

describe('oauthRedirectUri', () => {
	it('defaults to the callback path on the site origin', () => {
		expect(oauthRedirectUri(undefined, 'https://areas.example.com')).toBe(
			'https://areas.example.com/auth/discord/callback'
		);
		expect(oauthRedirectUri('  ', 'http://localhost:5173')).toBe(
			'http://localhost:5173/auth/discord/callback'
		);
	});

	it('uses DISCORD_REDIRECT_URI when set', () => {
		expect(oauthRedirectUri('https://other.example.com/cb', 'https://areas.example.com')).toBe(
			'https://other.example.com/cb'
		);
	});
});

describe('fetchGuildRoles', () => {
	it('returns a map of guildId to roles for guilds the user is a member of', async () => {
		const fetchMock = vi.fn().mockImplementation(async (url: string) => {
			if (url.includes('/guilds/g1/members/u1')) {
				return { ok: true, json: async () => ({ roles: ['r1', 'r2'] }) };
			}
			if (url.includes('/guilds/g2/members/u1')) {
				return { ok: false, status: 404 }; // not a member
			}
			throw new Error(`unexpected url: ${url}`);
		});
		vi.stubGlobal('fetch', fetchMock);

		const roles = await fetchGuildRoles('bot-token', ['g1', 'g2'], 'u1');

		expect(roles).toEqual({ g1: ['r1', 'r2'] });
	});

	it('keeps a server the user is a member of even when they have no roles there', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({ ok: true, json: async () => ({ roles: [] }) })
		);

		const roles = await fetchGuildRoles('bot-token', ['g1'], 'u1');

		expect(roles).toEqual({ g1: [] });
	});

	it('returns an empty object when there is no bot token', async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
		const roles = await fetchGuildRoles('', ['g1'], 'u1');
		expect(roles).toEqual({});
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('returns an empty object when there are no guild ids', async () => {
		const roles = await fetchGuildRoles('bot-token', [], 'u1');
		expect(roles).toEqual({});
	});

	it('retries on 429 honoring Retry-After, then succeeds', async () => {
		let calls = 0;
		const fetchMock = vi.fn().mockImplementation(async () => {
			calls++;
			if (calls === 1) {
				return {
					ok: false,
					status: 429,
					headers: { get: (name: string) => (name === 'Retry-After' ? '0' : null) }
				};
			}
			return { ok: true, json: async () => ({ roles: ['r1'] }) };
		});
		vi.stubGlobal('fetch', fetchMock);

		const roles = await fetchGuildRoles('bot-token', ['g1'], 'u1');

		expect(roles).toEqual({ g1: ['r1'] });
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('gives up after exhausting retries on a sustained 429 and omits that guild', async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: false,
			status: 429,
			headers: { get: (name: string) => (name === 'Retry-After' ? '0' : null) }
		});
		vi.stubGlobal('fetch', fetchMock);

		const roles = await fetchGuildRoles('bot-token', ['g1'], 'u1');

		expect(roles).toEqual({});
		// Initial attempt + 3 retries = 4 total calls.
		expect(fetchMock).toHaveBeenCalledTimes(4);
	});
});
