import { error, fail } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { getPool } from '$lib/server/db';
import {
	getSettings,
	setSettings,
	DEFAULT_SETTINGS,
	type QueryExecutor as SettingsQueryExecutor
} from '$lib/features/spawnpoints/server/settings';
import {
	testConnection,
	getCacheStats,
	invalidateCache,
	type QueryExecutor as GolbatQueryExecutor
} from '$lib/features/spawnpoints/server/golbat';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user?.isAdmin) error(403, 'Admin access required.');

	const pool = getPool(env.LOCAL_DATABASE_URL);
	const executor = pool ? (pool as unknown as SettingsQueryExecutor) : null;
	const cacheExecutor = pool ? (pool as unknown as GolbatQueryExecutor) : null;

	const [settings, golbatStatus, cacheStats] = await Promise.all([
		executor ? getSettings(executor) : Promise.resolve(DEFAULT_SETTINGS),
		testConnection(),
		getCacheStats(cacheExecutor)
	]);

	return { settings, golbatStatus, cacheStats };
};

export const actions: Actions = {
	saveSettings: async ({ request, locals }) => {
		if (!locals.user?.isAdmin) return fail(403, { message: 'Admin access required.' });

		const form = await request.formData();
		const recentDaysRaw = form.get('recentDays');
		const cacheTtlHoursRaw = form.get('cacheTtlHours');
		if (typeof recentDaysRaw !== 'string' || typeof cacheTtlHoursRaw !== 'string') {
			return fail(400, { message: 'Invalid settings payload.' });
		}
		const recentDays = parseInt(recentDaysRaw, 10);
		const cacheTtlHours = parseInt(cacheTtlHoursRaw, 10);

		if (isNaN(recentDays) || recentDays < 1 || recentDays > 365) {
			return fail(400, { message: 'Recent window must be 1–365 days' });
		}
		if (isNaN(cacheTtlHours) || cacheTtlHours < 1 || cacheTtlHours > 168) {
			return fail(400, { message: 'Cache TTL must be 1–168 hours' });
		}

		const pool = getPool(env.LOCAL_DATABASE_URL);
		if (!pool) {
			return fail(503, { message: 'Settings require LOCAL_DATABASE_URL to be configured.' });
		}
		const executor = pool as unknown as SettingsQueryExecutor;

		await setSettings(executor, recentDays, cacheTtlHours);
		await invalidateCache(pool as unknown as GolbatQueryExecutor);

		return { success: true };
	},

	clearCache: async ({ locals }) => {
		if (!locals.user?.isAdmin) return fail(403, { message: 'Admin access required.' });

		const pool = getPool(env.LOCAL_DATABASE_URL);
		const cacheExecutor = pool ? (pool as unknown as GolbatQueryExecutor) : null;
		await invalidateCache(cacheExecutor);

		return { success: true };
	}
};
