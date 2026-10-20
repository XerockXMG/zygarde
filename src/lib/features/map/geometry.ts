/**
 * Spherical geometry utilities for area calculations, map-space snap logic,
 * and GeoJSON↔Leaflet coordinate conversion.
 */
import type { Map as LeafletMap, LatLng } from 'leaflet';
import type { GeoJsonGeometry, GeoJsonPolygon } from '$lib/features/area-management/types';
import type { LatLngTuple } from './types';

/**
 * Calculate the approximate area of a polygon using spherical excess.
 *
 * @param coords - Array of [latitude, longitude] pairs forming the polygon.
 * @returns Area in square kilometres.
 */
export function calcAreaSqKm(coords: [number, number][]): number {
	if (coords.length < 3) return 0;
	const R = 6371;
	const toRad = (d: number) => (d * Math.PI) / 180;
	let area = 0;
	const n = coords.length;
	for (let i = 0; i < n; i++) {
		const [lat1, lon1] = coords[i];
		const [lat2, lon2] = coords[(i + 1) % n];
		area += toRad(lon2 - lon1) * (2 + Math.sin(toRad(lat1)) + Math.sin(toRad(lat2)));
	}
	return Math.abs((area * R * R) / 2);
}

export interface PixelPoint {
	x: number;
	y: number;
}

/**
 * Project a point onto a line segment and return the closest point on the segment.
 * All coordinates are Leaflet pixel-space points.
 *
 * @param p - The point to project.
 * @param a - Start of the segment.
 * @param b - End of the segment.
 * @returns Closest pixel-space point on the segment [a, b].
 */
export function closestOnSegment(p: PixelPoint, a: PixelPoint, b: PixelPoint): PixelPoint {
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const lenSq = dx * dx + dy * dy;
	if (lenSq === 0) return a;
	const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
	return { x: a.x + t * dx, y: a.y + t * dy };
}

/**
 * Find the nearest snap point (vertex or edge) within a pixel threshold.
 *
 * Scans `snapCache` — an array of coordinate rings from neighbouring areas —
 * and returns the closest Leaflet LatLng within `thresholdPx` pixels, or
 * `null` if nothing is close enough.
 *
 * @param latLng      - Current cursor/drag position as a Leaflet LatLng.
 * @param snapCache   - Pre-parsed [lat, lng] coordinate rings of other areas.
 * @param map         - Leaflet map instance (used for lat↔pixel projection).
 * @param L           - Leaflet library reference.
 * @param thresholdPx - Maximum pixel distance to consider a snap (default 16 px).
 * @returns Snapped Leaflet LatLng, or null if no snap target found.
 */
export function findSnap(
	latLng: LatLng,
	snapCache: [number, number][][],
	map: LeafletMap,
	L: typeof import('leaflet'),
	thresholdPx = 16
): LatLng | null {
	const pt = map.project(latLng, map.getZoom());
	let best = thresholdPx;
	let result: LatLng | null = null;

	// First pass: snap to vertices (higher priority)
	for (const coords of snapCache) {
		for (const [lat, lng] of coords) {
			const px = map.project(L.latLng(lat, lng), map.getZoom());
			const d = Math.hypot(pt.x - px.x, pt.y - px.y);
			if (d < best) {
				best = d;
				result = L.latLng(lat, lng);
			}
		}
	}

	// If a vertex was found, return it
	if (result !== null) {
		return result;
	}

	// Second pass: snap to edges only if no vertex was found
	for (const coords of snapCache) {
		for (let i = 0; i < coords.length; i++) {
			const a = map.project(L.latLng(coords[i][0], coords[i][1]), map.getZoom());
			const b = map.project(
				L.latLng(coords[(i + 1) % coords.length][0], coords[(i + 1) % coords.length][1]),
				map.getZoom()
			);
			const c = closestOnSegment(pt, a, b);
			const d = Math.hypot(pt.x - c.x, pt.y - c.y);
			if (d < best) {
				best = d;
				result = map.unproject(L.point(c.x, c.y), map.getZoom());
			}
		}
	}

	return result;
}

function ringToLatLngs(ring: [number, number][]): LatLngTuple[] {
	if (ring.length === 0) return [];
	const closed =
		ring.length > 1 &&
		ring[0][0] === ring[ring.length - 1][0] &&
		ring[0][1] === ring[ring.length - 1][1];
	const points = closed ? ring.slice(0, -1) : ring;
	return points.map(([lon, lat]) => [lat, lon]);
}

/**
 * Convert a GeoJSON Polygon/MultiPolygon into Leaflet-ready ring arrays,
 * flipping GeoJSON's [lon, lat] axis order to Leaflet's [lat, lng] and
 * dropping the duplicated closing point each GeoJSON ring repeats.
 *
 * Only the outer ring of each polygon part is used — inner rings (holes)
 * aren't supported by the visual editor and are dropped. A Polygon yields
 * one ring; a MultiPolygon yields one ring per member polygon.
 */
export function geoJsonToLatLngs(geometry: GeoJsonGeometry | null): LatLngTuple[][] {
	if (!geometry) return [];
	const parts = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
	return parts.map((rings) => ringToLatLngs(rings[0] ?? []));
}

/**
 * Convert a working `[lat, lng]` vertex array back into a GeoJSON Polygon,
 * flipping the axis order back to `[lon, lat]` and re-closing the ring
 * (GeoJSON repeats the first point as the last; the editor's array doesn't).
 */
export function latLngsToGeoJson(vertices: LatLngTuple[]): GeoJsonPolygon {
	const ring: [number, number][] = vertices.map(([lat, lon]) => [lon, lat]);
	if (ring.length > 0) ring.push(ring[0]);
	return { type: 'Polygon', coordinates: [ring] };
}

/**
 * Validate that `value` is a GeoJSON Polygon with exactly one ring (no
 * holes) and at least 3 distinct, finite coordinate pairs in that ring
 * (ignoring the repeated closing point). Rejects the whole ring — rather
 * than silently dropping — the first malformed/non-finite entry it finds,
 * so nothing invalid can survive into a saved geofence.
 * Used to validate a raw-pasted or client-serialized geofence before saving.
 */
export function isValidPolygonGeoJson(value: unknown): value is GeoJsonPolygon {
	if (!value || typeof value !== 'object') return false;
	const v = value as Record<string, unknown>;
	if (v.type !== 'Polygon') return false;
	if (!Array.isArray(v.coordinates) || v.coordinates.length !== 1) return false;
	const ring = v.coordinates[0];
	if (!Array.isArray(ring) || ring.length === 0) return false;
	const points: [number, number][] = [];
	for (const p of ring) {
		if (!Array.isArray(p) || p.length !== 2 || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) {
			return false;
		}
		points.push([p[0], p[1]]);
	}
	const distinct = new Set(points.map(([lon, lat]) => `${lon},${lat}`));
	return distinct.size >= 3;
}

/**
 * True if `geofence` is a single-ring Polygon with enough distinct vertices
 * to be visually editable. MultiPolygons, Polygons with holes, and
 * degenerate rings (fewer than 3 usable points) are not visually editable —
 * callers should still allow replacing them via raw-pasted GeoJSON, just not
 * via the drag-vertex editor.
 */
export function canVisuallyEditPolygon(geofence: GeoJsonGeometry | null): boolean {
	if (!geofence || geofence.type !== 'Polygon' || geofence.coordinates.length !== 1) return false;
	const rings = geoJsonToLatLngs(geofence);
	return (rings[0]?.length ?? 0) >= 3;
}

/**
 * Append a vertex while freehand-drawing a brand-new geofence. Always
 * appends — the caller (editState) is responsible for detecting a click
 * near the starting vertex and closing the shape instead of calling this.
 */
export function appendDrawVertex(vertices: LatLngTuple[], lat: number, lng: number): LatLngTuple[] {
	return [...vertices, [lat, lng]];
}

/**
 * Remove the vertex at `index` from a working polygon ring. Returns a new
 * array, or null when removal would leave fewer than 3 vertices (the
 * editor's minimum for a valid polygon) — callers treat null as "refuse".
 */
export function removeVertex(vertices: LatLngTuple[], index: number): LatLngTuple[] | null {
	if (vertices.length <= 3) return null;
	return vertices.filter((_, i) => i !== index);
}
