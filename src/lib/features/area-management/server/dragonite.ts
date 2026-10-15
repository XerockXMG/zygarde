import type {
	Area,
	AreaMode,
	GeoJsonGeometry,
	GeoJsonPolygon,
	GeoJsonMultiPolygon
} from '../types';

export interface DragoniteConfig {
	baseUrl: string;
}

interface RawLatLon {
	lat: number;
	lon: number;
}

interface RawAreaMode {
	workers: number;
	route?: RawLatLon[] | null;
}

type RawGeoJsonGeometry = GeoJsonPolygon | GeoJsonMultiPolygon;
type RawGeofence =
	RawGeoJsonGeometry | { type: 'Feature'; geometry: RawGeoJsonGeometry } | null | undefined;

interface RawArea {
	id: number;
	name: string;
	enabled: boolean;
	enable_pokemon: boolean;
	enable_forts: boolean;
	enable_quests: boolean;
	enable_rare_pokemon: boolean;
	geofence?: RawGeofence;
	pokemon_mode: RawAreaMode;
	fort_mode: RawAreaMode;
	quest_mode: RawAreaMode;
	rare_pokemon_mode: RawAreaMode;
}

function toAreaMode(raw: RawAreaMode): AreaMode {
	return {
		workers: raw.workers,
		route: (raw.route ?? []).map((p) => ({ lat: p.lat, lon: p.lon }))
	};
}

function toGeofence(raw: RawGeofence): GeoJsonGeometry | null {
	if (!raw) return null;
	const geometry = raw.type === 'Feature' ? raw.geometry : raw;
	if (!geometry || (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon')) return null;
	if (!Array.isArray(geometry.coordinates)) return null;
	return geometry;
}

function toArea(raw: RawArea): Area {
	return {
		id: raw.id,
		name: raw.name,
		enabled: raw.enabled,
		enable_pokemon: raw.enable_pokemon,
		enable_forts: raw.enable_forts,
		enable_quests: raw.enable_quests,
		enable_rare_pokemon: raw.enable_rare_pokemon,
		geofence: toGeofence(raw.geofence),
		pokemon_mode: toAreaMode(raw.pokemon_mode),
		fort_mode: toAreaMode(raw.fort_mode),
		quest_mode: toAreaMode(raw.quest_mode),
		rare_pokemon_mode: toAreaMode(raw.rare_pokemon_mode)
	};
}

const PER_PAGE = 1000;

export async function listAllAreas(config: DragoniteConfig): Promise<Area[]> {
	const areas: Area[] = [];
	let page = 0;
	let totalPages = 1;

	do {
		const res = await fetch(`${config.baseUrl}/v2/areas/?page=${page}&per_page=${PER_PAGE}`);
		if (!res.ok) throw new Error(`Dragonite area list failed: ${res.status}`);
		const totalPagesHeader = res.headers.get('X-Total-Pages');
		totalPages = totalPagesHeader ? parseInt(totalPagesHeader, 10) : 1;
		const raw = (await res.json()) as RawArea[] | null;
		for (const r of raw ?? []) areas.push(toArea(r));
		page += 1;
	} while (page < totalPages);

	return areas;
}

export async function patchArea(
	config: DragoniteConfig,
	areaId: number,
	patch: Record<string, unknown>
): Promise<Area> {
	const res = await fetch(`${config.baseUrl}/v2/areas/${areaId}`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(patch)
	});
	if (!res.ok) throw new Error(`Dragonite area patch failed: ${res.status}`);
	const raw = (await res.json()) as RawArea;
	return toArea(raw);
}

export interface CreateAreaParams {
	name: string;
	enabled: boolean;
	geofence: GeoJsonGeometry;
	pokemonWorkers: number;
	fortWorkers: number;
	questWorkers: number;
	rareWorkers: number;
	/** Hours Dragonite checks for quest changes; falls back to DEFAULT_QUEST_HOURS. */
	questHours?: number[];
}

/**
 * Quest hours for areas created here: the hours of the day (0-23) at which
 * Dragonite checks for quest changes, starting a quest scan if it finds any.
 * Not a time window: [1, 10] means a check at 1:00 and another at 10:00.
 */
export const DEFAULT_QUEST_HOURS = [1, 10];

/**
 * Parses the `DEFAULT_QUEST_HOURS` env var: one or more comma-separated hours
 * (0-23), returned sorted with duplicates removed. Unset or malformed values
 * fall back to DEFAULT_QUEST_HOURS.
 */
export function parseQuestHours(value: string | undefined): number[] {
	if (!value?.trim()) return DEFAULT_QUEST_HOURS;
	const parts = value.split(',').map((s) => s.trim());
	if (parts.some((p) => !/^\d{1,2}$/.test(p))) return DEFAULT_QUEST_HOURS;
	const hours = parts.map(Number);
	if (hours.some((h) => h > 23)) return DEFAULT_QUEST_HOURS;
	return [...new Set(hours)].sort((a, b) => a - b);
}

export async function createArea(config: DragoniteConfig, params: CreateAreaParams): Promise<Area> {
	const res = await fetch(`${config.baseUrl}/v2/areas/`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			name: params.name,
			enabled: params.enabled,
			geofence: params.geofence,
			enable_pokemon: true,
			enable_forts: true,
			enable_quests: true,
			enable_rare_pokemon: true,
			pokemon_mode: { workers: params.pokemonWorkers },
			fort_mode: { workers: params.fortWorkers },
			quest_mode: { workers: params.questWorkers, hours: params.questHours ?? DEFAULT_QUEST_HOURS },
			rare_pokemon_mode: { workers: params.rareWorkers }
		})
	});
	if (!res.ok) throw new Error(`Dragonite area create failed: ${res.status}`);
	const raw = (await res.json()) as RawArea;
	return toArea(raw);
}
