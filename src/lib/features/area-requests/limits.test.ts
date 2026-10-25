import { describe, expect, it } from 'vitest';
import { MAX_REQUEST_VERTICES, requestGeofenceProblem } from './limits';
import type { GeoJsonPolygon } from '$lib/features/area-management/types';

const polygon = (ring: [number, number][]): GeoJsonPolygon => ({
	type: 'Polygon',
	coordinates: [ring]
});

describe('requestGeofenceProblem', () => {
	it('accepts a normal polygon', () => {
		expect(
			requestGeofenceProblem(
				polygon([
					[-83.5, 41.6],
					[-83.4, 41.6],
					[-83.4, 41.7],
					[-83.5, 41.6]
				])
			)
		).toBeNull();
	});

	it('rejects a polygon over the vertex cap', () => {
		const ring = Array.from(
			{ length: MAX_REQUEST_VERTICES + 1 },
			(_, i) => [-83 + i * 1e-5, 41 + (i % 2) * 1e-5] as [number, number]
		);
		expect(requestGeofenceProblem(polygon(ring))).toMatch(/too many points/);
	});

	it('rejects out-of-range coordinates', () => {
		expect(
			requestGeofenceProblem(
				polygon([
					[-83.5, 41.6],
					[-83.4, 95],
					[-83.4, 41.7]
				])
			)
		).toMatch(/outside the valid/);
		expect(
			requestGeofenceProblem(
				polygon([
					[200, 41.6],
					[-83.4, 41.6],
					[-83.4, 41.7]
				])
			)
		).toMatch(/outside the valid/);
	});
});
