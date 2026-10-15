import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	listAllAreas,
	patchArea,
	createArea,
	parseQuestHours,
	DEFAULT_QUEST_HOURS
} from './dragonite';
import type { GeoJsonGeometry } from '../types';

const config = { baseUrl: 'http://dragonite:7272' };

const SAMPLE_POLYGON: GeoJsonGeometry = {
	type: 'Polygon',
	coordinates: [
		[
			[-40.5, 40.1],
			[-40.4, 40.1],
			[-40.4, 40.2],
			[-40.5, 40.2],
			[-40.5, 40.1]
		]
	]
};

const SAMPLE_MULTIPOLYGON = {
	type: 'MultiPolygon',
	coordinates: [
		[
			[
				[0, 0],
				[1, 0],
				[1, 1],
				[0, 0]
			]
		],
		[
			[
				[5, 5],
				[6, 5],
				[6, 6],
				[5, 5]
			]
		]
	]
};

function rawArea(overrides: Record<string, unknown> = {}) {
	return {
		id: 1,
		name: 'Test Area',
		enabled: true,
		enable_pokemon: true,
		enable_forts: true,
		enable_quests: true,
		enable_rare_pokemon: false,
		geofence: SAMPLE_POLYGON,
		pokemon_mode: {
			workers: 4,
			route: [{ lat: 1, lon: 2 }],
			geofence: null,
			enable_scout: false,
			invasion: false
		},
		fort_mode: { workers: 2, geofence: null, invasion: false, prio_raid: false, showcase: false },
		quest_mode: { workers: 1, geofence: null, hours: [6, 20], route: null },
		rare_pokemon_mode: { workers: 0, permyriad: 0, extra: null },
		...overrides
	};
}

function jsonResponse(body: unknown, headers: Record<string, string> = {}) {
	return {
		ok: true,
		headers: { get: (name: string) => headers[name] ?? null },
		json: async () => body
	};
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('listAllAreas', () => {
	it('fetches a single page and maps to the trimmed Area shape', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(jsonResponse([rawArea()], { 'X-Total-Pages': '1' }));
		vi.stubGlobal('fetch', fetchMock);

		const areas = await listAllAreas(config);

		expect(areas).toEqual([
			{
				id: 1,
				name: 'Test Area',
				enabled: true,
				enable_pokemon: true,
				enable_forts: true,
				enable_quests: true,
				enable_rare_pokemon: false,
				geofence: SAMPLE_POLYGON,
				pokemon_mode: { workers: 4, route: [{ lat: 1, lon: 2 }] },
				fort_mode: { workers: 2, route: [] },
				quest_mode: { workers: 1, route: [] },
				rare_pokemon_mode: { workers: 0, route: [] }
			}
		]);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url] = fetchMock.mock.calls[0];
		expect(url).toBe('http://dragonite:7272/v2/areas/?page=0&per_page=1000');
	});

	it('pages through multiple pages and concatenates the results', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				jsonResponse([rawArea({ id: 1, name: 'Area One' })], { 'X-Total-Pages': '2' })
			)
			.mockResolvedValueOnce(
				jsonResponse([rawArea({ id: 2, name: 'Area Two' })], { 'X-Total-Pages': '2' })
			);
		vi.stubGlobal('fetch', fetchMock);

		const areas = await listAllAreas(config);

		expect(areas.map((a) => a.id)).toEqual([1, 2]);
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(fetchMock.mock.calls[0][0]).toBe('http://dragonite:7272/v2/areas/?page=0&per_page=1000');
		expect(fetchMock.mock.calls[1][0]).toBe('http://dragonite:7272/v2/areas/?page=1&per_page=1000');
	});

	it('treats a missing X-Total-Pages header as a single page', async () => {
		const fetchMock = vi.fn().mockResolvedValue(jsonResponse([rawArea()], {}));
		vi.stubGlobal('fetch', fetchMock);

		const areas = await listAllAreas(config);

		expect(areas).toHaveLength(1);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('throws when Dragonite responds with a non-OK status', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
		await expect(listAllAreas(config)).rejects.toThrow('500');
	});

	it('normalizes a Feature-wrapped geofence to its bare geometry', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(
				jsonResponse(
					[rawArea({ geofence: { type: 'Feature', geometry: SAMPLE_POLYGON, properties: {} } })],
					{ 'X-Total-Pages': '1' }
				)
			);
		vi.stubGlobal('fetch', fetchMock);

		const areas = await listAllAreas(config);

		expect(areas[0].geofence).toEqual(SAMPLE_POLYGON);
	});

	it('passes through a MultiPolygon geofence unchanged', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(
				jsonResponse([rawArea({ geofence: SAMPLE_MULTIPOLYGON })], { 'X-Total-Pages': '1' })
			);
		vi.stubGlobal('fetch', fetchMock);

		const areas = await listAllAreas(config);

		expect(areas[0].geofence).toEqual(SAMPLE_MULTIPOLYGON);
	});

	it('maps a null geofence to null', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(jsonResponse([rawArea({ geofence: null })], { 'X-Total-Pages': '1' }));
		vi.stubGlobal('fetch', fetchMock);

		const areas = await listAllAreas(config);

		expect(areas[0].geofence).toBeNull();
	});

	it('maps a malformed geofence shape to null instead of throwing', async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			jsonResponse([rawArea({ geofence: { type: 'FeatureCollection', features: [] } })], {
				'X-Total-Pages': '1'
			})
		);
		vi.stubGlobal('fetch', fetchMock);

		const areas = await listAllAreas(config);

		expect(areas[0].geofence).toBeNull();
	});

	it('defaults a missing route to an empty array', async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			jsonResponse([rawArea({ rare_pokemon_mode: { workers: 3, permyriad: 0, extra: null } })], {
				'X-Total-Pages': '1'
			})
		);
		vi.stubGlobal('fetch', fetchMock);

		const areas = await listAllAreas(config);

		expect(areas[0].rare_pokemon_mode).toEqual({ workers: 3, route: [] });
	});
});

describe('patchArea', () => {
	it('sends a PATCH with the given partial body and maps the response', async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => rawArea({ pokemon_mode: { workers: 9, route: [{ lat: 1, lon: 2 }] } })
		});
		vi.stubGlobal('fetch', fetchMock);

		const area = await patchArea(config, 1, { pokemon_mode: { workers: 9 } });

		expect(area.pokemon_mode.workers).toBe(9);
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe('http://dragonite:7272/v2/areas/1');
		expect(init.method).toBe('PATCH');
		expect(init.headers['Content-Type']).toBe('application/json');
		expect(JSON.parse(init.body)).toEqual({ pokemon_mode: { workers: 9 } });
	});

	it('throws when Dragonite responds with a non-OK status', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
		await expect(patchArea(config, 999, { enabled: true })).rejects.toThrow('404');
	});
});

describe('createArea', () => {
	it('POSTs to /v2/areas/ with the expected body and maps the response', async () => {
		const responseBody = {
			id: 99,
			name: 'New Area',
			enabled: true,
			enable_pokemon: true,
			enable_forts: true,
			enable_quests: true,
			enable_rare_pokemon: true,
			geofence: SAMPLE_POLYGON,
			pokemon_mode: { workers: 2, route: [] },
			fort_mode: { workers: 1, route: [] },
			quest_mode: { workers: 1, route: [] },
			rare_pokemon_mode: { workers: 0, route: [] }
		};
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(responseBody)
		});
		vi.stubGlobal('fetch', fetchMock);

		const result = await createArea(config, {
			name: 'New Area',
			enabled: true,
			geofence: SAMPLE_POLYGON,
			pokemonWorkers: 2,
			fortWorkers: 1,
			questWorkers: 1,
			rareWorkers: 0
		});

		expect(fetchMock).toHaveBeenCalledWith(
			`${config.baseUrl}/v2/areas/`,
			expect.objectContaining({ method: 'POST' })
		);
		const body = JSON.parse(fetchMock.mock.calls[0][1].body);
		expect(body).toEqual({
			name: 'New Area',
			enabled: true,
			geofence: SAMPLE_POLYGON,
			enable_pokemon: true,
			enable_forts: true,
			enable_quests: true,
			enable_rare_pokemon: true,
			pokemon_mode: { workers: 2 },
			fort_mode: { workers: 1 },
			quest_mode: { workers: 1, hours: [1, 10] },
			rare_pokemon_mode: { workers: 0 }
		});
		expect(result.id).toBe(99);
		expect(result.name).toBe('New Area');

		vi.unstubAllGlobals();
	});

	it('throws when Dragonite returns a non-2xx status', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400 }));

		await expect(
			createArea(config, {
				name: 'Bad Area',
				enabled: true,
				geofence: SAMPLE_POLYGON,
				pokemonWorkers: 0,
				fortWorkers: 0,
				questWorkers: 0,
				rareWorkers: 0
			})
		).rejects.toThrow('Dragonite area create failed: 400');

		vi.unstubAllGlobals();
	});
});

describe('createArea questHours', () => {
	it('sends the provided quest hours instead of the default', async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: () =>
				Promise.resolve({
					id: 1,
					name: 'A',
					enabled: true,
					geofence: SAMPLE_POLYGON,
					pokemon_mode: { workers: 0, route: [] },
					fort_mode: { workers: 0, route: [] },
					quest_mode: { workers: 1, route: [] },
					rare_pokemon_mode: { workers: 0, route: [] }
				})
		});
		vi.stubGlobal('fetch', fetchMock);

		await createArea(config, {
			name: 'A',
			enabled: true,
			geofence: SAMPLE_POLYGON,
			pokemonWorkers: 0,
			fortWorkers: 0,
			questWorkers: 1,
			rareWorkers: 0,
			questHours: [6, 20]
		});

		const body = JSON.parse(fetchMock.mock.calls[0][1].body);
		expect(body.quest_mode).toEqual({ workers: 1, hours: [6, 20] });

		vi.unstubAllGlobals();
	});
});

describe('parseQuestHours', () => {
	it('parses one or more check hours, sorted and without duplicates', () => {
		expect(parseQuestHours('6, 20')).toEqual([6, 20]);
		expect(parseQuestHours('0,23')).toEqual([0, 23]);
		expect(parseQuestHours('6')).toEqual([6]);
		expect(parseQuestHours('22, 6,14,6')).toEqual([6, 14, 22]);
	});

	it('falls back to the default when unset or blank', () => {
		expect(parseQuestHours(undefined)).toEqual(DEFAULT_QUEST_HOURS);
		expect(parseQuestHours('  ')).toEqual(DEFAULT_QUEST_HOURS);
	});

	it('falls back to the default when malformed or out of range', () => {
		expect(parseQuestHours('a,b')).toEqual(DEFAULT_QUEST_HOURS);
		expect(parseQuestHours('6,,20')).toEqual(DEFAULT_QUEST_HOURS);
		expect(parseQuestHours('6,24')).toEqual(DEFAULT_QUEST_HOURS);
		expect(parseQuestHours('-1,5')).toEqual(DEFAULT_QUEST_HOURS);
	});
});
