/**
 * `/?area=<id>` opens the home page with that area selected and focused on
 * the map — used by links from elsewhere in the app (e.g. the admin
 * dashboard's "Enabled, no votes" list).
 */
export const AREA_PARAM = 'area';

/** Builds the home-page link that focuses `areaId`. */
export function areaLink(areaId: number): string {
	return `/?${AREA_PARAM}=${areaId}`;
}

/** The area id requested by the URL, or null when absent or not a positive integer. */
export function areaIdFromSearch(params: URLSearchParams): number | null {
	const raw = params.get(AREA_PARAM);
	if (!raw || !/^\d+$/.test(raw)) return null;
	const id = Number(raw);
	return Number.isSafeInteger(id) && id > 0 ? id : null;
}
