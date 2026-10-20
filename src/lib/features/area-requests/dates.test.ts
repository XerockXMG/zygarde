import { describe, expect, it } from 'vitest';
import {
	addDays,
	isStartDue,
	isYmd,
	resolveTimeZone,
	startDueOn,
	todayInZone,
	validateTemporaryDates
} from './dates';

describe('todayInZone', () => {
	it('uses the configured zone, not UTC', () => {
		expect(todayInZone('America/New_York', new Date('2026-10-21T02:00:00Z'))).toBe('2026-10-20');
	});
});

describe('addDays', () => {
	it('crosses month boundaries in both directions', () => {
		expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
		expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
	});
});

describe('isYmd', () => {
	it('accepts only real calendar dates in YYYY-MM-DD form', () => {
		expect(isYmd('2026-02-30')).toBe(false);
		expect(isYmd('2026-10-20')).toBe(true);
		expect(isYmd(20261020)).toBe(false);
	});
});

describe('resolveTimeZone', () => {
	it('falls back to the default for invalid or missing zones', () => {
		expect(resolveTimeZone('Not/AZone')).toBe('America/New_York');
		expect(resolveTimeZone('America/Chicago')).toBe('America/Chicago');
		expect(resolveTimeZone(undefined)).toBe('America/New_York');
	});
});

describe('validateTemporaryDates', () => {
	it('rejects a start in the past', () => {
		expect(validateTemporaryDates('2026-10-19', '2026-10-25', '2026-10-20')).not.toBeNull();
	});
	it('rejects an end that is not after the start', () => {
		expect(validateTemporaryDates('2026-10-20', '2026-10-20', '2026-10-20')).not.toBeNull();
	});
	it('accepts a valid range', () => {
		expect(validateTemporaryDates('2026-10-20', '2026-10-21', '2026-10-20')).toBeNull();
	});
	it('rejects malformed dates', () => {
		expect(validateTemporaryDates('bad', '2026-10-21', '2026-10-20')).not.toBeNull();
	});
	it('skips the start rule when startLocked but still requires end after today', () => {
		const opts = { startLocked: true };
		expect(validateTemporaryDates('2026-10-01', '2026-10-21', '2026-10-20', opts)).toBeNull();
		expect(validateTemporaryDates('2026-10-01', '2026-10-20', '2026-10-20', opts)).not.toBeNull();
	});
});

describe('start due', () => {
	it('is due the day before the start', () => {
		expect(startDueOn('2026-10-21')).toBe('2026-10-20');
		expect(isStartDue('2026-10-21', '2026-10-20')).toBe(true);
		expect(isStartDue('2026-10-22', '2026-10-20')).toBe(false);
	});
});
