import { env } from '$env/dynamic/private';
import { logger } from '$lib/server/logger';
import { DEFAULT_TEMP_AREA_TIMEZONE, resolveTimeZone, todayInZone } from '../dates';

let warned = false;

/** Today's YYYY-MM-DD in the configured TEMP_AREA_TIMEZONE (falls back to the default). */
export function tempAreaToday(now: Date = new Date()): string {
	const configured = env.TEMP_AREA_TIMEZONE;
	const zone = resolveTimeZone(configured);
	if (configured && zone === DEFAULT_TEMP_AREA_TIMEZONE && configured !== zone && !warned) {
		warned = true;
		logger.warn(
			{ configured, fallback: zone },
			'TEMP_AREA_TIMEZONE is not a valid IANA zone; using the default'
		);
	}
	return todayInZone(zone, now);
}
