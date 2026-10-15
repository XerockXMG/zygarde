import { describe, expect, it, vi } from 'vitest';
import {
	getTileSettings,
	setTileSettings,
	DEFAULT_TILE_SETTINGS,
	type QueryExecutor
} from './tileSettings';

function fakeExecutor(): QueryExecutor & { execute: ReturnType<typeof vi.fn> } {
	return { execute: vi.fn() };
}

describe('getTileSettings', () => {
	it('returns the stored row, mapped to camelCase', async () => {
		const executor = fakeExecutor();
		executor.execute.mockResolvedValueOnce([
			[
				{
					tile_url_template: 'https://example.com/{z}/{x}/{y}.png',
					tile_attribution: '© Example',
					tile_max_zoom: 18,
					tile_size: 512,
					zoom_offset: -1
				}
			],
			undefined
		]);

		const result = await getTileSettings(executor);

		expect(result).toEqual({
			urlTemplate: 'https://example.com/{z}/{x}/{y}.png',
			attribution: '© Example',
			maxZoom: 18,
			tileSize: 512,
			zoomOffset: -1
		});
		expect(executor.execute).toHaveBeenCalledWith(expect.stringContaining('FROM map_settings'));
	});

	it('returns the defaults when no row exists yet', async () => {
		const executor = fakeExecutor();
		executor.execute.mockResolvedValueOnce([[], undefined]);

		const result = await getTileSettings(executor);

		expect(result).toEqual(DEFAULT_TILE_SETTINGS);
	});
});

describe('setTileSettings', () => {
	it('upserts the single settings row', async () => {
		const executor = fakeExecutor();
		executor.execute.mockResolvedValueOnce([{}, undefined]);

		await setTileSettings(
			executor,
			'https://tiles.example.com/{z}/{x}/{y}.png',
			'© Example',
			19,
			512,
			-1
		);

		const [sql, params] = executor.execute.mock.calls[0];
		expect(sql).toContain('INSERT INTO map_settings');
		expect(sql).toContain('ON DUPLICATE KEY UPDATE');
		expect(params).toEqual(['https://tiles.example.com/{z}/{x}/{y}.png', '© Example', 19, 512, -1]);
	});
});
