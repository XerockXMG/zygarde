import { describe, expect, it, vi } from 'vitest';
import {
	claimDisable,
	claimStart,
	listTemporaryAreas,
	planTemporaryPass,
	runTemporaryAreaPass,
	updateTemporaryDates,
	type TemporaryArea,
	type TemporaryPassDeps
} from './temporary';

const TODAY = '2026-10-20';

function row(over: Partial<TemporaryArea> & { areaId: number }): TemporaryArea {
	return {
		requestId: null,
		startsOn: '2026-10-01',
		expiresOn: '2026-11-30',
		discordId: '1',
		username: 'u',
		startedAt: '2026-10-01T00:00:00.000Z',
		notifiedAt: null,
		disabledAt: null,
		...over
	};
}

const live = (...ids: number[]) => new Set(ids);

describe('planTemporaryPass', () => {
	it('starts a row the day before its start date', () => {
		const a = row({ areaId: 1, startsOn: '2026-10-21', startedAt: null });
		const b = row({ areaId: 2, startsOn: '2026-10-22', startedAt: null });
		expect(planTemporaryPass([a, b], TODAY, live(1, 2)).start).toEqual([1]);
	});

	it('warns the day before expiry, once', () => {
		const a = row({ areaId: 1, expiresOn: '2026-10-21' });
		const b = row({ areaId: 2, expiresOn: '2026-10-22' });
		const c = row({ areaId: 3, expiresOn: '2026-10-21', notifiedAt: '2026-10-20T00:00:00.000Z' });
		expect(planTemporaryPass([a, b, c], TODAY, live(1, 2, 3)).warn).toEqual([1]);
	});

	it('disables on or after the end date, and excludes those from start/warn', () => {
		const a = row({ areaId: 1, expiresOn: '2026-10-20', startedAt: null });
		const b = row({ areaId: 2, expiresOn: '2026-10-15', startedAt: null });
		const plan = planTemporaryPass([a, b], TODAY, live(1, 2));
		expect(plan.disable).toEqual([1, 2]);
		expect(plan.start).toEqual([]);
		expect(plan.warn).toEqual([]);
	});

	it('ignores rows that are already disabled', () => {
		const a = row({ areaId: 1, expiresOn: '2026-10-01', disabledAt: '2026-10-02T00:00:00.000Z' });
		expect(planTemporaryPass([a], TODAY, live())).toEqual({
			start: [],
			warn: [],
			disable: [],
			gone: [],
			missing: []
		});
	});

	it('reports a row missing for the first time only as missing', () => {
		const a = row({ areaId: 1, expiresOn: '2026-10-01', startedAt: null });
		expect(planTemporaryPass([a], TODAY, live(2))).toEqual({
			start: [],
			warn: [],
			disable: [],
			gone: [],
			missing: [1]
		});
	});

	it('reports a row missing on two consecutive passes as gone', () => {
		const a = row({ areaId: 1, expiresOn: '2026-10-01', startedAt: null });
		expect(planTemporaryPass([a], TODAY, live(2), new Set([1]))).toEqual({
			start: [],
			warn: [],
			disable: [],
			gone: [1],
			missing: [1]
		});
	});
});

type Fake = {
	rows: TemporaryArea[];
	execute: ReturnType<typeof vi.fn>;
	/** Runs once right after the pass reads the rows (simulates a concurrent admin action) */
	afterSelect?: () => void;
};

function fakeExecutor(rows: TemporaryArea[]): Fake {
	const fake: Fake = {
		rows,
		execute: vi.fn(async (sql: string, params: unknown[] = []) => {
			if (/^\s*SELECT/i.test(sql)) {
				const snapshot = fake.rows.map((r) => ({
					area_id: r.areaId,
					request_id: r.requestId,
					starts_on: r.startsOn,
					expires_on: r.expiresOn,
					discord_id: r.discordId,
					username: r.username,
					started_at: r.startedAt,
					notified_at: r.notifiedAt,
					disabled_at: r.disabledAt
				}));
				fake.afterSelect?.();
				fake.afterSelect = undefined;
				return [snapshot, undefined];
			}
			const target = fake.rows.find((r) => r.areaId === params[0]);
			if (!target) return [{ affectedRows: 0 }, undefined];
			const now = new Date().toISOString();
			let ok = true;
			if (/SET started_at = NOW\(\)/i.test(sql)) {
				ok =
					target.startedAt === null &&
					target.disabledAt === null &&
					target.startsOn <= (params[1] as string);
				if (ok) target.startedAt = now;
			} else if (/SET started_at = NULL/i.test(sql)) target.startedAt = null;
			else if (/SET notified_at = NOW\(\)/i.test(sql)) target.notifiedAt = now;
			else if (/SET disabled_at = NOW\(\)/i.test(sql)) {
				ok = target.disabledAt === null;
				if (/expires_on <= \?/i.test(sql)) ok &&= target.expiresOn <= (params[1] as string);
				if (ok) target.disabledAt = now;
			} else if (/SET disabled_at = NULL/i.test(sql)) target.disabledAt = null;
			return [{ affectedRows: ok ? 1 : 0 }, undefined];
		})
	};
	return fake;
}

function makeDeps(over: Partial<TemporaryPassDeps> = {}): TemporaryPassDeps {
	return {
		listLiveAreas: vi.fn(async () => [
			{ id: 1, name: 'One', geofence: { type: 'Polygon', coordinates: [] } as never },
			{ id: 2, name: 'Two', geofence: { type: 'Polygon', coordinates: [] } as never }
		]),
		setEnabled: vi.fn(async () => {}),
		sendExpiryDm: vi.fn(async () => {}),
		alertDisabled: vi.fn(async () => {}),
		log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
		...over
	};
}

describe('runTemporaryAreaPass', () => {
	it('is idempotent once rows are marked', async () => {
		const ex = fakeExecutor([
			row({ areaId: 1, startsOn: '2026-10-21', startedAt: null }),
			row({ areaId: 2, expiresOn: '2026-10-20' })
		]);
		const deps = makeDeps();
		const first = await runTemporaryAreaPass(ex, TODAY, deps);
		expect(first.start).toEqual([1]);
		expect(first.disable).toEqual([2]);
		await runTemporaryAreaPass(ex, TODAY, deps);
		expect(deps.setEnabled).toHaveBeenCalledTimes(2);
		expect(deps.setEnabled).toHaveBeenCalledWith(1, true);
		expect(deps.setEnabled).toHaveBeenCalledWith(2, false);
		expect(deps.alertDisabled).toHaveBeenCalledTimes(1);
	});

	it('continues after one patch fails', async () => {
		const ex = fakeExecutor([
			row({ areaId: 1, expiresOn: '2026-10-20' }),
			row({ areaId: 2, expiresOn: '2026-10-20' })
		]);
		const setEnabled = vi
			.fn()
			.mockRejectedValueOnce(new Error('boom'))
			.mockResolvedValue(undefined);
		const deps = makeDeps({ setEnabled });
		const done = await runTemporaryAreaPass(ex, TODAY, deps);
		expect(done.disable).toEqual([2]);
		expect(ex.rows[0].disabledAt).toBeNull();
		expect(ex.rows[1].disabledAt).not.toBeNull();
		expect(deps.log.error).toHaveBeenCalled();
	});

	it('does not mark gone when listing fails', async () => {
		const ex = fakeExecutor([row({ areaId: 1 })]);
		const deps = makeDeps({
			listLiveAreas: vi.fn(async () => {
				throw new Error('down');
			})
		});
		const done = await runTemporaryAreaPass(ex, TODAY, deps);
		expect(done).toEqual({ start: [], warn: [], disable: [], gone: [], missing: [] });
		expect(ex.rows[0].disabledAt).toBeNull();
	});

	it('treats an empty live-area list as a failed lookup and marks nothing', async () => {
		const ex = fakeExecutor([row({ areaId: 1 }), row({ areaId: 2, expiresOn: '2026-10-20' })]);
		const deps = makeDeps({ listLiveAreas: vi.fn(async () => []) });
		const previouslyMissing = new Set([1, 2]);
		const done = await runTemporaryAreaPass(ex, TODAY, deps, previouslyMissing);
		expect(done).toEqual({ start: [], warn: [], disable: [], gone: [], missing: [] });
		expect(ex.rows.every((r) => r.disabledAt === null)).toBe(true);
		expect(deps.setEnabled).not.toHaveBeenCalled();
		expect(deps.log.warn).toHaveBeenCalled();
	});

	it('does not mark a row gone the first time it is missing', async () => {
		const ex = fakeExecutor([row({ areaId: 9 })]);
		const deps = makeDeps();
		const done = await runTemporaryAreaPass(ex, TODAY, deps);
		expect(done.gone).toEqual([]);
		expect(done.missing).toEqual([9]);
		expect(ex.rows[0].disabledAt).toBeNull();
	});

	it('marks a row gone when it is missing on two consecutive passes', async () => {
		const ex = fakeExecutor([row({ areaId: 9 })]);
		const deps = makeDeps();
		const first = await runTemporaryAreaPass(ex, TODAY, deps);
		const second = await runTemporaryAreaPass(ex, TODAY, deps, new Set(first.missing));
		expect(second.gone).toEqual([9]);
		expect(ex.rows[0].disabledAt).not.toBeNull();
		expect(deps.setEnabled).not.toHaveBeenCalled();
	});

	it('resets the miss count when an area reappears', async () => {
		const ex = fakeExecutor([row({ areaId: 9 })]);
		const area9 = { id: 9, name: 'Nine', geofence: { type: 'Polygon', coordinates: [] } as never };
		const area1 = { id: 1, name: 'One', geofence: { type: 'Polygon', coordinates: [] } as never };
		const listLiveAreas = vi
			.fn()
			.mockResolvedValueOnce([area1])
			.mockResolvedValueOnce([area1, area9])
			.mockResolvedValueOnce([area1]);
		const deps = makeDeps({ listLiveAreas });
		const first = await runTemporaryAreaPass(ex, TODAY, deps);
		expect(first.missing).toEqual([9]);
		const second = await runTemporaryAreaPass(ex, TODAY, deps, new Set(first.missing));
		expect(second.missing).toEqual([]);
		const third = await runTemporaryAreaPass(ex, TODAY, deps, new Set(second.missing));
		expect(third.gone).toEqual([]);
		expect(ex.rows[0].disabledAt).toBeNull();
	});

	it('does not patch Dragonite when the row was made permanent mid-pass', async () => {
		const ex = fakeExecutor([
			row({ areaId: 1, startsOn: '2026-10-21', startedAt: null }),
			row({ areaId: 2, expiresOn: '2026-10-20' })
		]);
		// An admin deletes the rows (Make permanent) after the pass has read them
		ex.afterSelect = () => (ex.rows = []);
		const deps = makeDeps();
		const done = await runTemporaryAreaPass(ex, TODAY, deps);
		expect(deps.setEnabled).not.toHaveBeenCalled();
		expect(deps.alertDisabled).not.toHaveBeenCalled();
		expect(done.start).toEqual([]);
		expect(done.disable).toEqual([]);
	});

	it('does not start a row an admin disabled mid-pass', async () => {
		const ex = fakeExecutor([row({ areaId: 1, startsOn: '2026-10-21', startedAt: null })]);
		ex.afterSelect = () => (ex.rows[0].disabledAt = '2026-10-20T00:00:00.000Z');
		const deps = makeDeps();
		await runTemporaryAreaPass(ex, TODAY, deps);
		expect(deps.setEnabled).not.toHaveBeenCalled();
		expect(ex.rows[0].startedAt).toBeNull();
	});

	it('releases the start claim when enabling fails, so the next pass retries', async () => {
		const ex = fakeExecutor([row({ areaId: 1, startsOn: '2026-10-21', startedAt: null })]);
		const setEnabled = vi
			.fn()
			.mockRejectedValueOnce(new Error('boom'))
			.mockResolvedValue(undefined);
		const deps = makeDeps({ setEnabled });
		const first = await runTemporaryAreaPass(ex, TODAY, deps);
		expect(first.start).toEqual([]);
		expect(ex.rows[0].startedAt).toBeNull();
		const second = await runTemporaryAreaPass(ex, TODAY, deps);
		expect(second.start).toEqual([1]);
		expect(ex.rows[0].startedAt).not.toBeNull();
	});

	it('passes the live area name to sendExpiryDm and marks notified', async () => {
		const ex = fakeExecutor([row({ areaId: 2, expiresOn: '2026-10-21' })]);
		const deps = makeDeps();
		const done = await runTemporaryAreaPass(ex, TODAY, deps);
		expect(done.warn).toEqual([2]);
		expect(deps.sendExpiryDm).toHaveBeenCalledWith(
			expect.objectContaining({ areaId: 2 }),
			'Two',
			expect.anything()
		);
		expect(ex.rows[0].notifiedAt).not.toBeNull();
	});

	it('marks notified even when sendExpiryDm fails, and does not retry', async () => {
		const ex = fakeExecutor([row({ areaId: 2, expiresOn: '2026-10-21' })]);
		const sendExpiryDm = vi.fn().mockRejectedValue(new Error('dm closed'));
		const deps = makeDeps({ sendExpiryDm });
		await runTemporaryAreaPass(ex, TODAY, deps);
		expect(ex.rows[0].notifiedAt).not.toBeNull();
		await runTemporaryAreaPass(ex, TODAY, deps);
		expect(sendExpiryDm).toHaveBeenCalledTimes(1);
	});

	it('keeps the row disabled when alertDisabled fails', async () => {
		const ex = fakeExecutor([row({ areaId: 1, expiresOn: '2026-10-20' })]);
		const deps = makeDeps({ alertDisabled: vi.fn().mockRejectedValue(new Error('x')) });
		const done = await runTemporaryAreaPass(ex, TODAY, deps);
		expect(done.disable).toEqual([1]);
		expect(ex.rows[0].disabledAt).not.toBeNull();
	});
});

describe('SQL', () => {
	it('listTemporaryAreas formats DATE columns', async () => {
		const ex = { execute: vi.fn(async (_sql: string) => [[], undefined]) };
		await listTemporaryAreas(ex as never);
		const sql = ex.execute.mock.calls[0][0] as string;
		expect(sql).toContain('DATE_FORMAT(starts_on');
		expect(sql).toContain('DATE_FORMAT(expires_on');
	});

	it('updateTemporaryDates with clearDisabled only clears disabled_at', async () => {
		const ex = { execute: vi.fn(async (_sql: string, _p?: unknown[]) => [{}, undefined]) };
		await updateTemporaryDates(ex as never, 1, {
			startsOn: '2026-10-25',
			expiresOn: '2026-11-01',
			resetNotified: false,
			reenabled: false,
			clearDisabled: true
		});
		const sql = ex.execute.mock.calls[0][0] as string;
		expect(sql).toContain('disabled_at = NULL');
		expect(sql).not.toContain('started_at');
	});

	it('claim SQL only matches rows that are still due', async () => {
		const ex = {
			execute: vi.fn(async (_sql: string, _p?: unknown[]) => [{ affectedRows: 0 }, undefined])
		};
		expect(await claimStart(ex as never, 1, TODAY)).toBe(false);
		expect(await claimDisable(ex as never, 1, TODAY)).toBe(false);
		const [startSql, startParams] = ex.execute.mock.calls[0];
		expect(startSql).toContain('started_at IS NULL');
		expect(startSql).toContain('disabled_at IS NULL');
		expect(startSql).toContain('starts_on <= ?');
		expect(startParams).toEqual([1, '2026-10-21']);
		const [disableSql, disableParams] = ex.execute.mock.calls[1];
		expect(disableSql).toContain('disabled_at IS NULL');
		expect(disableSql).toContain('expires_on <= ?');
		expect(disableParams).toEqual([1, TODAY]);
	});

	it('updateTemporaryDates with reenabled clears disabled_at', async () => {
		const ex = { execute: vi.fn(async (_sql: string, _p?: unknown[]) => [{}, undefined]) };
		await updateTemporaryDates(ex as never, 1, {
			startsOn: '2026-10-21',
			expiresOn: '2026-11-01',
			resetNotified: true,
			reenabled: true
		});
		const sql = ex.execute.mock.calls[0][0] as string;
		expect(sql).toContain('disabled_at = NULL');
		expect(sql).toContain('COALESCE(started_at');
		expect(sql).toContain('notified_at = NULL');
	});
});
