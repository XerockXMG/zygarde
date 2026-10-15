export interface QueryExecutor {
	execute<T = unknown>(sql: string, params?: unknown[]): Promise<[T, unknown]>;
}

export type RouteType = 'spawnpoint' | 'bootstrap';

export interface RouteRunInfo {
	generatedAt: string;
	stopCount: number;
}

export type RouteRunsByArea = Record<number, Partial<Record<RouteType, RouteRunInfo>>>;

export interface RecordRouteRunParams {
	areaId: number;
	routeType: RouteType;
	stopCount: number;
}

/** Upsert the most recent route-generation run for an area/route-type pair. */
export async function recordRouteRun(
	executor: QueryExecutor,
	{ areaId, routeType, stopCount }: RecordRouteRunParams
): Promise<void> {
	await executor.execute(
		`INSERT INTO area_route_runs (area_id, route_type, generated_at, stop_count)
		 VALUES (?, ?, NOW(), ?)
		 ON DUPLICATE KEY UPDATE generated_at = NOW(), stop_count = ?`,
		[areaId, routeType, stopCount, stopCount]
	);
}

interface RouteRunRow {
	area_id: number;
	route_type: RouteType;
	generated_at: Date | string;
	stop_count: number;
}

export async function getRouteRuns(executor: QueryExecutor): Promise<RouteRunsByArea> {
	const [rows] = await executor.execute<RouteRunRow[]>(
		'SELECT area_id, route_type, generated_at, stop_count FROM area_route_runs'
	);

	const runs: RouteRunsByArea = {};
	for (const row of rows) {
		if (!runs[row.area_id]) runs[row.area_id] = {};
		runs[row.area_id][row.route_type] = {
			generatedAt:
				row.generated_at instanceof Date
					? row.generated_at.toISOString()
					: String(row.generated_at),
			stopCount: row.stop_count
		};
	}
	return runs;
}
