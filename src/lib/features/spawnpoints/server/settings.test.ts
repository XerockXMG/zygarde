import { describe, expect, it, vi } from 'vitest';
import { getSettings, setSettings, DEFAULT_SETTINGS, type QueryExecutor } from './settings';

function fakeExecutor(): QueryExecutor & { execute: ReturnType<typeof vi.fn> } {
	return { execute: vi.fn() };
}

describe('getSettings', () => {
	it('returns the stored row, mapped to camelCase', async () => {
		const executor = fakeExecutor();
		executor.execute.mockResolvedValueOnce([[{ recent_days: 14, cache_ttl_hours: 6 }], undefined]);

		const result = await getSettings(executor);

		expect(result).toEqual({ recentDays: 14, cacheTtlHours: 6 });
		expect(executor.execute).toHaveBeenCalledWith(
			expect.stringContaining('FROM spawnpoint_settings')
		);
	});

	it('returns the defaults when no row exists yet', async () => {
		const executor = fakeExecutor();
		executor.execute.mockResolvedValueOnce([[], undefined]);

		const result = await getSettings(executor);

		expect(result).toEqual(DEFAULT_SETTINGS);
	});
});

describe('setSettings', () => {
	it('upserts the single settings row', async () => {
		const executor = fakeExecutor();
		executor.execute.mockResolvedValueOnce([{}, undefined]);

		await setSettings(executor, 45, 2);

		const [sql, params] = executor.execute.mock.calls[0];
		expect(sql).toContain('INSERT INTO spawnpoint_settings');
		expect(sql).toContain('ON DUPLICATE KEY UPDATE');
		expect(params).toEqual([45, 2]);
	});
});
