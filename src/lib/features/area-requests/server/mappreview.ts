import { env } from '$env/dynamic/private';
import { geoJsonToLatLngs } from '$lib/features/map/geometry';
import { logger } from '$lib/server/logger';
import type { GeoJsonGeometry } from '$lib/features/area-management/types';

const TILE_SIZE = 256;
// Staticmap tileserver output (Rampardos/SwiftTileserverCache) is always 500×250
const IMG_W = 500;
const IMG_H = 250;

function lngToGlobalX(lng: number, zoom: number): number {
	return ((lng + 180) / 360) * Math.pow(2, zoom) * TILE_SIZE;
}

function latToGlobalY(lat: number, zoom: number): number {
	const sinLat = Math.sin((lat * Math.PI) / 180);
	return (
		(0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * Math.pow(2, zoom) * TILE_SIZE
	);
}

/** Find the highest zoom where the padded bounding box fits within the image dimensions. */
export function pickZoom(minLat: number, maxLat: number, minLng: number, maxLng: number): number {
	const pad = 0.2;
	const latSpan = maxLat - minLat;
	const lngSpan = maxLng - minLng;
	const pMinLat = minLat - latSpan * pad;
	const pMaxLat = maxLat + latSpan * pad;
	const pMinLng = minLng - lngSpan * pad;
	const pMaxLng = maxLng + lngSpan * pad;

	for (let z = 16; z >= 2; z--) {
		const spanX = lngToGlobalX(pMaxLng, z) - lngToGlobalX(pMinLng, z);
		const spanY = latToGlobalY(pMinLat, z) - latToGlobalY(pMaxLat, z);
		if (spanX <= IMG_W && spanY <= IMG_H) return z;
	}
	return 2;
}

/**
 * Generates a map preview PNG for a geofence using a staticmap tileserver
 * (Rampardos recommended, or SwiftTileserverCache — not Poracle itself,
 * which doesn't render static maps; the /staticmap/poracle-area endpoint
 * name is just the API convention these tileservers implement) configured
 * via STATIC_PROVIDER_URL. Returns null (never throws) if unconfigured, the
 * geofence has too few points, or any network step fails.
 */
export async function generateMapPreview(
	geofence: GeoJsonGeometry,
	fillColor?: string | null,
	strokeColor?: string | null
): Promise<Buffer | null> {
	const baseUrl = env.STATIC_PROVIDER_URL;
	if (!baseUrl) {
		logger.warn('mappreview: STATIC_PROVIDER_URL not set, skipping map preview');
		return null;
	}

	try {
		const vertices = geoJsonToLatLngs(geofence).flat();
		if (vertices.length < 3) {
			logger.warn({ vertexCount: vertices.length }, 'mappreview: too few vertices');
			return null;
		}

		const lats = vertices.map(([lat]) => lat);
		const lngs = vertices.map(([, lng]) => lng);
		const minLat = Math.min(...lats);
		const maxLat = Math.max(...lats);
		const minLng = Math.min(...lngs);
		const maxLng = Math.max(...lngs);

		const centerLat = (minLat + maxLat) / 2;
		const centerLng = (minLng + maxLng) / 2;
		const zoom = pickZoom(minLat, maxLat, minLng, maxLng);

		const genRes = await fetch(
			`${baseUrl}/staticmap/poracle-area?pregenerate=true&regeneratable=true`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					nightTime: true,
					latitude: centerLat,
					longitude: centerLng,
					zoom,
					coords: vertices,
					fill_color: fillColor ?? null,
					stroke_color: strokeColor ?? null
				}),
				signal: AbortSignal.timeout(10000)
			}
		);
		if (!genRes.ok) {
			logger.warn({ status: genRes.status }, 'mappreview: staticmap pregenerate failed');
			return null;
		}
		const key = (await genRes.text()).trim();

		const imgRes = await fetch(`${baseUrl}/staticmap/pregenerated/${key}`, {
			signal: AbortSignal.timeout(10000)
		});
		if (!imgRes.ok) {
			logger.warn({ status: imgRes.status, key }, 'mappreview: staticmap fetch failed');
			return null;
		}

		return Buffer.from(await imgRes.arrayBuffer());
	} catch (e) {
		logger.error(
			{ err: e instanceof Error ? e.message : String(e) },
			'mappreview: generation error'
		);
		return null;
	}
}
