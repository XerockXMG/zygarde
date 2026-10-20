import { error, type Handle } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { getPool, ensureSchema } from '$lib/server/db';
import { getSessionStore } from '$lib/features/auth/server/store';
import {
	startOrphanVoteCleanupScheduler,
	startSubscriptionSyncScheduler,
	startTemporaryAreaScheduler,
	startWorkerAutoscaleScheduler
} from '$lib/server/scheduler';
import { logger } from '$lib/server/logger';
import { buildHeadTags, HEAD_PLACEHOLDER } from '$lib/server/pageHead';

const pool = getPool(env.LOCAL_DATABASE_URL);
if (pool) {
	try {
		await ensureSchema(pool);
	} catch (err) {
		logger.error({ err }, 'schema bootstrap failed — check LOCAL_DATABASE_URL');
		throw err;
	}
}

startSubscriptionSyncScheduler();
startWorkerAutoscaleScheduler();
startOrphanVoteCleanupScheduler();
startTemporaryAreaScheduler();

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.user = null;
	const sessionId = event.cookies.get('session');
	if (sessionId) {
		event.locals.user = await getSessionStore(env.LOCAL_DATABASE_URL).get(sessionId);
	}

	if (event.url.pathname.startsWith('/admin') && !event.locals.user?.isAdmin) {
		error(403, 'Admin access required.');
	}

	// Favicon + optional Google Analytics tags, from runtime env (see pageHead.ts).
	return resolve(event, {
		transformPageChunk: ({ html }) =>
			html.includes(HEAD_PLACEHOLDER)
				? html.replace(
						HEAD_PLACEHOLDER,
						buildHeadTags({
							FAVICON_PATH: env.FAVICON_PATH,
							GA_MEASUREMENT_ID: env.GA_MEASUREMENT_ID
						})
					)
				: html
	});
};
