export interface LatLon {
	lat: number;
	lon: number;
}

export interface AreaMode {
	workers: number;
	route: LatLon[];
}

export interface GeoJsonPolygon {
	type: 'Polygon';
	coordinates: [number, number][][];
}

export interface GeoJsonMultiPolygon {
	type: 'MultiPolygon';
	coordinates: [number, number][][][];
}

export type GeoJsonGeometry = GeoJsonPolygon | GeoJsonMultiPolygon;

export interface Area {
	id: number;
	name: string;
	enabled: boolean;
	enable_pokemon: boolean;
	enable_forts: boolean;
	enable_quests: boolean;
	enable_rare_pokemon: boolean;
	geofence: GeoJsonGeometry | null;
	pokemon_mode: AreaMode;
	fort_mode: AreaMode;
	quest_mode: AreaMode;
	rare_pokemon_mode: AreaMode;
}

export type ToggleField =
	'enabled' | 'enable_pokemon' | 'enable_forts' | 'enable_quests' | 'enable_rare_pokemon';

export interface Permissions {
	canEdit: boolean;
	canSeeOfflineAreas: boolean;
	canSeePokemonRoutes: boolean;
	canSeeFortRoutes: boolean;
	canSeeQuestRoutes: boolean;
	canSeeSpawnpoints: boolean;
	/** Admin with KOJI_URL configured — shows the "Also update in Kōji" option on geofence saves. */
	canSyncKoji: boolean;
}

/** Outcome of pushing a geofence shape change to Kōji (see server/kojiGeofenceSync.ts). */
export type KojiSyncResult =
	| { status: 'synced'; kojiId: number }
	| { status: 'skipped'; reason: string }
	| { status: 'failed'; reason: string };

export type LayerFilter = 'ALL' | 'ENABLED' | 'DISABLED';

export type SortMode = 'AZ' | 'VOTES';

export type WorkerModeKey = 'pokemon_mode' | 'fort_mode' | 'quest_mode' | 'rare_pokemon_mode';

export type TokenFundingFilter = 'ANY' | 'UNDER' | 'MEETING' | 'ABOVE';

export type RouteTypeFilter = 'spawnpoint' | 'bootstrap';

export type RouteFreshnessFilter =
	'ANY' | 'WITHIN_7D' | 'WITHIN_30D' | 'WITHIN_90D' | 'STALE_90D' | 'NEVER';

/** Extra, combinable list-filter criteria beyond the ALL/Enabled/Disabled tabs. */
export interface CriteriaFilters {
	tokenFunding: TokenFundingFilter;
	workerMode: WorkerModeKey;
	workerMin: number | null;
	workerMax: number | null;
	routeType: RouteTypeFilter;
	routeFreshness: RouteFreshnessFilter;
}

export const DEFAULT_CRITERIA_FILTERS: CriteriaFilters = {
	tokenFunding: 'ANY',
	workerMode: 'pokemon_mode',
	workerMin: null,
	workerMax: null,
	routeType: 'spawnpoint',
	routeFreshness: 'ANY'
};
