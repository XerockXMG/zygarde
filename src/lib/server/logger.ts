import pino from 'pino';

export function createLogger(level: string) {
	return pino({ level });
}

export const logger = createLogger(process.env.LOG_LEVEL || 'info');
