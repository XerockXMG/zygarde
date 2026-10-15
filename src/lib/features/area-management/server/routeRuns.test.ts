import { describe, expect, it, vi } from 'vitest';
import { recordRouteRun, getRouteRuns, type QueryExecutor } from './routeRuns';

function fakeExecutor(): QueryExecutor & { execute: ReturnType<typeof vi.fn> } {
	return { execute: vi.fn() };
}

describe('recordRouteRun', () => {
	it('upserts a run row keyed by area id and route type', async () => {
		const executor = fakeExecutor();
		executor.execute.mockResolvedValueOnce([{}, {}]);

		await recordRouteRun(executor, { areaId: 5, routeType: 'spawnpoint', stopCount: 120 });

		expect(executor.execute).toHaveBeenCalledTimes(1);
		const [sql, params] = executor.execute.mock.calls[0];
		expect(sql).toContain('INSERT INTO area_route_runs');
		expect(sql).toContain('ON DUPLICATE KEY UPDATE');
		expect(params).toEqual([5, 'spawnpoint', 120, 120]);
	});
});

describe('getRouteRuns', () => {
	it('groups rows by area id and route type', async () => {
		const executor = fakeExecutor();
		executor.execute.mockResolvedValueOnce([
			[
				{
					area_id: 1,
					route_type: 'spawnpoint',
					generated_at: new Date('2026-01-01T00:00:00Z'),
					stop_count: 100
				},
				{
					area_id: 1,
					route_type: 'bootstrap',
					generated_at: new Date('2026-01-02T00:00:00Z'),
					stop_count: 50
				},
				{
					area_id: 2,
					route_type: 'spawnpoint',
					generated_at: new Date('2026-01-03T00:00:00Z'),
					stop_count: 75
				}
			],
			undefined
		]);

		await expect(getRouteRuns(executor)).resolves.toEqual({
			1: {
				spawnpoint: { generatedAt: '2026-01-01T00:00:00.000Z', stopCount: 100 },
				bootstrap: { generatedAt: '2026-01-02T00:00:00.000Z', stopCount: 50 }
			},
			2: {
				spawnpoint: { generatedAt: '2026-01-03T00:00:00.000Z', stopCount: 75 }
			}
		});
	});

	it('returns an empty object when there are no runs', async () => {
		const executor = fakeExecutor();
		executor.execute.mockResolvedValueOnce([[], undefined]);
		await expect(getRouteRuns(executor)).resolves.toEqual({});
	});
});
