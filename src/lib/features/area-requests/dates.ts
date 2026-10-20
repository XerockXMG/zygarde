// Pure date helpers for temporary areas. Shared by server and client: no $env or server imports.
// Dates are YYYY-MM-DD strings everywhere.

export const DEFAULT_TEMP_AREA_TIMEZONE = 'America/New_York';

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

export function resolveTimeZone(value: string | undefined): string {
	if (!value) return DEFAULT_TEMP_AREA_TIMEZONE;
	try {
		new Intl.DateTimeFormat('en-CA', { timeZone: value });
		return value;
	} catch {
		return DEFAULT_TEMP_AREA_TIMEZONE;
	}
}

export function todayInZone(timeZone: string, now: Date = new Date()): string {
	return new Intl.DateTimeFormat('en-CA', {
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(now);
}

export function isYmd(value: unknown): value is string {
	if (typeof value !== 'string' || !YMD_RE.test(value)) return false;
	const d = new Date(`${value}T00:00:00Z`);
	return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function addDays(ymd: string, days: number): string {
	const d = new Date(`${ymd}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + days);
	return d.toISOString().slice(0, 10);
}

export function validateTemporaryDates(
	startsOn: string,
	expiresOn: string,
	today: string,
	opts: { startLocked?: boolean } = {}
): string | null {
	if (!isYmd(startsOn) || !isYmd(expiresOn)) return 'Dates must be valid (YYYY-MM-DD).';
	if (!opts.startLocked && startsOn < today) return 'Start date cannot be in the past.';
	if (expiresOn <= startsOn) return 'End date must be after the start date.';
	if (expiresOn <= today) return 'End date must be after today.';
	return null;
}

export function startDueOn(startsOn: string): string {
	return addDays(startsOn, -1);
}

export function isStartDue(startsOn: string, today: string): boolean {
	return startDueOn(startsOn) <= today;
}
