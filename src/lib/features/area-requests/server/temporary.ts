import type { GeoJsonGeometry } from '$lib/features/area-management/types';
import { addDays, isStartDue } from '../dates';

export interface QueryExecutor {
	execute<T = unknown>(sql: string, params?: unknown[]): Promise<[T, unknown]>;
}

export interface TemporaryArea {
	areaId: number;
	requestId: number | null;
	/** YYYY-MM-DD */
	startsOn: string;
	/** YYYY-MM-DD */
	expiresOn: string;
	discordId: string;
	username: string;
	startedAt: string | null;
	notifiedAt: string | null;
	disabledAt: string | null;
}

interface TemporaryAreaRow {
	area_id: number;
	request_id: number | null;
	starts_on: string;
	expires_on: string;
	discord_id: string;
	username: string;
	started_at: Date | string | null;
	notified_at: Date | string | null;
	disabled_at: Date | string | null;
}

const SELECT_COLUMNS = `area_id, request_id,
	DATE_FORMAT(starts_on, '%Y-%m-%d') AS starts_on,
	DATE_FORMAT(expires_on, '%Y-%m-%d') AS expires_on,
	discord_id, username, started_at, notified_at, disabled_at`;

function toIso(value: Date | string | null): string | null {
	if (value === null || value === undefined) return null;
	return value instanceof Date ? value.toISOString() : String(value);
}

function mapRow(r: TemporaryAreaRow): TemporaryArea {
	return {
		areaId: r.area_id,
		requestId: r.request_id,
		startsOn: r.starts_on,
		expiresOn: r.expires_on,
		discordId: r.discord_id,
		username: r.username,
		startedAt: toIso(r.started_at),
		notifiedAt: toIso(r.notified_at),
		disabledAt: toIso(r.disabled_at)
	};
}

export async function insertTemporaryArea(
	executor: QueryExecutor,
	row: Pick<
		TemporaryArea,
		'areaId' | 'requestId' | 'startsOn' | 'expiresOn' | 'discordId' | 'username'
	> & { started: boolean }
): Promise<void> {
	await executor.execute(
		`INSERT INTO temporary_areas
		 (area_id, request_id, starts_on, expires_on, discord_id, username, started_at)
		 VALUES (?, ?, ?, ?, ?, ?, ${row.started ? 'NOW()' : 'NULL'})`,
		[row.areaId, row.requestId, row.startsOn, row.expiresOn, row.discordId, row.username]
	);
}

export async function listTemporaryAreas(executor: QueryExecutor): Promise<TemporaryArea[]> {
	const [rows] = await executor.execute<TemporaryAreaRow[]>(
		`SELECT ${SELECT_COLUMNS} FROM temporary_areas ORDER BY expires_on, area_id`
	);
	return rows.map(mapRow);
}

export async function getTemporaryArea(
	executor: QueryExecutor,
	areaId: number
): Promise<TemporaryArea | null> {
	const [rows] = await executor.execute<TemporaryAreaRow[]>(
		`SELECT ${SELECT_COLUMNS} FROM temporary_areas WHERE area_id = ?`,
		[areaId]
	);
	return rows[0] ? mapRow(rows[0]) : null;
}

interface UpdateResult {
	affectedRows?: number;
}

/**
 * Claims a due start: stamps started_at only if the row still exists, hasn't
 * started, isn't disabled and its start is due (starts_on <= today + 1, the
 * same rule as isStartDue). Returns false when an admin changed or removed the
 * row since the pass read it, so the caller must not touch Dragonite.
 */
export async function claimStart(
	executor: QueryExecutor,
	areaId: number,
	today: string
): Promise<boolean> {
	const [result] = await executor.execute<UpdateResult>(
		`UPDATE temporary_areas SET started_at = NOW()
		 WHERE area_id = ? AND started_at IS NULL AND disabled_at IS NULL AND starts_on <= ?`,
		[areaId, addDays(today, 1)]
	);
	return (result?.affectedRows ?? 0) === 1;
}

/** Undoes claimStart after a failed Dragonite patch, so the next pass retries. */
export async function releaseStart(executor: QueryExecutor, areaId: number): Promise<void> {
	await executor.execute('UPDATE temporary_areas SET started_at = NULL WHERE area_id = ?', [
		areaId
	]);
}

/** Claims a due shut-off, like claimStart: only a row that is still live and past its end. */
export async function claimDisable(
	executor: QueryExecutor,
	areaId: number,
	today: string
): Promise<boolean> {
	const [result] = await executor.execute<UpdateResult>(
		`UPDATE temporary_areas SET disabled_at = NOW()
		 WHERE area_id = ? AND disabled_at IS NULL AND expires_on <= ?`,
		[areaId, today]
	);
	return (result?.affectedRows ?? 0) === 1;
}

/** Undoes claimDisable after a failed Dragonite patch, so the next pass retries. */
export async function releaseDisable(executor: QueryExecutor, areaId: number): Promise<void> {
	await executor.execute('UPDATE temporary_areas SET disabled_at = NULL WHERE area_id = ?', [
		areaId
	]);
}

export async function markNotified(executor: QueryExecutor, areaId: number): Promise<void> {
	await executor.execute('UPDATE temporary_areas SET notified_at = NOW() WHERE area_id = ?', [
		areaId
	]);
}

async function markGone(executor: QueryExecutor, areaId: number): Promise<void> {
	await executor.execute(
		'UPDATE temporary_areas SET disabled_at = NOW() WHERE area_id = ? AND disabled_at IS NULL',
		[areaId]
	);
}

export async function updateTemporaryDates(
	executor: QueryExecutor,
	areaId: number,
	p: {
		startsOn: string;
		expiresOn: string;
		resetNotified: boolean;
		/** The area was switched back on: clear disabled_at and stamp started_at */
		reenabled: boolean;
		/** Clear disabled_at only, leaving the start to the scheduler */
		clearDisabled?: boolean;
	}
): Promise<void> {
	const sets = ['starts_on = ?', 'expires_on = ?'];
	if (p.resetNotified) sets.push('notified_at = NULL');
	if (p.reenabled) sets.push('disabled_at = NULL', 'started_at = COALESCE(started_at, NOW())');
	else if (p.clearDisabled) sets.push('disabled_at = NULL');
	await executor.execute(`UPDATE temporary_areas SET ${sets.join(', ')} WHERE area_id = ?`, [
		p.startsOn,
		p.expiresOn,
		areaId
	]);
}

export async function deleteTemporaryArea(
	executor: QueryExecutor,
	areaId: number
): Promise<boolean> {
	const [result] = await executor.execute<{ affectedRows?: number }>(
		'DELETE FROM temporary_areas WHERE area_id = ?',
		[areaId]
	);
	return (result?.affectedRows ?? 0) > 0;
}

export interface TemporaryPassPlan {
	start: number[];
	warn: number[];
	disable: number[];
	/** Missing from Dragonite on this pass and the previous one: marked disabled */
	gone: number[];
	/** Every live row missing from Dragonite on this pass; the caller passes it back next pass */
	missing: number[];
}

const emptyPlan = (): TemporaryPassPlan => ({
	start: [],
	warn: [],
	disable: [],
	gone: [],
	missing: []
});

/**
 * Pure decision step. A row must be missing from Dragonite on two consecutive
 * passes (`previouslyMissing` is the last pass's `missing`) before it counts as
 * gone, so one bad or partial answer can never retire a live area's row.
 */
export function planTemporaryPass(
	rows: TemporaryArea[],
	today: string,
	liveAreaIds: Set<number>,
	previouslyMissing: ReadonlySet<number> = new Set()
): TemporaryPassPlan {
	const plan = emptyPlan();
	const warnBy = addDays(today, 1);
	for (const row of rows) {
		if (row.disabledAt !== null) continue;
		if (!liveAreaIds.has(row.areaId)) {
			plan.missing.push(row.areaId);
			if (previouslyMissing.has(row.areaId)) plan.gone.push(row.areaId);
			continue;
		}
		if (row.expiresOn <= today) {
			plan.disable.push(row.areaId);
			continue;
		}
		if (row.startedAt === null && isStartDue(row.startsOn, today)) plan.start.push(row.areaId);
		if (row.notifiedAt === null && row.expiresOn <= warnBy) plan.warn.push(row.areaId);
	}
	return plan;
}

export interface TemporaryPassDeps {
	listLiveAreas(): Promise<{ id: number; name: string; geofence: GeoJsonGeometry }[]>;
	setEnabled(areaId: number, enabled: boolean): Promise<void>;
	sendExpiryDm(row: TemporaryArea, areaName: string, geofence: GeoJsonGeometry): Promise<void>;
	alertDisabled(row: TemporaryArea, areaName: string): Promise<void>;
	log: {
		info(o: object, m: string): void;
		warn(o: object, m: string): void;
		error(o: object, m: string): void;
	};
}

/**
 * Runs one scheduler pass. Returns the actions that actually completed, plus
 * `missing` for the caller to pass back as `previouslyMissing` next time.
 * Start and shut-off claim the row with a conditional UPDATE before touching
 * Dragonite, so an admin edit or Make permanent racing the pass wins.
 */
export async function runTemporaryAreaPass(
	executor: QueryExecutor,
	today: string,
	deps: TemporaryPassDeps,
	previouslyMissing: ReadonlySet<number> = new Set()
): Promise<TemporaryPassPlan> {
	const done = emptyPlan();
	const { log } = deps;

	let liveAreas: Awaited<ReturnType<TemporaryPassDeps['listLiveAreas']>>;
	let rows: TemporaryArea[];
	try {
		liveAreas = await deps.listLiveAreas();
		rows = await listTemporaryAreas(executor);
	} catch (error) {
		log.error({ error: String(error) }, 'Temporary-area pass: could not load areas');
		return done;
	}

	// Dragonite answering with no areas at all is a failed lookup, not "every area was deleted"
	if (liveAreas.length === 0 && rows.some((r) => r.disabledAt === null)) {
		log.warn({}, 'Temporary-area pass: Dragonite returned no areas; skipping this pass');
		return done;
	}

	const byId = new Map(liveAreas.map((a) => [a.id, a]));
	const rowById = new Map(rows.map((r) => [r.areaId, r]));
	const plan = planTemporaryPass(rows, today, new Set(byId.keys()), previouslyMissing);
	done.missing = plan.missing;

	for (const id of plan.gone) {
		try {
			await markGone(executor, id);
			log.warn({ areaId: id }, 'Temporary area no longer exists; marking disabled');
			done.gone.push(id);
		} catch (error) {
			log.error({ areaId: id, error: String(error) }, 'Temporary-area gone mark failed');
		}
	}

	for (const id of plan.start) {
		try {
			if (!(await claimStart(executor, id, today))) continue;
		} catch (error) {
			log.error({ areaId: id, error: String(error) }, 'Temporary-area start claim failed');
			continue;
		}
		try {
			await deps.setEnabled(id, true);
			log.info({ areaId: id }, 'Temporary area enabled');
			done.start.push(id);
		} catch (error) {
			log.error({ areaId: id, error: String(error) }, 'Temporary-area enable failed');
			await releaseStart(executor, id).catch((e: unknown) =>
				log.error({ areaId: id, error: String(e) }, 'Temporary-area start release failed')
			);
		}
	}

	for (const id of plan.warn) {
		const area = byId.get(id)!;
		try {
			await deps.sendExpiryDm(rowById.get(id)!, area.name, area.geofence);
		} catch (error) {
			log.warn({ areaId: id, error: String(error) }, 'Temporary-area expiry notice failed');
		}
		try {
			await markNotified(executor, id);
			done.warn.push(id);
		} catch (error) {
			log.error({ areaId: id, error: String(error) }, 'Temporary-area notified mark failed');
		}
	}

	for (const id of plan.disable) {
		try {
			if (!(await claimDisable(executor, id, today))) continue;
		} catch (error) {
			log.error({ areaId: id, error: String(error) }, 'Temporary-area disable claim failed');
			continue;
		}
		try {
			await deps.setEnabled(id, false);
			log.info({ areaId: id }, 'Temporary area disabled');
			done.disable.push(id);
		} catch (error) {
			log.error({ areaId: id, error: String(error) }, 'Temporary-area disable failed');
			await releaseDisable(executor, id).catch((e: unknown) =>
				log.error({ areaId: id, error: String(e) }, 'Temporary-area disable release failed')
			);
			continue;
		}
		try {
			await deps.alertDisabled(rowById.get(id)!, byId.get(id)!.name);
		} catch (error) {
			log.error({ areaId: id, error: String(error) }, 'Temporary-area disable alert failed');
		}
	}

	return done;
}
