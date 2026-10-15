import { describe, expect, it, vi } from 'vitest';
import { getAreaTargetConfigs, setAreaTarget, resolveTarget, type QueryExecutor } from './targets';

function fakeExecutor(): QueryExecutor & { execute: ReturnType<typeof vi.fn> } {
	return { execute: vi.fn() };
}

describe('getAreaTargetConfigs', () => {
	it('maps rows to a Record keyed by area id', async () => {
		const executor = fakeExecutor();
		executor.execute.mockResolvedValueOnce([
			[
				{ area_id: 1, mode: 'static', static_value: 20, workers_per_token_override: null },
				{ area_id: 2, mode: 'workers', static_value: 0, workers_per_token_override: 3 }
			],
			undefined
		]);
		await expect(getAreaTargetConfigs(executor)).resolves.toEqual({
			1: { mode: 'static', staticValue: 20, workersPerTokenOverride: null },
			2: { mode: 'workers', staticValue: 0, workersPerTokenOverride: 3 }
		});
	});

	it('returns an empty object when there are no rows', async () => {
		const executor = fakeExecutor();
		executor.execute.mockResolvedValueOnce([[], undefined]);
		await expect(getAreaTargetConfigs(executor)).resolves.toEqual({});
	});
});

describe('setAreaTarget', () => {
	it('upserts the area target config including the override column', async () => {
		const executor = fakeExecutor();
		executor.execute.mockResolvedValueOnce([{}, undefined]);

		await setAreaTarget(executor, 5, 'static', 25, null);

		expect(executor.execute).toHaveBeenCalledWith(
			expect.stringContaining('INSERT INTO area_vote_targets'),
			[5, 'static', 25, null]
		);
		expect(executor.execute).toHaveBeenCalledWith(
			expect.stringContaining('ON DUPLICATE KEY UPDATE'),
			[5, 'static', 25, null]
		);
	});

	it('stores a numeric override when provided', async () => {
		const executor = fakeExecutor();
		executor.execute.mockResolvedValueOnce([{}, undefined]);

		await setAreaTarget(executor, 5, 'workers', 0, 4);

		expect(executor.execute).toHaveBeenCalledWith(expect.any(String), [5, 'workers', 0, 4]);
	});
});

describe('resolveTarget', () => {
	it('returns null when there is no config for the area', () => {
		expect(resolveTarget(undefined, 10, 2)).toBeNull();
	});

	it('returns the static value in static mode, ignoring worker count and global ratio', () => {
		expect(
			resolveTarget({ mode: 'static', staticValue: 30, workersPerTokenOverride: null }, 10, 2)
		).toBe(30);
	});

	it('divides pokemon workers by the global workers-per-token ratio when no override is set', () => {
		// 1 token funds 10 workers, area has 100 workers → needs 10 tokens.
		expect(
			resolveTarget({ mode: 'workers', staticValue: 999, workersPerTokenOverride: null }, 100, 10)
		).toBe(10);
	});

	it('uses the per-area override instead of the global ratio when set', () => {
		// Override of 5 workers/token instead of the global 10 → needs more tokens for the same area.
		expect(
			resolveTarget({ mode: 'workers', staticValue: 999, workersPerTokenOverride: 5 }, 100, 10)
		).toBe(20);
	});

	it('rounds up when workers do not divide evenly by the ratio', () => {
		expect(
			resolveTarget({ mode: 'workers', staticValue: 0, workersPerTokenOverride: null }, 105, 10)
		).toBe(11);
	});
});
