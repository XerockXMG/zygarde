import type { Area } from '$lib/features/area-management/types';

/**
 * Only what the request-review map's background layer needs. Full `Area`
 * objects include pokemon/fort/quest route arrays (potentially thousands of
 * points each) that the map never uses — keep this narrow so the admin
 * requests page's data payload stays small.
 */
export type AreaMapSummary = Pick<Area, 'id' | 'name' | 'enabled' | 'geofence'>;
