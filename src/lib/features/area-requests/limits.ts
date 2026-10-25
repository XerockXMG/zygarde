// Abuse limits for member-submitted area requests. Pure: shared by server and client.
import type { GeoJsonPolygon } from '$lib/features/area-management/types';

export const MAX_REQUEST_VERTICES = 2000;
export const MAX_REQUEST_NOTE_LENGTH = 2000;
export const MAX_PENDING_REQUESTS = 5;

/** An error message if the polygon is too large or has out-of-range coordinates, else null. */
export function requestGeofenceProblem(polygon: GeoJsonPolygon): string | null {
	const ring = polygon.coordinates[0];
	if (ring.length > MAX_REQUEST_VERTICES) {
		return `Geofence has too many points (max ${MAX_REQUEST_VERTICES}).`;
	}
	for (const [lon, lat] of ring) {
		if (Math.abs(lon) > 180 || Math.abs(lat) > 90) {
			return 'Geofence has coordinates outside the valid longitude/latitude range.';
		}
	}
	return null;
}
