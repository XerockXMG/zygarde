import { describe, expect, it } from 'vitest';
import { parseStartView, DEFAULT_START_VIEW } from './startView';

describe('parseStartView', () => {
	it('uses the defaults when nothing is set', () => {
		expect(parseStartView(undefined, undefined, undefined)).toEqual(DEFAULT_START_VIEW);
		expect(parseStartView('', ' ', '')).toEqual(DEFAULT_START_VIEW);
	});

	it('parses valid values, including negatives and decimals', () => {
		expect(parseStartView('48.85', '2.35', '9')).toEqual({ lat: 48.85, lon: 2.35, zoom: 9 });
		expect(parseStartView(' -33.9 ', '151.2', '10.5')).toEqual({
			lat: -33.9,
			lon: 151.2,
			zoom: 10.5
		});
	});

	it('falls back per variable when one is out of range or malformed', () => {
		expect(parseStartView('91', '2.35', '9')).toEqual({ lat: 20, lon: 2.35, zoom: 9 });
		expect(parseStartView('41', '200', '9')).toEqual({ lat: 41, lon: 0, zoom: 9 });
		expect(parseStartView('48', '2', '30')).toEqual({ lat: 48, lon: 2, zoom: 2 });
		expect(parseStartView('north', '2', 'abc')).toEqual({ lat: 20, lon: 2, zoom: 2 });
	});

	it('accepts the range boundaries', () => {
		expect(parseStartView('-90', '180', '0')).toEqual({ lat: -90, lon: 180, zoom: 0 });
	});
});
