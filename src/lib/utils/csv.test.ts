import { describe, expect, it } from 'vitest';
import { parseCsvIds } from './csv';

describe('parseCsvIds', () => {
	it('returns an empty array for undefined', () => {
		expect(parseCsvIds(undefined)).toEqual([]);
	});

	it('returns an empty array for an empty string', () => {
		expect(parseCsvIds('')).toEqual([]);
	});

	it('splits, trims, and drops empty entries', () => {
		expect(parseCsvIds(' 123, 456 ,789,,')).toEqual(['123', '456', '789']);
	});

	it('returns a single-element array for a single id', () => {
		expect(parseCsvIds('123456789012345678')).toEqual(['123456789012345678']);
	});
});
