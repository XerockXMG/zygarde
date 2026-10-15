import type { GeoJsonGeometry, KojiSyncResult } from '../types';
import type { KojiConfig } from './koji';

/**
 * Pushes a geofence *shape* change to an existing Kōji geofence without
 * disturbing anything else on it.
 *
 * Why not `koji.ts`'s `saveGeofence` (`POST /api/v1/geofence/save-koji`)?
 * That endpoint rebuilds the row from the payload alone: it nulls `parent`
 * unless `__parent` is sent, resets `mode` to `unset` unless `__mode` is
 * sent, and deletes every custom property not in the payload — and resending
 * properties through it re-infers each one's category from its value, so a
 * round-trip isn't lossless either. A nulled parent is what drops fences out
 * of Poracle's grouping.
 *
 * Instead this uses Kōji's admin API, the same one its own admin panel uses:
 * `GET /internal/admin/geofence/{name}/` to read the current row, then
 * `PATCH /internal/admin/geofence/{id}/` with only `name`, `geometry`,
 * `parent`, and `mode` (the latter two echoed back unchanged). Kōji's
 * `geofence::Query::upsert` only rewrites projects/properties when those keys
 * are present, so omitting them leaves project mappings and custom properties
 * untouched. The admin API authenticates with a session cookie from
 * `POST /config/login` (password = `KOJI_SECRET`), not the public API's
 * Bearer header.
 */

/** The subset of Kōji's `get_one_json_with_related` geofence response used here. */
export interface KojiGeofenceRecord {
	id: number;
	name: string;
	mode: string | null;
	parent: number | null;
	projects: number[];
}

const REQUEST_TIMEOUT_MS = 15_000;

function baseUrlOf(config: KojiConfig): string {
	return config.baseUrl.replace(/\/+$/, '');
}

/** Logs into Kōji's admin API and returns the `Cookie` header value to send with later calls. */
export async function kojiLogin(config: KojiConfig): Promise<string> {
	const res = await fetch(`${baseUrlOf(config)}/config/login`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ password: config.secret ?? '' }),
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
	});
	if (!res.ok) throw new Error(`Kōji login failed: ${res.status}`);
	const cookie = res.headers
		.getSetCookie()
		.map((c) => c.split(';')[0])
		.join('; ');
	if (!cookie) throw new Error('Kōji login returned no session cookie');
	return cookie;
}

/**
 * Looks up a Kōji geofence by name, or null if none exists. Kōji's lookup is
 * case-insensitive (MySQL collation) and treats an all-digit name as an id,
 * so callers must compare the returned `name` themselves before trusting it.
 */
export async function findKojiGeofence(
	config: KojiConfig,
	cookie: string,
	name: string
): Promise<KojiGeofenceRecord | null> {
	const res = await fetch(
		`${baseUrlOf(config)}/internal/admin/geofence/${encodeURIComponent(name)}/`,
		{ headers: { Cookie: cookie }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }
	);
	const text = await res.text();
	// Kōji answers a missing geofence with a 500 whose body is "[GEOFENCE]: Does not exist".
	if (!res.ok) {
		if (text.includes('Does not exist')) return null;
		throw new Error(`Kōji geofence lookup failed: ${res.status}`);
	}
	const data = (JSON.parse(text) as { data?: Record<string, unknown> }).data;
	if (!data || typeof data.id !== 'number' || typeof data.name !== 'string') {
		throw new Error('Kōji geofence lookup returned an unexpected response');
	}
	return {
		id: data.id,
		name: data.name,
		mode: typeof data.mode === 'string' ? data.mode : null,
		parent: typeof data.parent === 'number' ? data.parent : null,
		projects: Array.isArray(data.projects) ? (data.projects as number[]) : []
	};
}

/**
 * A single-part MultiPolygon is sent as a plain Polygon: PoracleNG serves
 * MultiPolygon fences as `multipath`, which PoracleWeb's area map can't draw.
 */
export function normalizeGeometryForKoji(geometry: GeoJsonGeometry): GeoJsonGeometry {
	if (geometry.type === 'MultiPolygon' && geometry.coordinates.length === 1) {
		return { type: 'Polygon', coordinates: geometry.coordinates[0] };
	}
	return geometry;
}

function describeError(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}

/**
 * Updates the shape of the Kōji geofence named exactly `name`, preserving its
 * parent, mode, project mappings, and custom properties. Never creates a
 * geofence and never throws — a missing or differently-cased match is
 * reported as `skipped`, any Kōji/network error as `failed`.
 */
export async function syncGeofenceToKoji(
	config: KojiConfig,
	name: string,
	geometry: GeoJsonGeometry
): Promise<KojiSyncResult> {
	try {
		const cookie = await kojiLogin(config);
		const existing = await findKojiGeofence(config, cookie, name);
		if (!existing) {
			return { status: 'skipped', reason: `No Kōji geofence is named "${name}".` };
		}
		if (existing.name !== name) {
			return {
				status: 'skipped',
				reason: `Kōji's closest match is "${existing.name}", not exactly "${name}".`
			};
		}

		const res = await fetch(`${baseUrlOf(config)}/internal/admin/geofence/${existing.id}/`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json', Cookie: cookie },
			body: JSON.stringify({
				name: existing.name,
				geometry: normalizeGeometryForKoji(geometry),
				parent: existing.parent,
				mode: existing.mode
			}),
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
		});
		if (!res.ok) return { status: 'failed', reason: `Kōji update failed: ${res.status}` };
		return { status: 'synced', kojiId: existing.id };
	} catch (err) {
		return { status: 'failed', reason: describeError(err) };
	}
}

export type KojiNameCheck = 'free' | 'taken' | 'unverifiable';

/**
 * Whether creating a new Kōji geofence under `name` is safe — `save-koji`
 * upserts by name, so saving over an existing fence would wipe its parent,
 * mode, and properties. A case-insensitive match counts as taken (Kōji would
 * match it too). An all-digit name is `unverifiable` since Kōji's lookup
 * treats it as an id rather than a name.
 */
export async function checkKojiGeofenceName(
	config: KojiConfig,
	name: string
): Promise<KojiNameCheck> {
	if (/^\d+$/.test(name)) return 'unverifiable';
	const cookie = await kojiLogin(config);
	return (await findKojiGeofence(config, cookie, name)) ? 'taken' : 'free';
}
