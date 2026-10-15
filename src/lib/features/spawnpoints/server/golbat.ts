/**
 * Golbat database access — spawnpoint counts with spatial queries and an
 * in-memory + DB-backed TTL cache.
 *
 * The Golbat connection is a second, independent mysql2 pool (separate
 * from LOCAL_DATABASE_URL), lazily created from GOLBAT_DATABASE_URL —
 * absent means every function here returns a safe null/empty value, same
 * optional-integration pattern as DRAGONITE_URL/KOJI_URL.
 *
 * The DB-backed L2 cache (spawnpoint_cache) uses a caller-supplied
 * local-DB executor rather than reaching for LOCAL_DATABASE_URL itself —
 * matches this app's pattern of callers owning their own pool access
 * (see votes.ts, geofenceArchive.ts, settings.ts).
 */
import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
import { env } from '$env/dynamic/private';
import { logger } from '$lib/server/logger';
import { errorMessage } from '$lib/utils/errors';
import type { LatLngTuple } from '$lib/features/map/types';
import type { SpawnpointMode, SpawnpointEntry } from '../types';

export interface QueryExecutor {
	execute<T = unknown>(sql: string, params?: unknown[]): Promise<[T, unknown]>;
}

interface CountRow extends RowDataPacket {
	cnt: number;
}

interface CacheRow {
	count: number;
	fetched_at: number;
}

// ── In-memory L1 cache ──────────────────────────────────────────────────────
// Key format: `${areaId}:${mode}`
const memCache = new Map<string, SpawnpointEntry>();

// ── Golbat connection pool ──────────────────────────────────────────────────
let pool: mysql.Pool | null = null;
let poolInitAttempted = false;

function getGolbatPool(): mysql.Pool | null {
	const url = env.GOLBAT_DATABASE_URL;
	if (!url) return null;

	if (!pool && !poolInitAttempted) {
		poolInitAttempted = true;
		try {
			pool = mysql.createPool({
				uri: url,
				connectionLimit: 3,
				connectTimeout: 5000,
				waitForConnections: true,
				enableKeepAlive: true
			});
		} catch (e) {
			logger.error({ err: errorMessage(e) }, 'Failed to create Golbat pool');
		}
	}
	return pool;
}

// ── Geometry helpers (pure) ─────────────────────────────────────────────────

/**
 * Build a spatial WKT literal from one or more polygon rings — `POLYGON`
 * for a single ring, `MULTIPOLYGON` for several (matching how
 * `geoJsonToLatLngs` already normalizes a GeoJSON Polygon/MultiPolygon
 * into one ring per polygon part). WKT uses X=longitude, Y=latitude.
 */
export function buildWkt(rings: LatLngTuple[][]): string {
	const ringWkt = (ring: LatLngTuple[]): string => {
		const closed = [...ring, ring[0]];
		return closed.map(([lat, lon]) => `${lon} ${lat}`).join(', ');
	};
	if (rings.length === 1) return `POLYGON((${ringWkt(rings[0])}))`;
	return `MULTIPOLYGON(${rings.map((r) => `((${ringWkt(r)}))`).join(', ')})`;
}

/** Bounding box across every ring, used as a cheap pre-filter before ST_Contains. */
export function getBBox(rings: LatLngTuple[][]): {
	minLat: number;
	maxLat: number;
	minLon: number;
	maxLon: number;
} {
	const points = rings.flat();
	const lats = points.map(([lat]) => lat);
	const lons = points.map(([, lon]) => lon);
	return {
		minLat: Math.min(...lats),
		maxLat: Math.max(...lats),
		minLon: Math.min(...lons),
		maxLon: Math.max(...lons)
	};
}

// ── Public API ───────────────────────────────────────────────────────────

/** Test the Golbat connection and return status. */
export async function testConnection(): Promise<{ connected: boolean; reason?: string }> {
	const url = env.GOLBAT_DATABASE_URL;
	if (!url) return { connected: false, reason: 'GOLBAT_DATABASE_URL is not set' };

	const p = getGolbatPool();
	if (!p) return { connected: false, reason: 'Failed to create connection pool' };

	try {
		await p.execute('SELECT 1');
		return { connected: true };
	} catch (e) {
		return { connected: false, reason: errorMessage(e) };
	}
}

/** Current state of the cache — in-memory L1 keys, unioned with the persistent L2 table when an executor is given (so stats are accurate even right after a process restart, when L1 is empty but L2 rows may still be live). */
export async function getCacheStats(
	executor?: QueryExecutor | null
): Promise<{ totalEntries: number; byMode: Record<string, number> }> {
	const keys = new Set(memCache.keys());

	if (executor) {
		try {
			const [rows] = await executor.execute<{ area_id: number; mode: string }[]>(
				'SELECT area_id, mode FROM spawnpoint_cache'
			);
			for (const row of rows) keys.add(`${row.area_id}:${row.mode}`);
		} catch (e) {
			logger.warn({ err: errorMessage(e) }, 'Failed to read spawnpoint_cache stats');
		}
	}

	const byMode: Record<string, number> = {};
	for (const key of keys) {
		const mode = key.split(':')[1] ?? 'unknown';
		byMode[mode] = (byMode[mode] ?? 0) + 1;
	}
	return { totalEntries: keys.size, byMode };
}

/**
 * Invalidate cached counts — in-memory L1 always, and the persistent
 * `spawnpoint_cache` table (L2) when a local-DB executor is given.
 * @param areaId - When provided, clears only entries for that area.
 */
export async function invalidateCache(
	executor: QueryExecutor | null,
	areaId?: number
): Promise<void> {
	if (areaId === undefined) {
		memCache.clear();
	} else {
		for (const key of [...memCache.keys()]) {
			if (key.startsWith(`${areaId}:`)) memCache.delete(key);
		}
	}

	let dbCleared = true;
	if (executor) {
		try {
			if (areaId === undefined) {
				await executor.execute('DELETE FROM spawnpoint_cache');
			} else {
				await executor.execute('DELETE FROM spawnpoint_cache WHERE area_id = ?', [areaId]);
			}
		} catch (e) {
			dbCleared = false;
			logger.warn({ err: errorMessage(e) }, 'Failed to clear spawnpoint DB cache');
		}
	}
	if (dbCleared) logger.info({ areaId }, 'Golbat spawnpoint cache cleared');
}

async function getFromDbCache(
	executor: QueryExecutor,
	areaId: number,
	mode: SpawnpointMode,
	ttlHours: number
): Promise<SpawnpointEntry | null> {
	try {
		const [rows] = await executor.execute<CacheRow[]>(
			'SELECT count, fetched_at FROM spawnpoint_cache WHERE area_id = ? AND mode = ?',
			[areaId, mode]
		);
		const row = rows[0];
		if (!row) return null;
		if (Date.now() - row.fetched_at >= ttlHours * 3_600_000) return null;
		return { count: row.count, fetchedAt: row.fetched_at };
	} catch {
		return null;
	}
}

async function setToDbCache(
	executor: QueryExecutor,
	areaId: number,
	mode: SpawnpointMode,
	count: number,
	fetchedAt: number
): Promise<void> {
	try {
		await executor.execute(
			`INSERT INTO spawnpoint_cache (area_id, mode, count, fetched_at) VALUES (?, ?, ?, ?)
			 ON DUPLICATE KEY UPDATE count = VALUES(count), fetched_at = VALUES(fetched_at)`,
			[areaId, mode, count, fetchedAt]
		);
	} catch (e) {
		logger.warn({ err: errorMessage(e) }, 'Failed to persist spawnpoint cache to DB');
	}
}

/**
 * Return the spawnpoint count for a geofenced area (given as one ring per
 * polygon part — see `buildWkt`), using the cache when fresh.
 *
 * @param localExecutor - The app's LOCAL_DATABASE_URL pool, for the L2
 *   cache. Pass null to skip L2 entirely (L1 still applies).
 * @returns `null` when Golbat is not configured or the query fails.
 */
export async function getSpawnpointCount(
	localExecutor: QueryExecutor | null,
	areaId: number,
	rings: LatLngTuple[][],
	mode: SpawnpointMode,
	recentDays: number,
	ttlHours: number,
	forceRefresh = false
): Promise<SpawnpointEntry | null> {
	const p = getGolbatPool();
	if (!p) return null;

	const key = `${areaId}:${mode}`;

	if (!forceRefresh) {
		const cached = memCache.get(key);
		if (cached && Date.now() - cached.fetchedAt < ttlHours * 3_600_000) return cached;

		if (localExecutor) {
			const dbCached = await getFromDbCache(localExecutor, areaId, mode, ttlHours);
			if (dbCached) {
				memCache.set(key, dbCached);
				return dbCached;
			}
		}
	}

	try {
		const wkt = buildWkt(rings);
		const bbox = getBBox(rings);
		const params: (string | number)[] = [bbox.minLat, bbox.maxLat, bbox.minLon, bbox.maxLon, wkt];

		// For 'recent' mode, put last_seen first — it has an index and is often
		// the most selective filter, letting the DB skip the bbox+spatial checks
		// on the majority of rows before they're even considered.
		let sql = 'SELECT COUNT(*) AS cnt FROM spawnpoint WHERE ';
		if (mode === 'recent') {
			const cutoff = Math.floor(Date.now() / 1000) - recentDays * 86400;
			sql +=
				'last_seen >= ? AND lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?' +
				' AND ST_Contains(ST_GeomFromText(?), POINT(lon, lat))';
			params.unshift(cutoff);
		} else {
			sql +=
				'lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?' +
				' AND ST_Contains(ST_GeomFromText(?), POINT(lon, lat))';
			if (mode === 'confirmed') sql += ' AND despawn_sec IS NOT NULL';
		}

		const [rows] = await p.execute<CountRow[]>(sql, params);
		const entry = { count: rows[0].cnt, fetchedAt: Date.now() };
		memCache.set(key, entry);
		if (localExecutor) setToDbCache(localExecutor, areaId, mode, entry.count, entry.fetchedAt); // fire-and-forget
		logger.debug({ areaId, mode, count: entry.count }, 'Golbat spawnpoint count fetched');
		return entry;
	} catch (e) {
		logger.error({ areaId, mode, err: errorMessage(e) }, 'Golbat spawnpoint count query failed');
		return null;
	}
}
