import { describe, it, expect, vi } from 'vitest';
import { generateBootstrapRoute } from './bootstrapRoute';
import type { GeoJsonGeometry } from '../types';

const geometry: GeoJsonGeometry = {
	type: 'Polygon',
	coordinates: [
		[
			[-83, 41],
			[-83.1, 41],
			[-83.1, 41.1],
			[-83, 41]
		]
	]
};

function okPost(features: unknown) {
	return vi.fn().mockResolvedValue({
		status: 200,
		body: JSON.stringify({ data: { features } })
	});
}

const point = { type: 'Feature', geometry: { type: 'Point', coordinates: [-83, 41] } };

describe('generateBootstrapRoute', () => {
	it('posts a bootstrap request with radius 70 and min_points 1 and no max_clusters', async () => {
		const post = okPost([point]);
		await generateBootstrapRoute({ baseUrl: 'http://koji', geometry, timeoutMs: 1000 }, post);
		const [url, bodyStr] = post.mock.calls[0];
		expect(url).toBe('http://koji/api/v1/calc/bootstrap');
		const body = JSON.parse(bodyStr);
		expect(body.radius).toBe(70);
		expect(body.min_points).toBe(1);
		expect(body).not.toHaveProperty('max_clusters');
	});

	it('sends a Bearer header when a secret is given', async () => {
		const post = okPost([point]);
		await generateBootstrapRoute(
			{ baseUrl: 'http://koji', secret: 's', geometry, timeoutMs: 1000 },
			post
		);
		expect(post.mock.calls[0][2]).toMatchObject({ Authorization: 'Bearer s' });
	});

	it('sends no Authorization header without a secret', async () => {
		const post = okPost([point]);
		await generateBootstrapRoute({ baseUrl: 'http://koji', geometry, timeoutMs: 1000 }, post);
		expect(post.mock.calls[0][2]).not.toHaveProperty('Authorization');
	});

	it('maps [lon, lat] points to { lat, lon }', async () => {
		const post = okPost([point]);
		const route = await generateBootstrapRoute(
			{ baseUrl: 'http://koji', geometry, timeoutMs: 1000 },
			post
		);
		expect(route).toEqual([{ lat: 41, lon: -83 }]);
	});

	it('strips a trailing slash from the base URL', async () => {
		const post = okPost([point]);
		await generateBootstrapRoute({ baseUrl: 'http://koji/', geometry, timeoutMs: 1000 }, post);
		expect(post.mock.calls[0][0]).toBe('http://koji/api/v1/calc/bootstrap');
	});

	it('throws on a non-2xx status', async () => {
		const post = vi.fn().mockResolvedValue({ status: 500, body: 'boom' });
		await expect(
			generateBootstrapRoute({ baseUrl: 'http://koji', geometry, timeoutMs: 1000 }, post)
		).rejects.toThrow('Kōji returned 500');
	});

	it('throws on unparsable JSON', async () => {
		const post = vi.fn().mockResolvedValue({ status: 200, body: '<html>' });
		await expect(
			generateBootstrapRoute({ baseUrl: 'http://koji', geometry, timeoutMs: 1000 }, post)
		).rejects.toThrow(/not valid JSON/);
	});

	it('throws when Kōji returns no points', async () => {
		const post = okPost([]);
		await expect(
			generateBootstrapRoute({ baseUrl: 'http://koji', geometry, timeoutMs: 1000 }, post)
		).rejects.toThrow(/no route points/);
	});

	it('passes the timeout through', async () => {
		const post = okPost([point]);
		await generateBootstrapRoute({ baseUrl: 'http://koji', geometry, timeoutMs: 4321 }, post);
		expect(post.mock.calls[0][3]).toEqual({ timeoutMs: 4321 });
	});
});
