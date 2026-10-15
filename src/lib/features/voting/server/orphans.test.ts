import { describe, expect, it, vi } from 'vitest';
import { cleanupOrphanedVotes, planOrphanCleanup } from './orphans';
import type { QueryExecutor } from './votes';

function fakeExecutor(): QueryExecutor & { execute: ReturnType<typeof vi.fn> } {
	return { execute: vi.fn() };
}

describe('planOrphanCleanup', () => {
	it('leaves areas that still exist alone', () => {
		expect(planOrphanCleanup([1, 2], new Set([1, 2]), new Set())).toEqual({
			remove: [],
			pending: []
		});
	});

	it('marks a newly missing area pending instead of removing it', () => {
		expect(planOrphanCleanup([1, 194], new Set([1]), new Set())).toEqual({
			remove: [],
			pending: [194]
		});
	});

	it('removes an area that was also missing last run', () => {
		expect(planOrphanCleanup([1, 194, 195], new Set([1]), new Set([194]))).toEqual({
			remove: [194],
			pending: [195]
		});
	});

	it('dedupes ids referenced by both votes and primaries', () => {
		expect(planOrphanCleanup([194, 194, 194], new Set([1]), new Set([194]))).toEqual({
			remove: [194],
			pending: []
		});
	});

	it('forgives an area that came back', () => {
		expect(planOrphanCleanup([194], new Set([194]), new Set([194]))).toEqual({
			remove: [],
			pending: []
		});
	});
});

describe('cleanupOrphanedVotes', () => {
	it('does nothing when the live area list is empty (failed lookup)', async () => {
		const executor = fakeExecutor();
		const result = await cleanupOrphanedVotes(executor, new Set(), new Set([194]));
		expect(result).toEqual({
			removedAreaIds: [],
			freedTokens: {},
			removedPrimaries: 0,
			pendingAreaIds: []
		});
		expect(executor.execute).not.toHaveBeenCalled();
	});

	it('only reports pending areas on first sight, without deleting', async () => {
		const executor = fakeExecutor();
		executor.execute
			.mockResolvedValueOnce([[{ area_id: 1 }, { area_id: 194 }], undefined])
			.mockResolvedValueOnce([[{ area_id: 1 }], undefined]);
		const result = await cleanupOrphanedVotes(executor, new Set([1]), new Set());
		expect(result.pendingAreaIds).toEqual([194]);
		expect(result.removedAreaIds).toEqual([]);
		expect(executor.execute).toHaveBeenCalledTimes(2);
	});

	it('deletes votes and primaries for areas missing twice and reports freed tokens', async () => {
		const executor = fakeExecutor();
		executor.execute
			.mockResolvedValueOnce([[{ area_id: 1 }, { area_id: 194 }, { area_id: 195 }], undefined])
			.mockResolvedValueOnce([[{ area_id: 194 }], undefined])
			.mockResolvedValueOnce([
				[
					{ area_id: 194, discord_id: 'a', amount: 1 },
					{ area_id: 194, discord_id: 'b', amount: '2' },
					{ area_id: 195, discord_id: 'a', amount: 1 }
				],
				undefined
			])
			.mockResolvedValueOnce([{ affectedRows: 3 }, undefined])
			.mockResolvedValueOnce([{ affectedRows: 1 }, undefined]);

		const result = await cleanupOrphanedVotes(executor, new Set([1]), new Set([194, 195]));

		expect(result).toEqual({
			removedAreaIds: [194, 195],
			freedTokens: { a: 2, b: 2 },
			removedPrimaries: 1,
			pendingAreaIds: []
		});
		expect(executor.execute).toHaveBeenCalledWith(
			'DELETE FROM area_votes WHERE area_id IN (?, ?)',
			[194, 195]
		);
		expect(executor.execute).toHaveBeenCalledWith(
			'DELETE FROM area_primary WHERE area_id IN (?, ?)',
			[194, 195]
		);
	});
});
