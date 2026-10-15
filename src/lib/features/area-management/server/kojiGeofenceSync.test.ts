import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	checkKojiGeofenceName,
	findKojiGeofence,
	kojiLogin,
	normalizeGeometryForKoji,
	syncGeofenceToKoji
} from './kojiGeofenceSync';
import type { GeoJsonMultiPolygon, GeoJsonPolygon } from '../types';

const CONFIG = { baseUrl: 'http://koji:8080/', secret: 'shh' };

const RING: [number, number][] = [
	[-40.5, 40.1],
	[-40.4, 40.1],
	[-40.4, 40.2],
	[-40.5, 40.1]
];
const POLYGON: GeoJsonPolygon = { type: 'Polygon', coordinates: [RING] };

const HILLCREST = {
	id: 167,
	name: 'Hillcrest',
	mode: 'unset',
	parent: 215,
	projects: [12, 8],
	properties: [{ name: 'displayInMatches', value: true, property_id: 3 }],
	geometry: POLYGON
};

function response(status: number, body: unknown, setCookie: string[] = []) {
	const text = typeof body === 'string' ? body : JSON.stringify(body);
	return {
		ok: status >= 200 && status < 300,
		status,
		text: async () => text,
		headers: { getSetCookie: () => setCookie }
	};
}

/**
 * A fake Kōji: login sets a session cookie, the admin GET returns `record`
 * (or Kōji's "Does not exist" 500), and PATCH answers `patchStatus`.
 */
function fakeKoji(opts: { record?: unknown; patchStatus?: number; loginStatus?: number } = {}) {
	const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
		const method = init?.method ?? 'GET';
		if (url.endsWith('/config/login')) {
			return response(opts.loginStatus ?? 200, '', ['id=session123; Path=/; HttpOnly']);
		}
		if (method === 'GET') {
			return opts.record
				? response(200, { data: opts.record })
				: response(500, '[GEOFENCE]: Does not exist');
		}
		return response(opts.patchStatus ?? 200, { data: {} });
	});
	vi.stubGlobal('fetch', fetchMock);
	return fetchMock;
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('kojiLogin', () => {
	it('posts KOJI_SECRET as the password and returns the session cookie', async () => {
		const fetchMock = fakeKoji();
		await expect(kojiLogin(CONFIG)).resolves.toBe('id=session123');
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe('http://koji:8080/config/login');
		expect(JSON.parse(init!.body as string)).toEqual({ password: 'shh' });
	});

	it('uses an empty password when no secret is configured', async () => {
		const fetchMock = fakeKoji();
		await kojiLogin({ baseUrl: 'http://koji:8080' });
		expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string)).toEqual({ password: '' });
	});

	it('throws on a rejected login', async () => {
		fakeKoji({ loginStatus: 401 });
		await expect(kojiLogin(CONFIG)).rejects.toThrow('Kōji login failed: 401');
	});
});

describe('findKojiGeofence', () => {
	it('returns the record, sending the session cookie and URL-encoding the name', async () => {
		const fetchMock = fakeKoji({ record: HILLCREST });
		const found = await findKojiGeofence(CONFIG, 'id=session123', 'Old Town');
		expect(found).toEqual({
			id: 167,
			name: 'Hillcrest',
			mode: 'unset',
			parent: 215,
			projects: [12, 8]
		});
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe('http://koji:8080/internal/admin/geofence/Old%20Town/');
		expect((init!.headers as Record<string, string>).Cookie).toBe('id=session123');
	});

	it('returns null for Kōji\'s "Does not exist" 500', async () => {
		fakeKoji();
		await expect(findKojiGeofence(CONFIG, 'c', 'Nope')).resolves.toBeNull();
	});

	it('throws on any other error', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(502, 'Bad Gateway')));
		await expect(findKojiGeofence(CONFIG, 'c', 'X')).rejects.toThrow(
			'Kōji geofence lookup failed: 502'
		);
	});
});

describe('normalizeGeometryForKoji', () => {
	it('unwraps a single-part MultiPolygon to a Polygon', () => {
		const multi: GeoJsonMultiPolygon = { type: 'MultiPolygon', coordinates: [[RING]] };
		expect(normalizeGeometryForKoji(multi)).toEqual(POLYGON);
	});

	it('leaves Polygons and multi-part MultiPolygons alone', () => {
		const multi: GeoJsonMultiPolygon = { type: 'MultiPolygon', coordinates: [[RING], [RING]] };
		expect(normalizeGeometryForKoji(POLYGON)).toBe(POLYGON);
		expect(normalizeGeometryForKoji(multi)).toBe(multi);
	});
});

describe('syncGeofenceToKoji', () => {
	it('PATCHes only name/geometry/parent/mode, echoing parent and mode back unchanged', async () => {
		const fetchMock = fakeKoji({ record: HILLCREST });
		const newShape: GeoJsonPolygon = { type: 'Polygon', coordinates: [[...RING].reverse()] };

		await expect(syncGeofenceToKoji(CONFIG, 'Hillcrest', newShape)).resolves.toEqual({
			status: 'synced',
			kojiId: 167
		});

		const patch = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH')!;
		expect(patch[0]).toBe('http://koji:8080/internal/admin/geofence/167/');
		const body = JSON.parse(patch[1]!.body as string);
		// No `projects`/`properties` keys: Kōji only rewrites those when present.
		expect(body).toEqual({ name: 'Hillcrest', geometry: newShape, parent: 215, mode: 'unset' });
		expect((patch[1]!.headers as Record<string, string>).Cookie).toBe('id=session123');
	});

	it('preserves a null parent as null (never invents one)', async () => {
		const fetchMock = fakeKoji({ record: { ...HILLCREST, parent: null } });
		await syncGeofenceToKoji(CONFIG, 'Hillcrest', POLYGON);
		const patch = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH')!;
		expect(JSON.parse(patch[1]!.body as string).parent).toBeNull();
	});

	it('skips, without writing, when no Kōji geofence has that name', async () => {
		const fetchMock = fakeKoji();
		const result = await syncGeofenceToKoji(CONFIG, 'Nope', POLYGON);
		expect(result).toEqual({ status: 'skipped', reason: 'No Kōji geofence is named "Nope".' });
		expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false);
	});

	it('skips, without writing, on a case-insensitive-only match', async () => {
		const fetchMock = fakeKoji({ record: HILLCREST });
		const result = await syncGeofenceToKoji(CONFIG, 'hillcrest', POLYGON);
		expect(result.status).toBe('skipped');
		expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false);
	});

	it('reports a failed PATCH', async () => {
		fakeKoji({ record: HILLCREST, patchStatus: 500 });
		await expect(syncGeofenceToKoji(CONFIG, 'Hillcrest', POLYGON)).resolves.toEqual({
			status: 'failed',
			reason: 'Kōji update failed: 500'
		});
	});

	it('reports (never throws) a login/network error', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
		await expect(syncGeofenceToKoji(CONFIG, 'Hillcrest', POLYGON)).resolves.toEqual({
			status: 'failed',
			reason: 'ECONNREFUSED'
		});
	});
});

describe('checkKojiGeofenceName', () => {
	it('is free when Kōji has no such geofence', async () => {
		fakeKoji();
		await expect(checkKojiGeofenceName(CONFIG, 'Brand New')).resolves.toBe('free');
	});

	it('is taken on any match, including case-insensitive ones', async () => {
		fakeKoji({ record: HILLCREST });
		await expect(checkKojiGeofenceName(CONFIG, 'HILLCREST')).resolves.toBe('taken');
	});

	it('is unverifiable for an all-digit name, without calling Kōji', async () => {
		const fetchMock = fakeKoji();
		await expect(checkKojiGeofenceName(CONFIG, '123')).resolves.toBe('unverifiable');
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
