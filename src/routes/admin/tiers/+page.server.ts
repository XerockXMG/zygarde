import { error, fail } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { getPool } from '$lib/server/db';
import { parseVoteTiers, resolveTierFromRoles } from '$lib/features/voting/server/tiers';
import { parseCsvIds } from '$lib/utils/csv';
import { fetchGuildRoles } from '$lib/features/auth/server/discord';
import { logger } from '$lib/server/logger';
import {
	listUserTiers,
	setTierOverride,
	clearTierOverride,
	applyResolvedTier,
	type QueryExecutor
} from '$lib/features/voting/server/votes';
import {
	getVotingSettings,
	setVotingSettings,
	type QueryExecutor as VotingSettingsQueryExecutor
} from '$lib/features/voting/server/settings';
import type { PageServerLoad, Actions } from './$types';

const DISCORD_ID_RE = /^\d{17,20}$/;

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user?.isAdmin) error(403, 'Admin access required.');

	const pool = getPool(env.LOCAL_DATABASE_URL);
	if (!pool) {
		error(503, 'Tier management requires LOCAL_DATABASE_URL to be configured.');
	}
	const executor = pool as unknown as QueryExecutor;
	const users = await listUserTiers(executor);
	// Names and weights only — the page has no use for the role IDs.
	const tiers = parseVoteTiers(env.VOTE_TIERS).map(({ name, weight }) => ({ name, weight }));
	const votingSettings = await getVotingSettings(pool as unknown as VotingSettingsQueryExecutor);
	return { users, tiers, votingSettings };
};

export const actions: Actions = {
	setOverride: async ({ request, locals }) => {
		if (!locals.user?.isAdmin) return fail(403, { message: 'Admin access required.' });

		const form = await request.formData();
		const discordId = form.get('discordId');
		const tierName = form.get('tierName');

		if (
			typeof discordId !== 'string' ||
			!DISCORD_ID_RE.test(discordId) ||
			typeof tierName !== 'string' ||
			!tierName
		) {
			return fail(400, { message: 'Invalid request.' });
		}

		const tiers = parseVoteTiers(env.VOTE_TIERS);
		const match = tiers.find((t) => t.name === tierName);
		if (!match) return fail(400, { message: 'Unknown tier.' });

		const pool = getPool(env.LOCAL_DATABASE_URL);
		if (!pool) return fail(503, { message: 'Tier management is not available right now.' });
		const executor = pool as unknown as QueryExecutor;

		try {
			await setTierOverride(executor, discordId, tierName, locals.user.discordId);
			await applyResolvedTier(executor, discordId, match.name, match.weight);
		} catch (err) {
			logger.error({ err, discordId, tierName }, 'Failed to set tier override');
			return fail(502, { message: 'Failed to set override.' });
		}
		return { success: true };
	},

	clearOverride: async ({ request, locals }) => {
		if (!locals.user?.isAdmin) return fail(403, { message: 'Admin access required.' });

		const form = await request.formData();
		const discordId = form.get('discordId');

		// Validated before it's interpolated into a Discord API path (fetchGuildRoles)
		if (typeof discordId !== 'string' || !DISCORD_ID_RE.test(discordId)) {
			return fail(400, { message: 'Invalid request.' });
		}

		if (!env.DISCORD_BOT_TOKEN) {
			return fail(503, {
				message: 'Cannot re-derive roles — Discord bot token is not configured.'
			});
		}

		const pool = getPool(env.LOCAL_DATABASE_URL);
		if (!pool) return fail(503, { message: 'Tier management is not available right now.' });
		const executor = pool as unknown as QueryExecutor;

		try {
			const tiers = parseVoteTiers(env.VOTE_TIERS);
			const guildIds = parseCsvIds(env.DISCORD_GUILD_IDS);
			const guildRoles = await fetchGuildRoles(env.DISCORD_BOT_TOKEN, guildIds, discordId);
			const resolvedTier = resolveTierFromRoles(tiers, env.VOTE_TIER_ROLES, guildRoles);

			await clearTierOverride(executor, discordId);
			await applyResolvedTier(executor, discordId, resolvedTier.name, resolvedTier.weight);
		} catch (err) {
			logger.error({ err, discordId }, 'Failed to clear tier override');
			return fail(502, { message: 'Failed to clear override.' });
		}
		return { success: true };
	},

	saveVotingSettings: async ({ request, locals }) => {
		if (!locals.user?.isAdmin) return fail(403, { message: 'Admin access required.' });

		const form = await request.formData();
		const workersPerTokenRaw = form.get('workersPerToken');
		const gracePeriodRaw = form.get('subscriptionGracePeriodDays');
		if (typeof workersPerTokenRaw !== 'string' || typeof gracePeriodRaw !== 'string') {
			return fail(400, { message: 'Invalid settings payload.' });
		}
		const workersPerToken = parseInt(workersPerTokenRaw, 10);
		const subscriptionGracePeriodDays = parseInt(gracePeriodRaw, 10);

		if (isNaN(workersPerToken) || workersPerToken < 1 || workersPerToken > 1000) {
			return fail(400, { message: 'Workers per token must be 1–1000' });
		}
		if (
			isNaN(subscriptionGracePeriodDays) ||
			subscriptionGracePeriodDays < 1 ||
			subscriptionGracePeriodDays > 90
		) {
			return fail(400, { message: 'Subscription grace period must be 1–90 days' });
		}

		const pool = getPool(env.LOCAL_DATABASE_URL);
		if (!pool) {
			return fail(503, { message: 'Settings require LOCAL_DATABASE_URL to be configured.' });
		}
		const executor = pool as unknown as VotingSettingsQueryExecutor;

		await setVotingSettings(executor, workersPerToken, subscriptionGracePeriodDays);
		return { success: true };
	}
};
