import { describe, expect, it, vi } from 'vitest';
import {
	getAutoscaleConfigs,
	ensureAutoscaleRows,
	enableAutoscale,
	disableAutoscale,
	type QueryExecutor
} from './state';

function fakeExecutor(): QueryExecutor & { execute: ReturnType<typeof vi.fn> } {
	return { execute: vi.fn() };
}

describe('getAutoscaleConfigs', () => {
	it('maps rows to a Record keyed by area id', async () => {
		const executor = fakeExecutor();
		executor.execute.mockResolvedValueOnce([
			[
				{ area_id: 1, enabled: 1, max_pokemon_workers: 10 },
				{ area_id: 2, enabled: 0, max_pokemon_workers: 4 }
			],
			undefined
		]);

		await expect(getAutoscaleConfigs(executor)).resolves.toEqual({
			1: { areaId: 1, enabled: true, maxPokemonWorkers: 10 },
			2: { areaId: 2, enabled: false, maxPokemonWorkers: 4 }
		});
	});

	it('returns an empty object when there are no rows', async () => {
		const executor = fakeExecutor();
		executor.execute.mockResolvedValueOnce([[], undefined]);
		await expect(getAutoscaleConfigs(executor)).resolves.toEqual({});
	});
});

describe('ensureAutoscaleRows', () => {
	it('inserts a default row only for areas missing one', async () => {
		const executor = fakeExecutor();
		executor.execute.mockResolvedValueOnce([[{ area_id: 1 }], undefined]); // existing rows
		executor.execute.mockResolvedValueOnce([{}, undefined]); // the one insert

		await ensureAutoscaleRows(executor, [
			{ id: 1, pokemonWorkers: 99 },
			{ id: 2, pokemonWorkers: 7 }
		]);

		expect(executor.execute).toHaveBeenCalledTimes(2);
		expect(executor.execute).toHaveBeenLastCalledWith(
			expect.stringContaining('INSERT INTO area_worker_autoscale'),
			[2, 7]
		);
	});

	it('does nothing when every area already has a row', async () => {
		const executor = fakeExecutor();
		executor.execute.mockResolvedValueOnce([[{ area_id: 1 }, { area_id: 2 }], undefined]);

		await ensureAutoscaleRows(executor, [
			{ id: 1, pokemonWorkers: 99 },
			{ id: 2, pokemonWorkers: 7 }
		]);

		expect(executor.execute).toHaveBeenCalledTimes(1);
	});
});

describe('enableAutoscale', () => {
	it('upserts enabled=true with the new max', async () => {
		const executor = fakeExecutor();
		executor.execute.mockResolvedValueOnce([{}, undefined]);

		await enableAutoscale(executor, 5, 12);

		const [sql, params] = executor.execute.mock.calls[0];
		expect(sql).toContain('INSERT INTO area_worker_autoscale');
		expect(sql).toContain('ON DUPLICATE KEY UPDATE');
		expect(params).toEqual([5, 12]);
	});
});

describe('disableAutoscale', () => {
	it('sets enabled=false without touching the stored max', async () => {
		const executor = fakeExecutor();
		executor.execute.mockResolvedValueOnce([{}, undefined]);

		await disableAutoscale(executor, 5);

		const [sql, params] = executor.execute.mock.calls[0];
		expect(sql).toContain('UPDATE area_worker_autoscale');
		expect(sql).not.toContain('max_pokemon_workers');
		expect(params).toEqual([5]);
	});
});
