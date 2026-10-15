import { describe, expect, it } from 'vitest';
import { pickZoom } from './mappreview';

describe('pickZoom', () => {
	it('returns a higher zoom for a smaller bounding box', () => {
		const smallAreaZoom = pickZoom(40.0, 40.01, -40.5, -40.49);
		const largeAreaZoom = pickZoom(35.0, 45.0, -90.0, -75.0);
		expect(smallAreaZoom).toBeGreaterThan(largeAreaZoom);
	});

	it('never returns a zoom below 2', () => {
		const zoom = pickZoom(-85, 85, -179, 179);
		expect(zoom).toBeGreaterThanOrEqual(2);
	});

	it('never returns a zoom above 16', () => {
		const zoom = pickZoom(40.0, 40.0001, -40.5, -40.4999);
		expect(zoom).toBeLessThanOrEqual(16);
	});
});
