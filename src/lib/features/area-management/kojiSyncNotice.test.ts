import { describe, expect, it } from 'vitest';
import { kojiSyncNotice } from './kojiSyncNotice';

describe('kojiSyncNotice', () => {
	it('is null when no sync was requested or it succeeded', () => {
		expect(kojiSyncNotice(undefined)).toBeNull();
		expect(kojiSyncNotice({ success: true })).toBeNull();
		expect(kojiSyncNotice({ koji: { status: 'synced', kojiId: 1 } })).toBeNull();
	});

	it('explains a skipped or failed sync', () => {
		expect(kojiSyncNotice({ koji: { status: 'skipped', reason: 'No match.' } })).toBe(
			'Geofence saved, but Kōji was not updated: No match.'
		);
		expect(kojiSyncNotice({ koji: { status: 'failed', reason: 'boom' } })).toBe(
			'Geofence saved, but updating Kōji failed: boom'
		);
	});
});
