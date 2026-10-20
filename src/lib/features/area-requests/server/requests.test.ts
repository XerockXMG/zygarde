import { describe, expect, it, vi } from 'vitest';
import {
	submitRequest,
	listMyRequests,
	deleteMyRequest,
	listRequestsForAdmin,
	countRequestsByStatus,
	getRequestById,
	resolveRequest,
	approveAsCreated,
	updatePendingAdditionGeofence
} from './requests';

describe('submitRequest', () => {
	it('inserts a request row with the submitter identity', async () => {
		const execute = vi.fn().mockResolvedValue([{}, {}]);
		const executor = { execute };

		await submitRequest(executor, {
			type: 'addition',
			geofence: '{"type":"Polygon","coordinates":[[[0,0],[1,0],[1,1],[0,0]]]}',
			existingAreaId: null,
			existingAreaName: null,
			userNote: 'Please add this area',
			discordId: 'discord-1',
			username: 'tester',
			temporary: null
		});

		expect(execute).toHaveBeenCalledTimes(1);
		const [sql, params] = execute.mock.calls[0];
		expect(sql).toContain('INSERT INTO area_requests');
		expect(params).toEqual([
			'addition',
			'{"type":"Polygon","coordinates":[[[0,0],[1,0],[1,1],[0,0]]]}',
			null,
			null,
			'Please add this area',
			'discord-1',
			'tester',
			0,
			null,
			null
		]);
	});

	it('inserts temporary dates', async () => {
		const execute = vi.fn().mockResolvedValue([{}, {}]);

		await submitRequest(
			{ execute },
			{
				type: 'addition',
				geofence: '{}',
				existingAreaId: null,
				existingAreaName: null,
				userNote: 'Event weekend',
				discordId: 'discord-1',
				username: 'tester',
				temporary: { startsOn: '2026-10-21', expiresOn: '2026-11-05' }
			}
		);

		const [sql, params] = execute.mock.calls[0];
		expect(sql).toContain('is_temporary, starts_on, expires_on');
		expect(params).toEqual([
			'addition',
			'{}',
			null,
			null,
			'Event weekend',
			'discord-1',
			'tester',
			1,
			'2026-10-21',
			'2026-11-05'
		]);
	});
});

describe('listMyRequests', () => {
	it('maps rows to camelCase summaries, converting Date fields to ISO strings', async () => {
		const submittedAt = new Date('2026-01-01T00:00:00Z');
		const execute = vi.fn().mockResolvedValue([
			[
				{
					id: 1,
					type: 'removal',
					status: 'pending',
					existing_area_name: 'Downtown',
					user_note: 'Too much overlap',
					admin_note: null,
					submitted_at: submittedAt,
					resolved_at: null,
					is_temporary: 0,
					starts_on: null,
					expires_on: null
				}
			],
			{}
		]);
		const executor = { execute };

		const result = await listMyRequests(executor, 'discord-1');

		expect(execute).toHaveBeenCalledWith(expect.stringContaining('WHERE discord_id = ?'), [
			'discord-1'
		]);
		expect(result).toEqual([
			{
				id: 1,
				type: 'removal',
				status: 'pending',
				existingAreaName: 'Downtown',
				userNote: 'Too much overlap',
				adminNote: null,
				submittedAt: submittedAt.toISOString(),
				resolvedAt: null,
				isTemporary: false,
				startsOn: null,
				expiresOn: null
			}
		]);
	});
});

describe('deleteMyRequest', () => {
	it('deletes a row regardless of status, scoped to the owner', async () => {
		const execute = vi.fn().mockResolvedValue([{ affectedRows: 1 }, {}]);
		const executor = { execute };

		const result = await deleteMyRequest(executor, 5, 'discord-1');

		expect(result).toBe(true);
		const [sql, params] = execute.mock.calls[0];
		expect(sql).toContain('DELETE FROM area_requests');
		expect(sql).not.toContain('pending');
		expect(params).toEqual([5, 'discord-1']);
	});

	it('returns false when no row matched (wrong owner or wrong id)', async () => {
		const execute = vi.fn().mockResolvedValue([{ affectedRows: 0 }, {}]);
		const executor = { execute };

		const result = await deleteMyRequest(executor, 5, 'discord-2');

		expect(result).toBe(false);
	});
});

describe('countRequestsByStatus', () => {
	it('fills every status, defaulting to 0, and totals them', async () => {
		const execute = vi.fn().mockResolvedValue([
			[
				{ status: 'pending', n: 3 },
				{ status: 'approved', n: '12' }
			],
			{}
		]);
		await expect(countRequestsByStatus({ execute })).resolves.toEqual({
			pending: 3,
			approved: 12,
			rejected: 0,
			all: 15
		});
		expect(execute.mock.calls[0][0]).toContain('GROUP BY status');
	});
});

describe('listRequestsForAdmin', () => {
	it('filters by status when not "all"', async () => {
		const execute = vi.fn().mockResolvedValue([[], {}]);
		const executor = { execute };

		await listRequestsForAdmin(executor, 'pending');

		const [sql, params] = execute.mock.calls[0];
		expect(sql).toContain('WHERE status = ?');
		expect(params).toEqual(['pending']);
	});

	it('omits the WHERE clause when status is "all"', async () => {
		const execute = vi.fn().mockResolvedValue([[], {}]);
		const executor = { execute };

		await listRequestsForAdmin(executor, 'all');

		const [sql, params] = execute.mock.calls[0];
		expect(sql).not.toContain('WHERE status');
		expect(params).toEqual([]);
	});

	it('maps rows to the full admin shape', async () => {
		const submittedAt = new Date('2026-01-01T00:00:00Z');
		const execute = vi.fn().mockResolvedValue([
			[
				{
					id: 2,
					type: 'addition',
					status: 'pending',
					geofence: '{"type":"Polygon","coordinates":[]}',
					existing_area_id: null,
					existing_area_name: null,
					user_note: 'New neighborhood',
					admin_note: null,
					discord_id: 'discord-3',
					username: 'requester',
					submitted_at: submittedAt,
					resolved_at: null,
					resolved_by_username: null,
					created_area_id: null,
					is_temporary: 1,
					starts_on: '2026-10-21',
					expires_on: '2026-11-05'
				}
			],
			{}
		]);
		const executor = { execute };

		const result = await listRequestsForAdmin(executor, 'all');

		expect(execute.mock.calls[0][0]).toContain('DATE_FORMAT(expires_on');
		expect(result).toEqual([
			{
				id: 2,
				type: 'addition',
				status: 'pending',
				geofence: '{"type":"Polygon","coordinates":[]}',
				existingAreaId: null,
				existingAreaName: null,
				userNote: 'New neighborhood',
				adminNote: null,
				discordId: 'discord-3',
				username: 'requester',
				submittedAt: submittedAt.toISOString(),
				resolvedAt: null,
				resolvedByUsername: null,
				createdAreaId: null,
				isTemporary: true,
				startsOn: '2026-10-21',
				expiresOn: '2026-11-05'
			}
		]);
	});
});

describe('getRequestById', () => {
	it('returns the row when found', async () => {
		const execute = vi.fn().mockResolvedValue([
			[
				{
					type: 'removal',
					status: 'pending',
					discord_id: 'discord-1',
					existing_area_id: 9,
					geofence: '{}',
					is_temporary: 0,
					starts_on: null,
					expires_on: null,
					username: 'tester'
				}
			],
			{}
		]);
		const executor = { execute };

		const result = await getRequestById(executor, 1);

		expect(result).toEqual({
			type: 'removal',
			status: 'pending',
			discord_id: 'discord-1',
			existing_area_id: 9,
			geofence: '{}',
			is_temporary: 0,
			starts_on: null,
			expires_on: null,
			username: 'tester'
		});
	});

	it('returns null when not found', async () => {
		const execute = vi.fn().mockResolvedValue([[], {}]);
		const executor = { execute };

		const result = await getRequestById(executor, 999);

		expect(result).toBeNull();
	});
});

describe('resolveRequest', () => {
	it('updates status, admin note, and resolver identity', async () => {
		const execute = vi.fn().mockResolvedValue([{}, {}]);
		const executor = { execute };

		await resolveRequest(executor, 1, 'rejected', 'Duplicate of #2', 'admin-1', 'adminuser');

		const [sql, params] = execute.mock.calls[0];
		expect(sql).toContain('UPDATE area_requests');
		expect(sql).toContain('SET status = ?');
		expect(params).toEqual(['rejected', 'Duplicate of #2', 'admin-1', 'adminuser', 1]);
	});
});

describe('approveAsCreated', () => {
	it('marks the request approved and records the created area id', async () => {
		const execute = vi.fn().mockResolvedValue([{}, {}]);
		const executor = { execute };

		await approveAsCreated(executor, 1, null, 'admin-1', 'adminuser', 42);

		const [sql, params] = execute.mock.calls[0];
		expect(sql).toContain("status = 'approved'");
		expect(sql).toContain('created_area_id = ?');
		expect(params).toEqual([null, 'admin-1', 'adminuser', 42, 1]);
	});
});

describe('updatePendingAdditionGeofence', () => {
	it('updates only a pending addition and reports whether a row changed', async () => {
		const execute = vi.fn().mockResolvedValue([{ affectedRows: 1 }, {}]);
		const executor = { execute };

		const changed = await updatePendingAdditionGeofence(executor, 7, '{"type":"Polygon"}');

		const [sql, params] = execute.mock.calls[0];
		expect(sql).toContain('UPDATE area_requests');
		expect(sql).toContain("status = 'pending' AND type = 'addition'");
		expect(params).toEqual(['{"type":"Polygon"}', 7]);
		expect(changed).toBe(true);
	});

	it('returns false when no row matched', async () => {
		const execute = vi.fn().mockResolvedValue([{ affectedRows: 0 }, {}]);
		expect(await updatePendingAdditionGeofence({ execute }, 7, '{}')).toBe(false);
	});
});
