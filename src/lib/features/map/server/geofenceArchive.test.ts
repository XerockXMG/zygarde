import { describe, expect, it, vi } from 'vitest';
import {
	archiveGeofence,
	listGeofenceArchive,
	getArchiveEntry,
	deleteGeofenceArchive
} from './geofenceArchive';

describe('archiveGeofence', () => {
	it('inserts an archive row with the serialized geofence and archiver identity', async () => {
		const execute = vi.fn().mockResolvedValue([{}, {}]);
		const executor = { execute };

		await archiveGeofence(executor, {
			areaId: 42,
			areaName: 'Test Area',
			geofence: {
				type: 'Polygon',
				coordinates: [
					[
						[0, 0],
						[1, 0],
						[1, 1],
						[0, 0]
					]
				]
			},
			archivedByDiscordId: 'discord-1',
			archivedByUsername: 'tester'
		});

		expect(execute).toHaveBeenCalledTimes(1);
		const [sql, params] = execute.mock.calls[0];
		expect(sql).toContain('INSERT INTO geofence_archive');
		expect(params).toEqual([
			42,
			'Test Area',
			JSON.stringify({
				type: 'Polygon',
				coordinates: [
					[
						[0, 0],
						[1, 0],
						[1, 1],
						[0, 0]
					]
				]
			}),
			'discord-1',
			'tester'
		]);
	});

	it('serializes a null geofence as the JSON literal "null"', async () => {
		const execute = vi.fn().mockResolvedValue([{}, {}]);
		const executor = { execute };

		await archiveGeofence(executor, {
			areaId: 1,
			areaName: 'No Geofence Area',
			geofence: null,
			archivedByDiscordId: 'discord-2',
			archivedByUsername: 'tester2'
		});

		const [, params] = execute.mock.calls[0];
		expect(params[2]).toBe('null');
	});
});

describe('listGeofenceArchive', () => {
	it('groups entries by area id, newest first, capped at 20 per area', async () => {
		const execute = vi.fn();
		const executor = { execute };

		const polygon = JSON.stringify({
			type: 'Polygon',
			coordinates: [
				[
					[0, 0],
					[1, 0],
					[1, 1],
					[0, 0]
				]
			]
		});

		// Rows arrive already newest-first, as the real "ORDER BY archived_at DESC" query would return them.
		const rows = Array.from({ length: 25 }, (_, i) => ({
			id: 25 - i,
			area_id: 1,
			geofence: polygon,
			archived_at: new Date(`2026-01-${String(25 - i).padStart(2, '0')}T00:00:00Z`),
			archived_by_username: 'tester'
		}));
		execute.mockResolvedValueOnce([rows, undefined]);

		const result = await listGeofenceArchive(executor);

		expect(result[1]).toHaveLength(20);
		// Newest archived_at first (row 25, then 24, ...)
		expect(result[1][0]).toEqual({
			id: 25,
			archivedAt: '2026-01-25T00:00:00.000Z',
			archivedBy: 'tester',
			vertexCount: 3
		});
	});

	it('reports vertexCount 0 for a null-geofence entry', async () => {
		const execute = vi.fn().mockResolvedValueOnce([
			[
				{
					id: 1,
					area_id: 7,
					geofence: 'null',
					archived_at: new Date('2026-01-01T00:00:00Z'),
					archived_by_username: 'tester'
				}
			],
			undefined
		]);
		const executor = { execute };

		const result = await listGeofenceArchive(executor);
		expect(result[7][0].vertexCount).toBe(0);
	});
});

describe('getArchiveEntry', () => {
	it('returns the archived area id, name, and parsed geofence', async () => {
		const execute = vi.fn().mockResolvedValueOnce([
			[
				{
					area_id: 3,
					area_name: 'Test Area',
					geofence: JSON.stringify({
						type: 'Polygon',
						coordinates: [
							[
								[0, 0],
								[1, 0],
								[1, 1],
								[0, 0]
							]
						]
					})
				}
			],
			undefined
		]);
		const executor = { execute };

		await expect(getArchiveEntry(executor, 99)).resolves.toEqual({
			areaId: 3,
			areaName: 'Test Area',
			geofence: {
				type: 'Polygon',
				coordinates: [
					[
						[0, 0],
						[1, 0],
						[1, 1],
						[0, 0]
					]
				]
			}
		});
	});

	it('returns null when no archive row matches', async () => {
		const execute = vi.fn().mockResolvedValueOnce([[], undefined]);
		const executor = { execute };
		await expect(getArchiveEntry(executor, 99)).resolves.toBeNull();
	});
});

describe('deleteGeofenceArchive', () => {
	it('deletes the archive row by id', async () => {
		const execute = vi.fn().mockResolvedValue([{}, {}]);
		const executor = { execute };

		await deleteGeofenceArchive(executor, 42);

		expect(execute).toHaveBeenCalledWith('DELETE FROM geofence_archive WHERE id = ?', [42]);
	});
});
