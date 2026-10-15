import type {
	Area,
	Permissions,
	GeoJsonGeometry,
	GeoJsonPolygon,
	GeoJsonMultiPolygon
} from '$lib/features/area-management/types';

export type { GeoJsonGeometry, GeoJsonPolygon, GeoJsonMultiPolygon };

/** Leaflet-style [lat, lng] tuple. */
export type LatLngTuple = [number, number];

/**
 * Narrow, explicit bundle of the page data the map store needs to render.
 * Not the whole page-data blob — just what MapPanel already receives as
 * props, assembled once so store methods don't take six separate params.
 */
export interface MapData {
	areas: Area[];
	permissions: Permissions;
	loggedIn: boolean;
}
