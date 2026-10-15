import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	buildKojiRequest,
	extractRouteCoords,
	formatRouteText,
	parseRouteText,
	saveGeofence
} from './koji';
import type { GeoJsonPolygon } from '../types';

const GEOFENCE: GeoJsonPolygon = {
	type: 'Polygon',
	coordinates: [
		[
			[-40.5, 40.1],
			[-40.4, 40.1],
			[-40.4, 40.2],
			[-40.5, 40.2],
			[-40.5, 40.1]
		]
	]
};

describe('buildKojiRequest', () => {
	it('builds a bootstrap request with defaults applied for falsy radius/minPoints', () => {
		const { endpointPath, body } = buildKojiRequest(GEOFENCE, {
			routeType: 'bootstrap',
			radius: 0,
			minPoints: 0,
			maxClusters: 0,
			clusterMode: 'Balanced',
			calculationMode: 'Radius',
			tth: 'All'
		});

		expect(endpointPath).toBe('/api/v1/calc/bootstrap');
		expect(body).toEqual({
			area: {
				type: 'FeatureCollection',
				features: [{ type: 'Feature', geometry: GEOFENCE, properties: { name: 'area' } }]
			},
			radius: 70,
			min_points: 1,
			return_type: 'feature_collection'
		});
	});

	it('includes max_clusters in a bootstrap request only when positive', () => {
		const { body } = buildKojiRequest(GEOFENCE, {
			routeType: 'bootstrap',
			radius: 100,
			minPoints: 5,
			maxClusters: 20,
			clusterMode: 'Balanced',
			calculationMode: 'Radius',
			tth: 'All'
		});
		expect(body.max_clusters).toBe(20);
	});

	it('builds a spawnpoint request with cluster/calc/tth params and sort_by fixed to tsp-mt', () => {
		const { endpointPath, body } = buildKojiRequest(GEOFENCE, {
			routeType: 'spawnpoint',
			radius: 50,
			minPoints: 3,
			maxClusters: 0,
			clusterMode: 'Best',
			calculationMode: 'S2',
			tth: 'Known'
		});

		expect(endpointPath).toBe('/api/v1/calc/route/spawnpoint');
		expect(body).toEqual({
			area: {
				type: 'FeatureCollection',
				features: [{ type: 'Feature', geometry: GEOFENCE, properties: { name: 'area' } }]
			},
			min_points: 3,
			radius: 50,
			cluster_mode: 'Best',
			calculation_mode: 'S2',
			tth: 'Known',
			sort_by: 'tsp-mt',
			cluster_split_level: 0,
			return_type: 'feature_collection'
		});
	});

	it('applies the spawnpoint min_points floor of 2 when falsy', () => {
		const { body } = buildKojiRequest(GEOFENCE, {
			routeType: 'spawnpoint',
			radius: 50,
			minPoints: 0,
			maxClusters: 0,
			clusterMode: 'Balanced',
			calculationMode: 'Radius',
			tth: 'All'
		});
		expect(body.min_points).toBe(2);
	});
});

describe('extractRouteCoords', () => {
	it('extracts and flips [lon, lat] Point features to [lat, lon]', () => {
		const coords = extractRouteCoords([
			{ geometry: { type: 'Point', coordinates: [-40.4, 40.1] } },
			{ geometry: { type: 'Point', coordinates: [-40.3, 40.2] } }
		]);
		expect(coords).toEqual([
			[40.1, -40.4],
			[40.2, -40.3]
		]);
	});

	it('extracts LineString and MultiPoint features', () => {
		const coords = extractRouteCoords([
			{
				geometry: {
					type: 'LineString',
					coordinates: [
						[-40.4, 40.1],
						[-40.3, 40.2]
					]
				}
			},
			{
				geometry: {
					type: 'MultiPoint',
					coordinates: [[-40.2, 40.3]]
				}
			}
		]);
		expect(coords).toEqual([
			[40.1, -40.4],
			[40.2, -40.3],
			[40.3, -40.2]
		]);
	});

	it('extracts MultiLineString features by flattening every line', () => {
		const coords = extractRouteCoords([
			{
				geometry: {
					type: 'MultiLineString',
					coordinates: [
						[
							[-40.4, 40.1],
							[-40.3, 40.2]
						],
						[[-40.2, 40.3]]
					]
				}
			}
		]);
		expect(coords).toEqual([
			[40.1, -40.4],
			[40.2, -40.3],
			[40.3, -40.2]
		]);
	});

	it('returns an empty array for non-array input or features with no geometry', () => {
		expect(extractRouteCoords(undefined)).toEqual([]);
		expect(extractRouteCoords(null)).toEqual([]);
		expect(extractRouteCoords([{ geometry: null }, {}])).toEqual([]);
	});
});

describe('formatRouteText / parseRouteText round trip', () => {
	it('formats coordinates as "lat lon,lat lon" and parses them back', () => {
		const coords: [number, number][] = [
			[40.123456, -40.654321],
			[40.2, -40.5]
		];
		const text = formatRouteText(coords);
		expect(text).toBe('40.123456 -40.654321,40.200000 -40.500000');

		const parsed = parseRouteText(text);
		expect(parsed).toEqual([
			{ lat: 40.123456, lon: -40.654321 },
			{ lat: 40.2, lon: -40.5 }
		]);
	});

	it('skips empty segments and non-finite pairs when parsing', () => {
		expect(parseRouteText('40.1 -40.4,,40.2 -40.3')).toEqual([
			{ lat: 40.1, lon: -40.4 },
			{ lat: 40.2, lon: -40.3 }
		]);
		expect(parseRouteText('')).toEqual([]);
	});
});

describe('saveGeofence', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('POSTs a single-feature FeatureCollection with __name and no __parent when parent is omitted', async () => {
		const fetchMock = vi.fn().mockResolvedValue({ ok: true });
		vi.stubGlobal('fetch', fetchMock);

		await saveGeofence({ baseUrl: 'http://koji:8080' }, { name: 'New Area', geometry: GEOFENCE });

		expect(fetchMock).toHaveBeenCalledWith(
			'http://koji:8080/api/v1/geofence/save-koji',
			expect.objectContaining({ method: 'POST' })
		);
		const [, init] = fetchMock.mock.calls[0];
		expect(init.headers).not.toHaveProperty('Authorization');
		const body = JSON.parse(init.body);
		expect(body).toEqual({
			area: {
				type: 'FeatureCollection',
				features: [{ type: 'Feature', geometry: GEOFENCE, properties: { __name: 'New Area' } }]
			}
		});
	});

	it('includes __parent when a parent project is given, and a Bearer header when a secret is configured', async () => {
		const fetchMock = vi.fn().mockResolvedValue({ ok: true });
		vi.stubGlobal('fetch', fetchMock);

		await saveGeofence(
			{ baseUrl: 'http://koji:8080', secret: 'shh' },
			{ name: 'New Area', geometry: GEOFENCE, parent: 'Metro' }
		);

		const [, init] = fetchMock.mock.calls[0];
		expect(init.headers.Authorization).toBe('Bearer shh');
		const body = JSON.parse(init.body);
		expect(body.area.features[0].properties).toEqual({ __name: 'New Area', __parent: 'Metro' });
	});

	it('throws when Kōji returns a non-2xx status', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));

		await expect(
			saveGeofence({ baseUrl: 'http://koji:8080' }, { name: 'New Area', geometry: GEOFENCE })
		).rejects.toThrow('Kōji geofence save failed: 500');
	});
});
