import { redirect, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import {
	exchangeCode,
	fetchDiscordUser,
	fetchGuildRoles,
	oauthRedirectUri
} from '$lib/features/auth/server/discord';
import { getSessionStore } from '$lib/features/auth/server/store';
import { parseCsvIds } from '$lib/utils/csv';
import { logger } from '$lib/server/logger';
import { getPool } from '$lib/server/db';
import {
	parseVoteTiers,
	resolveTier,
	resolveOverrideTier
} from '$lib/features/voting/server/tiers';
import {
	upsertUserTier,
	getUserTierOverride,
	type QueryExecutor
} from '$lib/features/voting/server/votes';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, cookies, locals }) => {
	// Browser replayed the callback URL (e.g. back button) — session is
	// already valid, just go home instead of re-running the exchange.
	if (locals.user) redirect(302, '/');

	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');
	const storedState = cookies.get('oauth_state');

	if (!code || !state || state !== storedState) {
		error(400, 'Invalid OAuth state — please try logging in again.');
	}

	cookies.delete('oauth_state', { path: '/' });

	const config = {
		clientId: env.DISCORD_CLIENT_ID ?? '',
		clientSecret: env.DISCORD_CLIENT_SECRET ?? '',
		redirectUri: oauthRedirectUri(env.DISCORD_REDIRECT_URI, url.origin)
	};

	let token: string;
	try {
		token = await exchangeCode(config, code);
	} catch (err) {
		logger.error({ err }, 'Discord token exchange failed');
		error(502, 'Failed to exchange Discord code. Check DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET.');
	}

	let discordUser: Awaited<ReturnType<typeof fetchDiscordUser>>;
	try {
		discordUser = await fetchDiscordUser(token);
	} catch (err) {
		logger.error({ err }, 'Discord user profile fetch failed');
		error(502, 'Failed to fetch Discord user profile.');
	}

	const guildIds = parseCsvIds(env.DISCORD_GUILD_IDS);
	const guildRoles = await fetchGuildRoles(env.DISCORD_BOT_TOKEN ?? '', guildIds, discordUser.id);

	const pool = getPool(env.LOCAL_DATABASE_URL);
	if (pool) {
		const voteExecutor = pool as unknown as QueryExecutor;
		const tiers = parseVoteTiers(env.VOTE_TIERS);
		try {
			const overrideTierName = await getUserTierOverride(voteExecutor, discordUser.id);
			const override = resolveOverrideTier(tiers, overrideTierName);
			const resolved = resolveTier(tiers, env.VOTE_TIER_ROLES, guildRoles, override);
			await upsertUserTier(
				voteExecutor,
				discordUser.id,
				discordUser.username,
				resolved.tierName,
				resolved.weight
			);
		} catch (err) {
			logger.error({ err }, 'Failed to upsert user tier');
		}
	}

	const adminIds = parseCsvIds(env.ADMIN_DISCORD_IDS);

	const sessionId = await getSessionStore(env.LOCAL_DATABASE_URL).create({
		discordId: discordUser.id,
		username: discordUser.username,
		avatar: discordUser.avatar ?? null,
		guildRoles,
		isAdmin: adminIds.includes(discordUser.id)
	});

	cookies.set('session', sessionId, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		maxAge: 60 * 60 * 24 // 24 hours
	});

	redirect(302, '/');
};
