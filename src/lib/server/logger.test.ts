import { describe, expect, it } from 'vitest';
import { createLogger } from './logger';

describe('createLogger', () => {
	it('creates a pino logger at the given level', () => {
		const logger = createLogger('debug');
		expect(logger.level).toBe('debug');
	});

	it('defaults to info when constructed with "info"', () => {
		const logger = createLogger('info');
		expect(logger.level).toBe('info');
	});
});
