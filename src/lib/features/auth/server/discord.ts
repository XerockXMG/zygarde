const API = 'https://discord.com/api/v10';

export interface DiscordOAuthConfig {
	clientId: string;
	clientSecret: string;
	redirectUri: string;
}

/**
 * The OAuth redirect URI: DISCORD_REDIRECT_URI when set, otherwise
 * `<site origin>/auth/discord/callback`. The origin is the request's, which
 * adapter-node takes from ORIGIN in production. Whatever this returns must be
 * listed under Redirects in the Discord application's OAuth2 settings.
 */
export function oauthRedirectUri(override: string | undefined, origin: string): string {
	return override?.trim() || `${origin}/auth/discord/callback`;
}

export function buildAuthorizeUrl(
	config: Pick<DiscordOAuthConfig, 'clientId' | 'redirectUri'>,
	state: string
): string {
	const params = new URLSearchParams({
		client_id: config.clientId,
		redirect_uri: config.redirectUri,
		response_type: 'code',
		scope: 'identify guilds',
		state
	});
	return `https://discord.com/oauth2/authorize?${params}`;
}

export async function exchangeCode(config: DiscordOAuthConfig, code: string): Promise<string> {
	const res = await fetch(`${API}/oauth2/token`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			client_id: config.clientId,
			client_secret: config.clientSecret,
			grant_type: 'authorization_code',
			code,
			redirect_uri: config.redirectUri
		})
	});
	if (!res.ok) throw new Error(`Discord token exchange failed: ${res.status}`);
	const data = await res.json();
	return data.access_token as string;
}

export interface DiscordUser {
	id: string;
	username: string;
	avatar: string | null;
}

export async function fetchDiscordUser(accessToken: string): Promise<DiscordUser> {
	const res = await fetch(`${API}/users/@me`, {
		headers: { Authorization: `Bearer ${accessToken}` }
	});
	if (!res.ok) throw new Error(`Discord user fetch failed: ${res.status}`);
	return res.json();
}

const MAX_RATE_LIMIT_RETRIES = 3;

/**
 * Fetches a single guild member, retrying on 429 (rate limited) by honoring
 * Discord's Retry-After header — a transient rate limit must never be
 * misread as "this user isn't in the guild" or "has no roles." If retries
 * are exhausted (a sustained outage, not a normal rate limit), returns the
 * last response as-is and lets the caller fall back to treating it like a
 * 404 for this run — safe in practice for fetchGuildRoles' callers because
 * the subscription role check's grace period spans multiple days, so a
 * single bad run misreading "no role" self-corrects on the next check
 * unless the outage somehow persists for the entire grace window.
 */
async function fetchGuildMember(
	guildId: string,
	userId: string,
	botToken: string
): Promise<Response> {
	const url = `${API}/guilds/${guildId}/members/${userId}`;
	let res = await fetch(url, { headers: { Authorization: `Bot ${botToken}` } });

	for (let attempt = 0; res.status === 429 && attempt < MAX_RATE_LIMIT_RETRIES; attempt++) {
		const retryAfterHeader = res.headers.get('Retry-After');
		const retryAfterSeconds = retryAfterHeader ? parseFloat(retryAfterHeader) : 1;
		await new Promise((resolve) => setTimeout(resolve, retryAfterSeconds * 1000));
		res = await fetch(url, { headers: { Authorization: `Bot ${botToken}` } });
	}

	return res;
}

export async function fetchGuildRoles(
	botToken: string,
	guildIds: string[],
	userId: string
): Promise<Record<string, string[]>> {
	if (!botToken || guildIds.length === 0) return {};

	const entries = await Promise.all(
		guildIds.map(async (guildId) => {
			const res = await fetchGuildMember(guildId, userId, botToken);
			if (!res.ok) return null; // not a member, bot lacks access, or retries exhausted
			const member = await res.json();
			// Kept even with no roles: membership alone matches the server's own
			// ID (its @everyone role) in role settings — see utils/access.ts.
			const roles = (member.roles as string[]) ?? [];
			return [guildId, roles] as const;
		})
	);

	return Object.fromEntries(entries.filter((e): e is [string, string[]] => e !== null));
}
