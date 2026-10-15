import { describe, expect, it } from 'vitest';
import { resolveSpeedTier, computeScaledWorkers } from './tiers';

describe('resolveSpeedTier', () => {
	it('returns 100 at exactly 100% funded', () => {
		expect(resolveSpeedTier(100)).toBe(100);
	});

	it('returns 100 when over-funded', () => {
		expect(resolveSpeedTier(150)).toBe(100);
	});

	it('returns 75 for the 60-99% band', () => {
		expect(resolveSpeedTier(60)).toBe(75);
		expect(resolveSpeedTier(90)).toBe(75);
		expect(resolveSpeedTier(99.9)).toBe(75);
	});

	it('returns 50 for the 30-59% band', () => {
		expect(resolveSpeedTier(30)).toBe(50);
		expect(resolveSpeedTier(59)).toBe(50);
	});

	it('returns 25 for the 1-29% band', () => {
		expect(resolveSpeedTier(1)).toBe(25);
		expect(resolveSpeedTier(29)).toBe(25);
	});

	it('returns 10 at exactly 0% funded', () => {
		expect(resolveSpeedTier(0)).toBe(10);
	});
});

describe('computeScaledWorkers', () => {
	it('rounds to the nearest worker', () => {
		expect(computeScaledWorkers(10, 75)).toBe(8); // 7.5 -> 8
		expect(computeScaledWorkers(10, 25)).toBe(3); // 2.5 -> 3
	});

	it('never returns fewer than 1 worker', () => {
		expect(computeScaledWorkers(3, 10)).toBe(1); // 0.3 -> floored to 1, not 0
	});

	it('returns the full max at tier 100', () => {
		expect(computeScaledWorkers(42, 100)).toBe(42);
	});
});
