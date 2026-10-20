import { kojiPost, type KojiPost } from './kojiHttp';
import { buildKojiRequest, extractRouteCoords } from './koji';
import type { GeoJsonGeometry } from '../types';

export interface BootstrapRouteParams {
	baseUrl: string;
	secret?: string;
	geometry: GeoJsonGeometry;
	timeoutMs: number;
}

/**
 * Ask Kōji for a bootstrap route over a geofence, with the same parameters as
 * the main map's Bootstrap button. Throws a descriptive Error on any failure
 * (unreachable, timeout, non-2xx, bad JSON, no points); callers decide whether
 * that is fatal. `post` is injectable for tests.
 */
export async function generateBootstrapRoute(
	p: BootstrapRouteParams,
	post: KojiPost = kojiPost
): Promise<{ lat: number; lon: number }[]> {
	const { endpointPath, body } = buildKojiRequest(p.geometry, {
		routeType: 'bootstrap',
		radius: 70,
		minPoints: 1,
		maxClusters: 0,
		clusterMode: 'Balanced',
		calculationMode: 'Radius',
		tth: 'All'
	});

	const headers: Record<string, string> = {};
	if (p.secret) headers['Authorization'] = `Bearer ${p.secret}`;

	const res = await post(
		`${p.baseUrl.replace(/\/$/, '')}${endpointPath}`,
		JSON.stringify(body),
		headers,
		{ timeoutMs: p.timeoutMs }
	);
	if (res.status < 200 || res.status >= 300) throw new Error(`Kōji returned ${res.status}`);

	let parsed: { data?: { features?: unknown } };
	try {
		parsed = JSON.parse(res.body);
	} catch {
		throw new Error('Kōji response was not valid JSON');
	}

	const coords = extractRouteCoords(parsed?.data?.features);
	if (coords.length === 0) throw new Error('Kōji returned no route points');
	return coords.map(([lat, lon]) => ({ lat, lon }));
}
