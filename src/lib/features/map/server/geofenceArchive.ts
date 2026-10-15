import type { GeoJsonGeometry } from '$lib/features/area-management/types';

export interface QueryExecutor {
	execute<T = unknown>(sql: string, params?: unknown[]): Promise<[T, unknown]>;
}

export interface ArchiveGeofenceParams {
	areaId: number;
	areaName: string;
	geofence: GeoJsonGeometry | null;
	archivedByDiscordId: string;
	archivedByUsername: string;
}

/** Archive an area's current geofence before it's overwritten. Best-effort — callers should treat a failure as non-blocking. */
export async function archiveGeofence(
	executor: QueryExecutor,
	params: ArchiveGeofenceParams
): Promise<void> {
	await executor.execute(
		'INSERT INTO geofence_archive (area_id, area_name, geofence, archived_by_discord_id, archived_by_username) VALUES (?, ?, ?, ?, ?)',
		[
			params.areaId,
			params.areaName,
			JSON.stringify(params.geofence),
			params.archivedByDiscordId,
			params.archivedByUsername
		]
	);
}

export interface ArchiveEntry {
	id: number;
	archivedAt: string;
	archivedBy: string;
	vertexCount: number;
}

const MAX_ENTRIES_PER_AREA = 20;

function countVertices(geofenceJson: string): number {
	let geometry: unknown;
	try {
		geometry = JSON.parse(geofenceJson);
	} catch {
		return 0;
	}
	if (!geometry || typeof geometry !== 'object') return 0;

	const g = geometry as { type?: string; coordinates?: unknown };
	if (g.type === 'Polygon') {
		const ring = (g.coordinates as unknown[][])?.[0];
		return Array.isArray(ring) ? Math.max(0, ring.length - 1) : 0;
	}
	if (g.type === 'MultiPolygon') {
		const polygons = (g.coordinates as unknown[][][]) ?? [];
		return polygons.reduce((sum, poly) => {
			const ring = poly?.[0];
			return sum + (Array.isArray(ring) ? Math.max(0, ring.length - 1) : 0);
		}, 0);
	}
	return 0;
}

interface ArchiveRow {
	id: number;
	area_id: number;
	geofence: string;
	archived_at: Date | string;
	archived_by_username: string;
}

/** All archived geofence versions, grouped by area id and capped at the most recent 20 per area. */
export async function listGeofenceArchive(
	executor: QueryExecutor
): Promise<Record<number, ArchiveEntry[]>> {
	const [rows] = await executor.execute<ArchiveRow[]>(
		'SELECT id, area_id, geofence, archived_at, archived_by_username FROM geofence_archive ORDER BY archived_at DESC'
	);

	const byArea: Record<number, ArchiveEntry[]> = {};
	for (const row of rows) {
		const entries = (byArea[row.area_id] ??= []);
		if (entries.length >= MAX_ENTRIES_PER_AREA) continue;
		entries.push({
			id: row.id,
			archivedAt:
				row.archived_at instanceof Date ? row.archived_at.toISOString() : String(row.archived_at),
			archivedBy: row.archived_by_username,
			vertexCount: countVertices(row.geofence)
		});
	}
	return byArea;
}

export interface ArchivedGeofence {
	areaId: number;
	areaName: string;
	geofence: GeoJsonGeometry | null;
}

interface ArchivedGeofenceRow {
	area_id: number;
	area_name: string;
	geofence: string;
}

/** Fetch a single archive row by id, for restoring. Returns null if it doesn't exist. */
export async function getArchiveEntry(
	executor: QueryExecutor,
	archiveId: number
): Promise<ArchivedGeofence | null> {
	const [rows] = await executor.execute<ArchivedGeofenceRow[]>(
		'SELECT area_id, area_name, geofence FROM geofence_archive WHERE id = ?',
		[archiveId]
	);
	const row = rows[0];
	if (!row) return null;
	return {
		areaId: row.area_id,
		areaName: row.area_name,
		geofence: JSON.parse(row.geofence)
	};
}

export async function deleteGeofenceArchive(
	executor: QueryExecutor,
	archiveId: number
): Promise<void> {
	await executor.execute('DELETE FROM geofence_archive WHERE id = ?', [archiveId]);
}
