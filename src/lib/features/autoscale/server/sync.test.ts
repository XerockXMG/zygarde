import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAutoscaleSync, type QueryExecutor } from './sync';

const config = { baseUrl: 'http://dragonite:7272' };

function fakeExecutor(): QueryExecutor & { execute: ReturnType<typeof vi.fn> } {
	return { execute: vi.fn() };
}

function jsonResponse(body: unknown, headers: Record<string, string> = {}) {
	return {
		ok: true,
		headers: { get: (name: string) => headers[name] ?? null },
		json: async () => body
	};
}

function rawArea(overrides: Record<string, unknown> = {}) {
	return {
		id: 1,
		name: 'Test Area',
		enabled: true,
		enable_pokemon: true,
		enable_forts: true,
		enable_quests: true,
		enable_rare_pokemon: false,
		geofence: null,
		pokemon_mode: { workers: 10, route: [] },
		fort_mode: { workers: 2, route: [] },
		quest_mode: { workers: 1, route: [] },
		rare_pokemon_mode: { workers: 0, route: [] },
		...overrides
	};
}

const votingSettingsRow = {
	workers_per_token: 2,
	subscription_grace_period_days: 7,
	autoscale_interval_minutes: 15
};

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('runAutoscaleSync', () => {
	it('does nothing when no area has autoscale enabled', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(jsonResponse([rawArea()], { 'X-Total-Pages': '1' }))
		);
		const local = fakeExecutor();
		local.execute
			.mockResolvedValueOnce([[{ area_id: 1 }], undefined]) // ensureAutoscaleRows: existing ids
			.mockResolvedValueOnce([[{ area_id: 1, enabled: 0, max_pokemon_workers: 10 }], undefined]); // getAutoscaleConfigs

		const result = await runAutoscaleSync(config, local);

		expect(result).toEqual({ updated: [] });
		expect(fetch).toHaveBeenCalledTimes(1); // only the area list, no PATCH
	});

	it('skips an enabled area with no vote target configured', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(jsonResponse([rawArea()], { 'X-Total-Pages': '1' }))
		);
		const local = fakeExecutor();
		local.execute
			.mockResolvedValueOnce([[{ area_id: 1 }], undefined]) // ensureAutoscaleRows
			.mockResolvedValueOnce([[{ area_id: 1, enabled: 1, max_pokemon_workers: 10 }], undefined]) // getAutoscaleConfigs
			.mockResolvedValueOnce([[], undefined]) // getAreaTargetConfigs — none configured
			.mockResolvedValueOnce([[], undefined]) // getAreaTokenTotals
			.mockResolvedValueOnce([[votingSettingsRow], undefined]); // getVotingSettings

		const result = await runAutoscaleSync(config, local);

		expect(result).toEqual({ updated: [] });
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it('does not patch when the resolved tier already matches the live worker count', async () => {
		// Fully funded (static target of 5, 5 tokens in) -> tier 100 -> scaled
		// workers = max (10) -> matches the area's current live count (10).
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(
				jsonResponse([rawArea({ pokemon_mode: { workers: 10, route: [] } })], {
					'X-Total-Pages': '1'
				})
			)
		);
		const local = fakeExecutor();
		local.execute
			.mockResolvedValueOnce([[{ area_id: 1 }], undefined])
			.mockResolvedValueOnce([[{ area_id: 1, enabled: 1, max_pokemon_workers: 10 }], undefined])
			.mockResolvedValueOnce([
				[{ area_id: 1, mode: 'static', static_value: 5, workers_per_token_override: null }],
				undefined
			])
			.mockResolvedValueOnce([[{ area_id: 1, total: 5 }], undefined])
			.mockResolvedValueOnce([[votingSettingsRow], undefined]);

		const result = await runAutoscaleSync(config, local);

		expect(result).toEqual({ updated: [] });
		expect(fetch).toHaveBeenCalledTimes(1); // no PATCH — nothing changed
	});

	it('throttles an underfunded area and PATCHes Dragonite with the scaled count', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				jsonResponse([rawArea({ pokemon_mode: { workers: 10, route: [] } })], {
					'X-Total-Pages': '1'
				})
			)
			.mockResolvedValueOnce(jsonResponse(rawArea({ pokemon_mode: { workers: 3, route: [] } })));
		vi.stubGlobal('fetch', fetchMock);

		const local = fakeExecutor();
		local.execute
			.mockResolvedValueOnce([[{ area_id: 1 }], undefined])
			.mockResolvedValueOnce([[{ area_id: 1, enabled: 1, max_pokemon_workers: 10 }], undefined])
			// Static target of 10, only 1 token in -> 10% funded -> tier 25 ->
			// round(10 * 0.25) = 3.
			.mockResolvedValueOnce([
				[{ area_id: 1, mode: 'static', static_value: 10, workers_per_token_override: null }],
				undefined
			])
			.mockResolvedValueOnce([[{ area_id: 1, total: 1 }], undefined])
			.mockResolvedValueOnce([[votingSettingsRow], undefined]);

		const result = await runAutoscaleSync(config, local);

		expect(result).toEqual({ updated: [1] });
		expect(fetchMock).toHaveBeenCalledTimes(2);
		const [url, init] = fetchMock.mock.calls[1];
		expect(url).toBe('http://dragonite:7272/v2/areas/1');
		expect(init.method).toBe('PATCH');
		expect(JSON.parse(init.body)).toEqual({ pokemon_mode: { workers: 3 } });
	});

	it('resolves a workers-mode target off the stored max, not the live (already-throttled) worker count', async () => {
		// Regression test for the target/autoscale feedback loop: if the
		// `workers`-mode target were computed from the area's LIVE worker
		// count (2, already throttled by a previous run) instead of the
		// stored max (10), target = ceil(2/2) = 1, 1 token in would read as
		// 100% funded, and this run would immediately scale back up to the
		// full max of 10 — oscillating forever. Using the stored max instead
		// gives target = ceil(10/2) = 5, so 1 token is only 20% funded (tier
		// 25), scaling to round(10 * 0.25) = 3, not back up to 10.
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				jsonResponse([rawArea({ pokemon_mode: { workers: 2, route: [] } })], {
					'X-Total-Pages': '1'
				})
			)
			.mockResolvedValueOnce(jsonResponse(rawArea({ pokemon_mode: { workers: 3, route: [] } })));
		vi.stubGlobal('fetch', fetchMock);

		const local = fakeExecutor();
		local.execute
			.mockResolvedValueOnce([[{ area_id: 1 }], undefined])
			.mockResolvedValueOnce([[{ area_id: 1, enabled: 1, max_pokemon_workers: 10 }], undefined])
			.mockResolvedValueOnce([
				[{ area_id: 1, mode: 'workers', static_value: 0, workers_per_token_override: null }],
				undefined
			])
			.mockResolvedValueOnce([[{ area_id: 1, total: 1 }], undefined])
			.mockResolvedValueOnce([[votingSettingsRow], undefined]);

		const result = await runAutoscaleSync(config, local);

		expect(result).toEqual({ updated: [1] });
		const [, init] = fetchMock.mock.calls[1];
		expect(JSON.parse(init.body)).toEqual({ pokemon_mode: { workers: 3 } });
	});

	it('logs and continues when a Dragonite PATCH fails for one area, without throwing', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				jsonResponse([rawArea({ pokemon_mode: { workers: 10, route: [] } })], {
					'X-Total-Pages': '1'
				})
			)
			.mockResolvedValueOnce({ ok: false, status: 500 });
		vi.stubGlobal('fetch', fetchMock);

		const local = fakeExecutor();
		local.execute
			.mockResolvedValueOnce([[{ area_id: 1 }], undefined])
			.mockResolvedValueOnce([[{ area_id: 1, enabled: 1, max_pokemon_workers: 10 }], undefined])
			.mockResolvedValueOnce([
				[{ area_id: 1, mode: 'static', static_value: 10, workers_per_token_override: null }],
				undefined
			])
			.mockResolvedValueOnce([[{ area_id: 1, total: 1 }], undefined])
			.mockResolvedValueOnce([[votingSettingsRow], undefined]);

		await expect(runAutoscaleSync(config, local)).resolves.toEqual({ updated: [] });
	});
});
