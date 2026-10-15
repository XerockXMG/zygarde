import { describe, expect, it } from 'vitest';
import { buildAutoscaleStatus } from './status';
import type { Area } from '$lib/features/area-management/types';
import type { AutoscaleConfig } from '../types';

function area(id: number, overrides: Partial<Area> = {}): Area {
	return {
		id,
		name: `Area ${id}`,
		enabled: true,
		enable_pokemon: true,
		enable_forts: true,
		enable_quests: true,
		enable_rare_pokemon: true,
		geofence: null,
		pokemon_mode: { workers: 10, route: [] },
		fort_mode: { workers: 0, route: [] },
		quest_mode: { workers: 0, route: [] },
		rare_pokemon_mode: { workers: 0, route: [] },
		...overrides
	};
}

function config(areaId: number, enabled: boolean, maxPokemonWorkers = 20): AutoscaleConfig {
	return { areaId, enabled, maxPokemonWorkers };
}

describe('buildAutoscaleStatus', () => {
	it('lists only autoscale-enabled areas, sorted by name', () => {
		const rows = buildAutoscaleStatus(
			[area(1, { name: 'Zed' }), area(2, { name: 'Alpha' }), area(3, { name: 'Off' })],
			{ 1: config(1, true), 2: config(2, true), 3: config(3, false) },
			{},
			{},
			1
		);
		expect(rows.map((r) => r.name)).toEqual(['Alpha', 'Zed']);
	});

	it('resolves a workers-mode target off the stored max, not the live count', () => {
		const [row] = buildAutoscaleStatus(
			[area(1, { pokemon_mode: { workers: 5, route: [] } })],
			{ 1: config(1, true, 20) },
			{ 1: { mode: 'workers', staticValue: 0, workersPerTokenOverride: null } },
			{ 1: 6 },
			2
		);
		// target = ceil(20 / 2) = 10; 6/10 = 60% → 75% tier → 15 workers
		expect(row).toMatchObject({
			maxPokemonWorkers: 20,
			currentWorkers: 5,
			tokens: 6,
			target: 10,
			fundedPct: 60,
			tier: 75,
			scaledWorkers: 15
		});
	});

	it('leaves the funding columns empty when no target is configured', () => {
		const [row] = buildAutoscaleStatus([area(1)], { 1: config(1, true) }, {}, { 1: 3 }, 1);
		expect(row).toMatchObject({ target: null, fundedPct: null, tier: null, scaledWorkers: null });
	});

	it('treats a zero target like no target, matching sync', () => {
		const [row] = buildAutoscaleStatus(
			[area(1)],
			{ 1: config(1, true) },
			{ 1: { mode: 'static', staticValue: 0, workersPerTokenOverride: null } },
			{},
			1
		);
		expect(row.target).toBeNull();
		expect(row.scaledWorkers).toBeNull();
	});
});
