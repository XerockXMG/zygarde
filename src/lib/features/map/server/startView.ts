/**
 * Where the map opens before it zooms to the areas: the START_LAT,
 * START_LON and START_ZOOM env vars. Only visible for a moment on load (the
 * map then fits every area), or for good when there are no areas to fit.
 * Each var falls back on its own when unset or out of range.
 */
export interface MapStartView {
	lat: number;
	lon: number;
	zoom: number;
}

export const DEFAULT_START_VIEW: MapStartView = { lat: 20, lon: 0, zoom: 2 };

function parseInRange(value: string | undefined, min: number, max: number): number | null {
	if (!value?.trim()) return null;
	const n = Number(value.trim());
	return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

export function parseStartView(
	lat: string | undefined,
	lon: string | undefined,
	zoom: string | undefined
): MapStartView {
	return {
		lat: parseInRange(lat, -90, 90) ?? DEFAULT_START_VIEW.lat,
		lon: parseInRange(lon, -180, 180) ?? DEFAULT_START_VIEW.lon,
		zoom: parseInRange(zoom, 0, 22) ?? DEFAULT_START_VIEW.zoom
	};
}
