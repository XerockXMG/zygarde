/**
 * Admin-tunable voting settings, stored as a single row (id=1) in the local
 * DB — matches the spawnpoint_settings/map_settings precedent.
 */
export interface QueryExecutor {
	execute<T = unknown>(sql: string, params?: unknown[]): Promise<[T, unknown]>;
}

export interface VotingSettings {
	workersPerToken: number;
	subscriptionGracePeriodDays: number;
	autoscaleIntervalMinutes: number;
}

export const DEFAULT_VOTING_SETTINGS: VotingSettings = {
	workersPerToken: 1,
	subscriptionGracePeriodDays: 7,
	autoscaleIntervalMinutes: 15
};

interface SettingsRow {
	workers_per_token: number;
	subscription_grace_period_days: number;
	autoscale_interval_minutes: number;
}

export async function getVotingSettings(executor: QueryExecutor): Promise<VotingSettings> {
	const [rows] = await executor.execute<SettingsRow[]>(
		`SELECT workers_per_token, subscription_grace_period_days, autoscale_interval_minutes
		 FROM voting_settings WHERE id = 1`
	);
	const row = rows[0];
	if (!row) return { ...DEFAULT_VOTING_SETTINGS };
	return {
		workersPerToken: row.workers_per_token,
		subscriptionGracePeriodDays: row.subscription_grace_period_days,
		autoscaleIntervalMinutes: row.autoscale_interval_minutes
	};
}

/**
 * Save the Tiers page's settings. Only touches its own two columns, so it
 * can't clobber the autoscale interval saved from the Autoscale page.
 */
export async function setVotingSettings(
	executor: QueryExecutor,
	workersPerToken: number,
	subscriptionGracePeriodDays: number
): Promise<void> {
	await executor.execute(
		`INSERT INTO voting_settings (id, workers_per_token, subscription_grace_period_days)
		 VALUES (1, ?, ?)
		 ON DUPLICATE KEY UPDATE workers_per_token = VALUES(workers_per_token),
		                          subscription_grace_period_days = VALUES(subscription_grace_period_days)`,
		[workersPerToken, subscriptionGracePeriodDays]
	);
}

/** Save the Autoscale page's sync interval, leaving the voting settings alone. */
export async function setAutoscaleInterval(
	executor: QueryExecutor,
	autoscaleIntervalMinutes: number
): Promise<void> {
	await executor.execute(
		`INSERT INTO voting_settings (id, autoscale_interval_minutes)
		 VALUES (1, ?)
		 ON DUPLICATE KEY UPDATE autoscale_interval_minutes = VALUES(autoscale_interval_minutes)`,
		[autoscaleIntervalMinutes]
	);
}
