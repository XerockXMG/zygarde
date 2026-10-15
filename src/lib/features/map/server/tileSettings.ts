/**
 * Admin-tunable base map tile settings, stored as a single row (id=1) in
 * the local DB — same dedicated-table shape as spawnpoints/server/settings.ts.
 * Defaults match the tile source this app used before it was configurable
 * (CartoDB's dark basemap), so nothing changes until an admin edits it.
 */
export interface QueryExecutor {
	execute<T = unknown>(sql: string, params?: unknown[]): Promise<[T, unknown]>;
}

export interface TileSettings {
	urlTemplate: string;
	attribution: string;
	maxZoom: number;
	tileSize: number;
	zoomOffset: number;
}

export const DEFAULT_TILE_SETTINGS: TileSettings = {
	urlTemplate: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
	attribution:
		'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
	maxZoom: 20,
	tileSize: 256,
	zoomOffset: 0
};

interface TileSettingsRow {
	tile_url_template: string;
	tile_attribution: string;
	tile_max_zoom: number;
	tile_size: number;
	zoom_offset: number;
}

export async function getTileSettings(executor: QueryExecutor): Promise<TileSettings> {
	const [rows] = await executor.execute<TileSettingsRow[]>(
		'SELECT tile_url_template, tile_attribution, tile_max_zoom, tile_size, zoom_offset FROM map_settings WHERE id = 1'
	);
	const row = rows[0];
	if (!row) return { ...DEFAULT_TILE_SETTINGS };
	return {
		urlTemplate: row.tile_url_template,
		attribution: row.tile_attribution,
		maxZoom: row.tile_max_zoom,
		tileSize: row.tile_size,
		zoomOffset: row.zoom_offset
	};
}

export async function setTileSettings(
	executor: QueryExecutor,
	urlTemplate: string,
	attribution: string,
	maxZoom: number,
	tileSize: number,
	zoomOffset: number
): Promise<void> {
	await executor.execute(
		`INSERT INTO map_settings (id, tile_url_template, tile_attribution, tile_max_zoom, tile_size, zoom_offset) VALUES (1, ?, ?, ?, ?, ?)
		 ON DUPLICATE KEY UPDATE tile_url_template = VALUES(tile_url_template), tile_attribution = VALUES(tile_attribution), tile_max_zoom = VALUES(tile_max_zoom), tile_size = VALUES(tile_size), zoom_offset = VALUES(zoom_offset)`,
		[urlTemplate, attribution, maxZoom, tileSize, zoomOffset]
	);
}
