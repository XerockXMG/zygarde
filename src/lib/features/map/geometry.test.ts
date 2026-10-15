import { describe, expect, it } from 'vitest';
import type * as Leaflet from 'leaflet';
import type { GeoJsonPolygon, GeoJsonMultiPolygon } from '$lib/features/area-management/types';
import {
	appendDrawVertex,
	calcAreaSqKm,
	canVisuallyEditPolygon,
	closestOnSegment,
	findSnap,
	geoJsonToLatLngs,
	isValidPolygonGeoJson,
	latLngsToGeoJson
} from './geometry';

describe('calcAreaSqKm', () => {
	it('returns 0 for fewer than 3 points', () => {
		expect(calcAreaSqKm([])).toBe(0);
		expect(calcAreaSqKm([[0, 0]])).toBe(0);
		expect(
			calcAreaSqKm([
				[0, 0],
				[0, 1]
			])
		).toBe(0);
	});

	it('computes a plausible area for a small square-ish polygon', () => {
		// Roughly a 1km x 1km square near the equator (~0.009 degrees per km)
		const coords: [number, number][] = [
			[0, 0],
			[0.009, 0],
			[0.009, 0.009],
			[0, 0.009]
		];
		const area = calcAreaSqKm(coords);
		expect(area).toBeGreaterThan(0.9);
		expect(area).toBeLessThan(1.1);
	});
});

describe('closestOnSegment', () => {
	it('returns the perpendicular projection when it falls within the segment', () => {
		const result = closestOnSegment({ x: 5, y: 5 }, { x: 0, y: 0 }, { x: 10, y: 0 });
		expect(result).toEqual({ x: 5, y: 0 });
	});

	it('clamps to the start point when the projection falls before the segment', () => {
		const result = closestOnSegment({ x: -5, y: 5 }, { x: 0, y: 0 }, { x: 10, y: 0 });
		expect(result).toEqual({ x: 0, y: 0 });
	});

	it('clamps to the end point when the projection falls after the segment', () => {
		const result = closestOnSegment({ x: 15, y: 5 }, { x: 0, y: 0 }, { x: 10, y: 0 });
		expect(result).toEqual({ x: 10, y: 0 });
	});

	it('returns the shared point when the segment has zero length', () => {
		const result = closestOnSegment({ x: 5, y: 5 }, { x: 2, y: 2 }, { x: 2, y: 2 });
		expect(result).toEqual({ x: 2, y: 2 });
	});
});

describe('geoJsonToLatLngs', () => {
	it('returns an empty array for null geometry', () => {
		expect(geoJsonToLatLngs(null)).toEqual([]);
	});

	it('flips [lon, lat] to [lat, lon] and drops the closing point for a Polygon', () => {
		const polygon: GeoJsonPolygon = {
			type: 'Polygon',
			coordinates: [
				[
					[-40.5, 40.1],
					[-40.4, 40.1],
					[-40.4, 40.2],
					[-40.5, 40.1]
				]
			]
		};
		expect(geoJsonToLatLngs(polygon)).toEqual([
			[
				[40.1, -40.5],
				[40.1, -40.4],
				[40.2, -40.4]
			]
		]);
	});

	it('returns one ring per polygon part for a MultiPolygon', () => {
		const multi: GeoJsonMultiPolygon = {
			type: 'MultiPolygon',
			coordinates: [
				[
					[
						[0, 0],
						[1, 0],
						[1, 1],
						[0, 0]
					]
				],
				[
					[
						[5, 5],
						[6, 5],
						[6, 6],
						[5, 5]
					]
				]
			]
		};
		const result = geoJsonToLatLngs(multi);
		expect(result).toHaveLength(2);
		expect(result[0]).toEqual([
			[0, 0],
			[0, 1],
			[1, 1]
		]);
		expect(result[1]).toEqual([
			[5, 5],
			[5, 6],
			[6, 6]
		]);
	});
});

describe('findSnap', () => {
	function fakeMapAndL() {
		const L = {
			latLng: (lat: number, lng: number) => ({ lat, lng }),
			point: (x: number, y: number) => ({ x, y })
		};
		const map = {
			getZoom: () => 10,
			project: (ll: { lat: number; lng: number }) => ({ x: ll.lat * 100, y: ll.lng * 100 }),
			unproject: (pt: { x: number; y: number }) => ({ lat: pt.x / 100, lng: pt.y / 100 })
		};
		return { L, map };
	}

	it('snaps to a nearby vertex within the pixel threshold', () => {
		const { L, map } = fakeMapAndL();
		const cursor = L.latLng(1.001, 2);
		const snapCache: [number, number][][] = [
			[
				[1, 2],
				[1, 3],
				[2, 3]
			]
		];
		const result = findSnap(
			cursor as unknown as Leaflet.LatLng,
			snapCache,
			map as unknown as Leaflet.Map,
			L as unknown as typeof Leaflet,
			16
		);
		expect(result).toEqual({ lat: 1, lng: 2 });
	});

	it('returns null when nothing is within the threshold', () => {
		const { L, map } = fakeMapAndL();
		const cursor = L.latLng(50, 50);
		const snapCache: [number, number][][] = [
			[
				[1, 2],
				[1, 3],
				[2, 3]
			]
		];
		const result = findSnap(
			cursor as unknown as Leaflet.LatLng,
			snapCache,
			map as unknown as Leaflet.Map,
			L as unknown as typeof Leaflet,
			16
		);
		expect(result).toBeNull();
	});

	it('snaps to a point along an edge when no vertex is close enough', () => {
		const { L, map } = fakeMapAndL();
		// Cursor at (0.05, 5) is far from every vertex of this square ring but
		// projects to within 5px of the midpoint of the (0,0)-(0,10) edge.
		const cursor = L.latLng(0.05, 5);
		const snapCache: [number, number][][] = [
			[
				[0, 0],
				[0, 10],
				[10, 10],
				[10, 0]
			]
		];
		const result = findSnap(
			cursor as unknown as Leaflet.LatLng,
			snapCache,
			map as unknown as Leaflet.Map,
			L as unknown as typeof Leaflet,
			16
		);
		expect(result).toEqual({ lat: 0, lng: 5 });
	});
});

describe('latLngsToGeoJson', () => {
	it('flips [lat, lon] to [lon, lat] and closes the ring', () => {
		const vertices: [number, number][] = [
			[40.1, -40.5],
			[40.1, -40.4],
			[40.2, -40.4]
		];
		expect(latLngsToGeoJson(vertices)).toEqual({
			type: 'Polygon',
			coordinates: [
				[
					[-40.5, 40.1],
					[-40.4, 40.1],
					[-40.4, 40.2],
					[-40.5, 40.1]
				]
			]
		});
	});

	it('returns an empty ring for an empty vertex list', () => {
		expect(latLngsToGeoJson([])).toEqual({ type: 'Polygon', coordinates: [[]] });
	});

	it('round-trips through geoJsonToLatLngs', () => {
		const vertices: [number, number][] = [
			[0, 0],
			[0, 1],
			[1, 1]
		];
		const geojson = latLngsToGeoJson(vertices);
		expect(geoJsonToLatLngs(geojson)).toEqual([vertices]);
	});
});

describe('isValidPolygonGeoJson', () => {
	it('accepts a well-formed Polygon with 3 distinct points', () => {
		expect(
			isValidPolygonGeoJson({
				type: 'Polygon',
				coordinates: [
					[
						[0, 0],
						[1, 0],
						[1, 1],
						[0, 0]
					]
				]
			})
		).toBe(true);
	});

	it('rejects a Polygon ring with fewer than 3 distinct points', () => {
		expect(
			isValidPolygonGeoJson({
				type: 'Polygon',
				coordinates: [
					[
						[0, 0],
						[1, 0],
						[0, 0]
					]
				]
			})
		).toBe(false);
	});

	it('rejects a MultiPolygon', () => {
		expect(
			isValidPolygonGeoJson({
				type: 'MultiPolygon',
				coordinates: [
					[
						[
							[0, 0],
							[1, 0],
							[1, 1],
							[0, 0]
						]
					]
				]
			})
		).toBe(false);
	});

	it('rejects non-object and malformed input', () => {
		expect(isValidPolygonGeoJson(null)).toBe(false);
		expect(isValidPolygonGeoJson('not json')).toBe(false);
		expect(isValidPolygonGeoJson({ type: 'Polygon' })).toBe(false);
		expect(isValidPolygonGeoJson({ type: 'Polygon', coordinates: [] })).toBe(false);
		expect(isValidPolygonGeoJson({ type: 'Polygon', coordinates: [null] })).toBe(false);
	});

	it('rejects a ring containing any non-finite or malformed entry, rather than silently dropping it', () => {
		expect(
			isValidPolygonGeoJson({
				type: 'Polygon',
				coordinates: [[[0, 0], [1, 0], [1, 1], null, [0, 0]]]
			})
		).toBe(false);
		expect(
			isValidPolygonGeoJson({
				type: 'Polygon',
				coordinates: [
					[
						[0, 0],
						[1, 0],
						[Infinity, 1],
						[0, 0]
					]
				]
			})
		).toBe(false);
	});

	it('rejects a Polygon with holes (more than one ring)', () => {
		expect(
			isValidPolygonGeoJson({
				type: 'Polygon',
				coordinates: [
					[
						[0, 0],
						[10, 0],
						[10, 10],
						[0, 0]
					],
					[
						[2, 2],
						[4, 2],
						[4, 4],
						[2, 2]
					]
				]
			})
		).toBe(false);
	});
});

describe('appendDrawVertex', () => {
	it('appends vertices one at a time while fewer than 3 exist', () => {
		let vertices: [number, number][] = [];
		vertices = appendDrawVertex(vertices, 1, 2);
		expect(vertices).toEqual([[1, 2]]);
		vertices = appendDrawVertex(vertices, 3, 4);
		expect(vertices).toEqual([
			[1, 2],
			[3, 4]
		]);
	});

	it('appends the third vertex, completing the bootstrap triangle', () => {
		const vertices: [number, number][] = [
			[1, 2],
			[3, 4]
		];
		const result = appendDrawVertex(vertices, 5, 6);
		expect(result).toEqual([
			[1, 2],
			[3, 4],
			[5, 6]
		]);
	});

	it('keeps appending vertices past the third, for a freeform multi-point shape', () => {
		const vertices: [number, number][] = [
			[1, 2],
			[3, 4],
			[5, 6]
		];
		const result = appendDrawVertex(vertices, 7, 8);
		expect(result).toEqual([
			[1, 2],
			[3, 4],
			[5, 6],
			[7, 8]
		]);
	});

	it('does not mutate the input array', () => {
		const vertices: [number, number][] = [[1, 2]];
		appendDrawVertex(vertices, 3, 4);
		expect(vertices).toEqual([[1, 2]]);
	});
});

describe('canVisuallyEditPolygon', () => {
	it('accepts a single-ring Polygon with 3+ distinct vertices', () => {
		expect(
			canVisuallyEditPolygon({
				type: 'Polygon',
				coordinates: [
					[
						[0, 0],
						[1, 0],
						[1, 1],
						[0, 0]
					]
				]
			})
		).toBe(true);
	});

	it('rejects null, MultiPolygon, a Polygon with holes, and a degenerate ring', () => {
		expect(canVisuallyEditPolygon(null)).toBe(false);
		expect(
			canVisuallyEditPolygon({
				type: 'MultiPolygon',
				coordinates: [
					[
						[
							[0, 0],
							[1, 0],
							[1, 1],
							[0, 0]
						]
					]
				]
			})
		).toBe(false);
		expect(
			canVisuallyEditPolygon({
				type: 'Polygon',
				coordinates: [
					[
						[0, 0],
						[10, 0],
						[10, 10],
						[0, 0]
					],
					[
						[2, 2],
						[4, 2],
						[4, 4],
						[2, 2]
					]
				]
			})
		).toBe(false);
		expect(
			canVisuallyEditPolygon({
				type: 'Polygon',
				coordinates: [
					[
						[0, 0],
						[1, 1]
					]
				]
			})
		).toBe(false);
	});
});
