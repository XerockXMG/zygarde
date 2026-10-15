import { describe, expect, it } from 'vitest';
import { errorMessage } from './errors';

describe('errorMessage', () => {
	it('returns the message of an Error instance', () => {
		expect(errorMessage(new Error('boom'))).toBe('boom');
	});

	it('stringifies non-Error values', () => {
		expect(errorMessage('plain string')).toBe('plain string');
		expect(errorMessage(42)).toBe('42');
		expect(errorMessage(null)).toBe('null');
	});
});
