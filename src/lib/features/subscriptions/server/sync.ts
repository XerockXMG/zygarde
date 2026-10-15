import { checkUserHasRequiredRole } from './discordRoleCheck';
import {
	applyResolvedTier,
	listUserTiers,
	type QueryExecutor
} from '$lib/features/voting/server/votes';
import type { SubscriptionSyncResult } from '../types';

export type { QueryExecutor };

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Pacing between per-user Discord lookups so a whole-community daily check
// stays well under Discord's rate limits — not user-configurable, just a
// sane constant (each user's own guild lookups already run in parallel via
// fetchGuildRoles, this only paces *between* users).
const CHECK_PACING_MS = 250;

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

interface FailingSinceRow {
	failing_since: string | Date | null;
}

/**
 * Checks every currently-elevated, non-overridden user's Discord roles and
 * downgrades anyone who has been failing the check for longer than
 * graceDays back to the default tier (applyResolvedTier already cascades
 * into enforceUserBudget, trimming their votes as a side effect).
 *
 * subscription_role_checks.failing_since is the START of a user's current
 * failing streak, not "the last time a check failed" — it's set once on the
 * first failure and left untouched on every subsequent failure while the
 * streak continues, then cleared the moment a check passes. Overwriting it
 * on every failure would perpetually reset the grace-period clock and no
 * one would ever lapse. Example: fails Monday -> failing_since = Monday;
 * fails Tuesday -> still Monday; fails again 7 days after Monday ->
 * downgraded (and the row is cleared, so a future re-subscribe starts a
 * clean streak rather than inheriting the old timestamp).
 */
export async function syncSubscriptionRoleChecks(
	localExecutor: QueryExecutor,
	botToken: string,
	requiredRoles: string,
	guildIds: string[],
	graceDays: number,
	defaultTierName: string,
	defaultTierWeight: number
): Promise<SubscriptionSyncResult> {
	const currentTiers = await listUserTiers(localExecutor);
	const candidates = currentTiers.filter((t) => t.weight > 0 && t.source !== 'override');

	const downgraded: string[] = [];

	for (let i = 0; i < candidates.length; i++) {
		if (i > 0) await sleep(CHECK_PACING_MS);

		const { discordId } = candidates[i];
		const hasRole = await checkUserHasRequiredRole(botToken, requiredRoles, guildIds, discordId);

		if (hasRole) {
			await localExecutor.execute('DELETE FROM subscription_role_checks WHERE discord_id = ?', [
				discordId
			]);
			continue;
		}

		const [rows] = await localExecutor.execute<FailingSinceRow[]>(
			'SELECT failing_since FROM subscription_role_checks WHERE discord_id = ?',
			[discordId]
		);
		const failingSince = rows[0]?.failing_since ?? null;

		if (failingSince === null) {
			// First failure of a new streak — start the clock, no downgrade yet.
			await localExecutor.execute(
				`INSERT INTO subscription_role_checks (discord_id, failing_since) VALUES (?, NOW())
				 ON DUPLICATE KEY UPDATE failing_since = VALUES(failing_since)`,
				[discordId]
			);
			continue;
		}

		const failingSinceMs = new Date(failingSince).getTime();
		const pastGrace = Date.now() - failingSinceMs >= graceDays * MS_PER_DAY;
		if (!pastGrace) continue; // streak already ticking, still within grace

		await applyResolvedTier(localExecutor, discordId, defaultTierName, defaultTierWeight);
		await localExecutor.execute('DELETE FROM subscription_role_checks WHERE discord_id = ?', [
			discordId
		]);
		downgraded.push(discordId);
	}

	return { downgraded };
}
