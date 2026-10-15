import { describe, expect, it } from 'vitest';
import { areaIdFromSearch, areaLink } from './deepLink';

describe('areaLink', () => {
	it('builds the home-page focus link', () => {
		expect(areaLink(42)).toBe('/?area=42');
	});
});

describe('areaIdFromSearch', () => {
	it('reads a positive integer id', () => {
		expect(areaIdFromSearch(new URLSearchParams('area=42'))).toBe(42);
	});

	it('ignores missing, empty, zero, negative, fractional and non-numeric values', () => {
		for (const q of ['', 'area=', 'area=0', 'area=-3', 'area=1.5', 'area=abc', 'area=4x']) {
			expect(areaIdFromSearch(new URLSearchParams(q))).toBeNull();
		}
	});
});
