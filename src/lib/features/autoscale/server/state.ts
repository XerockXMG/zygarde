import type { AutoscaleConfig } from '../types';

export interface QueryExecutor {
	execute<T = unknown>(sql: string, params?: unknown[]): Promise<[T, unknown]>;
}

interface AutoscaleRow {
	area_id: number;
	enabled: number | boolean;
	max_pokemon_workers: number;
}

export async function getAutoscaleConfigs(
	executor: QueryExecutor
): Promise<Record<number, AutoscaleConfig>> {
	const [rows] = await executor.execute<AutoscaleRow[]>(
		'SELECT area_id, enabled, max_pokemon_workers FROM area_worker_autoscale'
	);
	const configs: Record<number, AutoscaleConfig> = {};
	for (const row of rows) {
		configs[row.area_id] = {
			areaId: row.area_id,
			enabled: !!row.enabled,
			maxPokemonWorkers: row.max_pokemon_workers
		};
	}
	return configs;
}

/**
 * Backfill a default row (disabled, max = current live worker count) for
 * every area that doesn't have one yet. Never touches a row that already
 * exists — an area's stored max only ever changes via `enableAutoscale`
 * (explicit re-baseline on enable/re-enable), never passively here. This is
 * what lets a `workers`-mode vote target resolve a stable number even for
 * areas that have never touched the autoscale feature.
 */
export async function ensureAutoscaleRows(
	executor: QueryExecutor,
	areas: { id: number; pokemonWorkers: number }[]
): Promise<void> {
	const [rows] = await executor.execute<{ area_id: number }[]>(
		'SELECT area_id FROM area_worker_autoscale'
	);
	const existing = new Set(rows.map((r) => r.area_id));
	const missing = areas.filter((a) => !existing.has(a.id));

	for (const area of missing) {
		await executor.execute(
			'INSERT INTO area_worker_autoscale (area_id, enabled, max_pokemon_workers) VALUES (?, FALSE, ?)',
			[area.id, area.pokemonWorkers]
		);
	}
}

/**
 * Enable autoscale for an area, (re-)snapshotting its current live Pokemon
 * worker count as the new max. Used both for a fresh enable and a re-enable
 * after a manual worker-count edit made while disabled — either way, "the
 * count right now" becomes the new 100%-speed ceiling.
 */
export async function enableAutoscale(
	executor: QueryExecutor,
	areaId: number,
	currentPokemonWorkers: number
): Promise<void> {
	await executor.execute(
		`INSERT INTO area_worker_autoscale (area_id, enabled, max_pokemon_workers) VALUES (?, TRUE, ?)
		 ON DUPLICATE KEY UPDATE enabled = TRUE, max_pokemon_workers = VALUES(max_pokemon_workers)`,
		[areaId, currentPokemonWorkers]
	);
}

/** Disable autoscale for an area. The stored max is left untouched. */
export async function disableAutoscale(executor: QueryExecutor, areaId: number): Promise<void> {
	await executor.execute('UPDATE area_worker_autoscale SET enabled = FALSE WHERE area_id = ?', [
		areaId
	]);
}
