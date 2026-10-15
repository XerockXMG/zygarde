import { redirect } from '@sveltejs/kit';
import crypto from 'node:crypto';
import { env } from '$env/dynamic/private';
import { buildAuthorizeUrl, oauthRedirectUri } from '$lib/features/auth/server/discord';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ cookies, url }) => {
	const state = crypto.randomBytes(16).toString('hex');
	cookies.set('oauth_state', state, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		maxAge: 600 // 10 minutes
	});
	redirect(
		302,
		buildAuthorizeUrl(
			{
				clientId: env.DISCORD_CLIENT_ID ?? '',
				redirectUri: oauthRedirectUri(env.DISCORD_REDIRECT_URI, url.origin)
			},
			state
		)
	);
};
