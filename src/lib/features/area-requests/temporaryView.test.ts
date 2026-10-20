import { describe, it, expect } from 'vitest';
import type { TemporaryArea } from './server/temporary';
import { temporaryState, sortTemporaryRows, type TemporaryState } from './temporaryView';

function row(over: Partial<TemporaryArea> = {}): TemporaryArea {
	return {
		areaId: 1,
		requestId: null,
		startsOn: '2026-11-01',
		expiresOn: '2026-11-10',
		discordId: '1',
		username: 'u',
		startedAt: '2026-11-01T00:00:00.000Z',
		notifiedAt: null,
		disabledAt: null,
		...over
	};
}

describe('temporaryState', () => {
	it('is deleted when the area no longer exists', () => {
		expect(temporaryState(row({ disabledAt: 'x' }), false)).toBe('deleted');
	});
	it('is shut-off when disabled', () => {
		expect(temporaryState(row({ disabledAt: 'x', notifiedAt: 'y' }), true)).toBe('shut-off');
	});
	it('is scheduled when not yet started', () => {
		expect(temporaryState(row({ startedAt: null }), true)).toBe('scheduled');
	});
	it('is warned when notified', () => {
		expect(temporaryState(row({ notifiedAt: 'y' }), true)).toBe('warned');
	});
	it('is active otherwise', () => {
		expect(temporaryState(row(), true)).toBe('active');
	});
});

describe('sortTemporaryRows', () => {
	it('orders active/warned by end, then scheduled by start, shut-off, deleted', () => {
		const mk = (id: number, state: TemporaryState, over: Partial<TemporaryArea> = {}) => ({
			row: row({ areaId: id, ...over }),
			state
		});
		const items = [
			mk(1, 'deleted'),
			mk(2, 'shut-off'),
			mk(3, 'scheduled', { startsOn: '2026-12-05' }),
			mk(4, 'warned', { expiresOn: '2026-11-05' }),
			mk(5, 'scheduled', { startsOn: '2026-12-01' }),
			mk(6, 'active', { expiresOn: '2026-11-20' }),
			mk(7, 'active', { expiresOn: '2026-11-02' })
		];
		expect(sortTemporaryRows(items).map((i) => i.row.areaId)).toEqual([7, 4, 6, 5, 3, 2, 1]);
		expect(items[0].row.areaId).toBe(1);
	});
});
