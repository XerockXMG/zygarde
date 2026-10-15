import { describe, expect, it, vi } from 'vitest';
import { relativeTime } from './time';

describe('relativeTime', () => {
	it('returns "just now" for less than a minute ago', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-01-01T00:00:30Z'));
		expect(relativeTime('2026-01-01T00:00:00Z')).toBe('just now');
		vi.useRealTimers();
	});

	it('returns minutes for under an hour', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-01-01T00:05:00Z'));
		expect(relativeTime('2026-01-01T00:00:00Z')).toBe('5m ago');
		vi.useRealTimers();
	});

	it('returns hours for under a day', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-01-01T03:00:00Z'));
		expect(relativeTime('2026-01-01T00:00:00Z')).toBe('3h ago');
		vi.useRealTimers();
	});

	it('returns days for under a week', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-01-03T00:00:00Z'));
		expect(relativeTime('2026-01-01T00:00:00Z')).toBe('2d ago');
		vi.useRealTimers();
	});

	it('returns weeks for under 5 weeks', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-01-15T00:00:00Z'));
		expect(relativeTime('2026-01-01T00:00:00Z')).toBe('2w ago');
		vi.useRealTimers();
	});

	it('returns months beyond 5 weeks', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-04-01T00:00:00Z'));
		expect(relativeTime('2026-01-01T00:00:00Z')).toBe('3mo ago');
		vi.useRealTimers();
	});

	it('rolls over to hours at exactly 60 minutes', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-01-01T01:00:00Z'));
		expect(relativeTime('2026-01-01T00:00:00Z')).toBe('1h ago');
		vi.useRealTimers();
	});

	it('rolls over to days at exactly 24 hours', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-01-02T00:00:00Z'));
		expect(relativeTime('2026-01-01T00:00:00Z')).toBe('1d ago');
		vi.useRealTimers();
	});

	it('rolls over to weeks at exactly 7 days', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-01-08T00:00:00Z'));
		expect(relativeTime('2026-01-01T00:00:00Z')).toBe('1w ago');
		vi.useRealTimers();
	});

	it('rolls over to months at exactly 5 weeks', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-02-05T00:00:00Z'));
		expect(relativeTime('2026-01-01T00:00:00Z')).toBe('1mo ago');
		vi.useRealTimers();
	});

	it('accepts an epoch-milliseconds number, same as the equivalent ISO string', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-01-01T00:05:00Z'));
		const epochMs = new Date('2026-01-01T00:00:00Z').getTime();
		expect(relativeTime(epochMs)).toBe('5m ago');
		vi.useRealTimers();
	});

	it('returns a safe fallback for an unparseable date', () => {
		expect(relativeTime('not-a-date')).toBe('unknown');
	});
});
