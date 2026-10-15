import type { GeoJsonGeometry } from '../types';

export interface KojiGenerationParams {
	routeType: 'spawnpoint' | 'bootstrap';
	radius: number;
	minPoints: number;
	maxClusters: number;
	clusterMode: string;
	calculationMode: string;
	tth: string;
}

export interface KojiRequest {
	endpointPath: string;
	body: Record<string, unknown>;
}

function buildKojiArea(geometry: GeoJsonGeometry): Record<string, unknown> {
	return {
		type: 'FeatureCollection',
		features: [{ type: 'Feature', geometry, properties: { name: 'area' } }]
	};
}

/** Build the Kōji request path + body for the given geofence and generation params. */
export function buildKojiRequest(
	geometry: GeoJsonGeometry,
	params: KojiGenerationParams
): KojiRequest {
	const area = buildKojiArea(geometry);
	const maxClusters = Math.max(0, params.maxClusters);

	if (params.routeType === 'bootstrap') {
		return {
			endpointPath: '/api/v1/calc/bootstrap',
			body: {
				area,
				radius: Math.max(1, params.radius || 70),
				min_points: Math.max(1, params.minPoints || 1),
				...(maxClusters > 0 && { max_clusters: maxClusters }),
				return_type: 'feature_collection'
			}
		};
	}

	return {
		endpointPath: '/api/v1/calc/route/spawnpoint',
		body: {
			area,
			min_points: Math.max(2, params.minPoints || 2),
			radius: Math.max(1, params.radius || 70),
			cluster_mode: params.clusterMode || 'Balanced',
			calculation_mode: params.calculationMode || 'Radius',
			tth: params.tth || 'All',
			sort_by: 'tsp-mt',
			cluster_split_level: 0,
			...(maxClusters > 0 && { max_clusters: maxClusters }),
			return_type: 'feature_collection'
		}
	};
}

/**
 * Extract [lat, lon] coordinates from a Kōji response's GeoJSON features,
 * flipping Kōji's [lon, lat] axis order. Handles Point, LineString,
 * MultiPoint, and MultiLineString geometries (the shapes Kōji's route/
 * bootstrap endpoints return); anything else is ignored.
 */
export function extractRouteCoords(features: unknown): [number, number][] {
	const coords: [number, number][] = [];
	if (!Array.isArray(features)) return coords;
	for (const f of features) {
		const geom = (f as { geometry?: unknown } | null)?.geometry as
			{ type?: string; coordinates?: unknown } | undefined;
		if (!geom || typeof geom.type !== 'string') continue;
		if (geom.type === 'Point') {
			const [lon, lat] = geom.coordinates as [number, number];
			coords.push([lat, lon]);
		} else if (geom.type === 'LineString' || geom.type === 'MultiPoint') {
			for (const [lon, lat] of geom.coordinates as [number, number][]) coords.push([lat, lon]);
		} else if (geom.type === 'MultiLineString') {
			for (const line of geom.coordinates as [number, number][][]) {
				for (const [lon, lat] of line) coords.push([lat, lon]);
			}
		}
	}
	return coords;
}

/** Format [lat, lon] coordinates as the "lat lon,lat lon,..." text cached to disk. */
export function formatRouteText(coords: [number, number][]): string {
	return coords.map(([lat, lon]) => `${lat.toFixed(6)} ${lon.toFixed(6)}`).join(',');
}

/** Parse the cached "lat lon,lat lon,..." route text back into points for the Dragonite PATCH body. */
export function parseRouteText(text: string): { lat: number; lon: number }[] {
	return text
		.split(',')
		.map((pair) => pair.trim())
		.filter(Boolean)
		.map((pair) => {
			const [lat, lon] = pair.split(/\s+/).map(Number);
			return { lat, lon };
		})
		.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
}

export interface KojiConfig {
	baseUrl: string;
	secret?: string;
}

export interface SaveGeofenceParams {
	name: string;
	geometry: GeoJsonGeometry;
	/** Kōji "parent" project name to group this geofence under. Omit to leave it ungrouped. */
	parent?: string | null;
}

/**
 * Create or update (upserted by name) a geofence in Kōji's own geofence
 * database via its `save-koji` endpoint. Unlike `buildKojiRequest` above,
 * this is a quick single write rather than a long-running computation, so
 * it uses plain `fetch` instead of the raw-socket/keepalive handling
 * `routes/api/koji/+server.ts` needs for route generation.
 */
export async function saveGeofence(config: KojiConfig, params: SaveGeofenceParams): Promise<void> {
	const properties: Record<string, unknown> = { __name: params.name };
	if (params.parent) properties.__parent = params.parent;

	const headers: Record<string, string> = { 'Content-Type': 'application/json' };
	if (config.secret) headers['Authorization'] = `Bearer ${config.secret}`;

	const res = await fetch(`${config.baseUrl}/api/v1/geofence/save-koji`, {
		method: 'POST',
		headers,
		body: JSON.stringify({
			area: {
				type: 'FeatureCollection',
				features: [{ type: 'Feature', geometry: params.geometry, properties }]
			}
		})
	});
	if (!res.ok) throw new Error(`Kōji geofence save failed: ${res.status}`);
}
