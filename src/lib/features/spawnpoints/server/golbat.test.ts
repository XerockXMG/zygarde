import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	buildWkt,
	getBBox,
	getCacheStats,
	getSpawnpointCount,
	invalidateCache,
	type QueryExecutor
} from './golbat';
import type { LatLngTuple } from '$lib/features/map/types';

// $env/dynamic/private is baked from process.env at Vite config resolution
// time (not read live), so stubbing process.env in a test has no effect on
// it — mock the module directly instead, so getGolbatPool() sees a
// configured GOLBAT_DATABASE_URL and getSpawnpointCount can legitimately
// populate the real (module-private) L1 cache that getCacheStats reports on.
vi.mock('$env/dynamic/private', () => ({
	env: { GOLBAT_DATABASE_URL: 'mysql://fake-user:fake-pass@localhost:3306/golbat' }
}));

// Backs the mocked Golbat mysql2 pool — lets tests control what the spatial
// COUNT query "returns".
const golbatExecuteMock = vi.fn();
vi.mock('mysql2/promise', () => ({
	default: {
		createPool: () => ({ execute: golbatExecuteMock })
	}
}));

function fakeExecutor(): QueryExecutor & { execute: ReturnType<typeof vi.fn> } {
	return { execute: vi.fn() };
}

const RING: LatLngTuple[][] = [
	[
		[0, 0],
		[0, 1],
		[1, 1]
	]
];

describe('buildWkt', () => {
	it('builds a POLYGON literal for a single ring, X=lon Y=lat, closing the ring', () => {
		const ring: LatLngTuple[] = [
			[10, 20],
			[10, 21],
			[11, 21]
		];
		const wkt = buildWkt([ring]);
		expect(wkt).toBe('POLYGON((20 10, 21 10, 21 11, 20 10))');
	});

	it('builds a MULTIPOLYGON literal for several rings', () => {
		const ringA: LatLngTuple[] = [
			[0, 0],
			[0, 1],
			[1, 1]
		];
		const ringB: LatLngTuple[] = [
			[5, 5],
			[5, 6],
			[6, 6]
		];
		const wkt = buildWkt([ringA, ringB]);
		expect(wkt).toBe('MULTIPOLYGON(((0 0, 1 0, 1 1, 0 0)), ((5 5, 6 5, 6 6, 5 5)))');
	});
});

describe('getBBox', () => {
	it('spans the min/max lat/lon across every ring', () => {
		const ringA: LatLngTuple[] = [
			[10, 20],
			[12, 22]
		];
		const ringB: LatLngTuple[] = [
			[5, 30],
			[15, 18]
		];
		expect(getBBox([ringA, ringB])).toEqual({
			minLat: 5,
			maxLat: 15,
			minLon: 18,
			maxLon: 30
		});
	});
});

describe('getCacheStats', () => {
	beforeEach(async () => {
		golbatExecuteMock.mockReset();
		// Reset L1 between tests — memCache is module-private state shared
		// across the whole file, so this keeps tests independent.
		await invalidateCache(null);
	});

	it('returns L1-only stats when no executor is given', async () => {
		golbatExecuteMock.mockResolvedValueOnce([[{ cnt: 3 }], undefined]);
		await getSpawnpointCount(null, 1, RING, 'all', 30, 1);
		golbatExecuteMock.mockResolvedValueOnce([[{ cnt: 7 }], undefined]);
		await getSpawnpointCount(null, 2, RING, 'recent', 30, 1);

		await expect(getCacheStats()).resolves.toEqual({
			totalEntries: 2,
			byMode: { all: 1, recent: 1 }
		});
	});

	it('unions L1 and L2, counting a key present in both only once', async () => {
		golbatExecuteMock.mockResolvedValueOnce([[{ cnt: 3 }], undefined]);
		await getSpawnpointCount(null, 1, RING, 'all', 30, 1);

		const executor = fakeExecutor();
		executor.execute.mockResolvedValueOnce([
			[
				{ area_id: 1, mode: 'all' }, // also present in L1 — must not double-count
				{ area_id: 3, mode: 'confirmed' }
			],
			undefined
		]);

		await expect(getCacheStats(executor)).resolves.toEqual({
			totalEntries: 2,
			byMode: { all: 1, confirmed: 1 }
		});
	});

	it('falls back to L1-only stats when the L2 query fails', async () => {
		golbatExecuteMock.mockResolvedValueOnce([[{ cnt: 3 }], undefined]);
		await getSpawnpointCount(null, 1, RING, 'all', 30, 1);

		const executor = fakeExecutor();
		executor.execute.mockRejectedValueOnce(new Error('connection lost'));

		await expect(getCacheStats(executor)).resolves.toEqual({
			totalEntries: 1,
			byMode: { all: 1 }
		});
	});
});
