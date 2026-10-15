/**
 * Admin-tunable spawnpoint settings, stored as a single row (id=1) in the
 * local DB. A dedicated table rather than a generic key-value store —
 * matches this app's one-table-per-feature precedent (user_tiers,
 * area_requests) instead of the old app's shared admin_settings table.
 */
export interface QueryExecutor {
	execute<T = unknown>(sql: string, params?: unknown[]): Promise<[T, unknown]>;
}

export interface SpawnpointSettings {
	recentDays: number;
	cacheTtlHours: number;
}

export const DEFAULT_SETTINGS: SpawnpointSettings = {
	recentDays: 30,
	cacheTtlHours: 72
};

interface SettingsRow {
	recent_days: number;
	cache_ttl_hours: number;
}

export async function getSettings(executor: QueryExecutor): Promise<SpawnpointSettings> {
	const [rows] = await executor.execute<SettingsRow[]>(
		'SELECT recent_days, cache_ttl_hours FROM spawnpoint_settings WHERE id = 1'
	);
	const row = rows[0];
	if (!row) return { ...DEFAULT_SETTINGS };
	return { recentDays: row.recent_days, cacheTtlHours: row.cache_ttl_hours };
}

export async function setSettings(
	executor: QueryExecutor,
	recentDays: number,
	cacheTtlHours: number
): Promise<void> {
	await executor.execute(
		`INSERT INTO spawnpoint_settings (id, recent_days, cache_ttl_hours) VALUES (1, ?, ?)
		 ON DUPLICATE KEY UPDATE recent_days = VALUES(recent_days), cache_ttl_hours = VALUES(cache_ttl_hours)`,
		[recentDays, cacheTtlHours]
	);
}
