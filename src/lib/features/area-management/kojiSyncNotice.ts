import type { KojiSyncResult } from './types';

/**
 * The message to show an admin after a geofence save/restore that asked to
 * also update Kōji, or null when there's nothing to report (no sync was
 * requested, or it succeeded). Takes the action's raw result data since the
 * client receives it untyped.
 */
export function kojiSyncNotice(data: unknown): string | null {
	const koji = (data as { koji?: KojiSyncResult } | null | undefined)?.koji;
	if (!koji || koji.status === 'synced') return null;
	const prefix =
		koji.status === 'skipped'
			? 'Geofence saved, but Kōji was not updated'
			: 'Geofence saved, but updating Kōji failed';
	return `${prefix}: ${koji.reason}`;
}
