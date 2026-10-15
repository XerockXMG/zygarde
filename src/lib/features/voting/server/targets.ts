export interface QueryExecutor {
	execute<T = unknown>(sql: string, params?: unknown[]): Promise<[T, unknown]>;
}

export interface TargetConfig {
	mode: 'static' | 'workers';
	staticValue: number;
	workersPerTokenOverride: number | null;
}

interface TargetRow {
	area_id: number;
	mode: 'static' | 'workers';
	static_value: number;
	workers_per_token_override: number | null;
}

export async function getAreaTargetConfigs(
	executor: QueryExecutor
): Promise<Record<number, TargetConfig>> {
	const [rows] = await executor.execute<TargetRow[]>(
		'SELECT area_id, mode, static_value, workers_per_token_override FROM area_vote_targets'
	);
	const configs: Record<number, TargetConfig> = {};
	for (const row of rows) {
		configs[row.area_id] = {
			mode: row.mode,
			staticValue: row.static_value,
			workersPerTokenOverride: row.workers_per_token_override
		};
	}
	return configs;
}

export async function setAreaTarget(
	executor: QueryExecutor,
	areaId: number,
	mode: 'static' | 'workers',
	staticValue: number,
	workersPerTokenOverride: number | null
): Promise<void> {
	await executor.execute(
		`INSERT INTO area_vote_targets (area_id, mode, static_value, workers_per_token_override)
		 VALUES (?, ?, ?, ?)
		 ON DUPLICATE KEY UPDATE mode = VALUES(mode), static_value = VALUES(static_value),
		 	workers_per_token_override = VALUES(workers_per_token_override)`,
		[areaId, mode, staticValue, workersPerTokenOverride]
	);
}

/**
 * Pure — no DB access. `undefined` config means no target has been set for
 * this area. In workers mode, the area's own override takes precedence over
 * the app-wide workers-per-token ratio (how many workers one token funds).
 */
export function resolveTarget(
	config: TargetConfig | undefined,
	pokemonWorkers: number,
	globalWorkersPerToken: number
): number | null {
	if (!config) return null;
	if (config.mode === 'workers') {
		const ratio = config.workersPerTokenOverride ?? globalWorkersPerToken;
		return Math.ceil(pokemonWorkers / ratio);
	}
	return config.staticValue;
}
