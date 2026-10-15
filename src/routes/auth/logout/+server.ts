import { redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { getSessionStore } from '$lib/features/auth/server/store';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ cookies }) => {
	const sessionId = cookies.get('session');
	if (sessionId) {
		await getSessionStore(env.LOCAL_DATABASE_URL).delete(sessionId);
		cookies.delete('session', { path: '/' });
	}
	redirect(302, '/');
};
