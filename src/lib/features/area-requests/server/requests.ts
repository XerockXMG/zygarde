export interface QueryExecutor {
	execute<T = unknown>(sql: string, params?: unknown[]): Promise<[T, unknown]>;
}

export type RequestType = 'addition' | 'removal';
export type RequestStatus = 'pending' | 'approved' | 'rejected';

export interface RequestSummary {
	id: number;
	type: RequestType;
	status: RequestStatus;
	existingAreaName: string | null;
	userNote: string;
	adminNote: string | null;
	submittedAt: string;
	resolvedAt: string | null;
	isTemporary: boolean;
	/** YYYY-MM-DD, set only when isTemporary. */
	startsOn: string | null;
	expiresOn: string | null;
}

export interface AdminAreaRequest extends RequestSummary {
	geofence: string;
	existingAreaId: number | null;
	discordId: string;
	username: string;
	resolvedByUsername: string | null;
	createdAreaId: number | null;
}

export interface SubmitRequestParams {
	type: RequestType;
	geofence: string;
	existingAreaId: number | null;
	existingAreaName: string | null;
	userNote: string;
	discordId: string;
	username: string;
	temporary: { startsOn: string; expiresOn: string } | null;
}

export async function submitRequest(
	executor: QueryExecutor,
	params: SubmitRequestParams
): Promise<void> {
	await executor.execute(
		`INSERT INTO area_requests
		 (type, geofence, existing_area_id, existing_area_name, user_note, discord_id, username,
		  is_temporary, starts_on, expires_on)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		[
			params.type,
			params.geofence,
			params.existingAreaId,
			params.existingAreaName,
			params.userNote,
			params.discordId,
			params.username,
			params.temporary ? 1 : 0,
			params.temporary?.startsOn ?? null,
			params.temporary?.expiresOn ?? null
		]
	);
}

function toDateString(value: Date | string): string {
	return value instanceof Date ? value.toISOString() : String(value);
}

interface MyRequestRow {
	id: number;
	type: RequestType;
	status: RequestStatus;
	existing_area_name: string | null;
	user_note: string;
	admin_note: string | null;
	submitted_at: Date | string;
	resolved_at: Date | string | null;
	is_temporary: number;
	starts_on: string | null;
	expires_on: string | null;
}

function toRequestSummary(row: MyRequestRow): RequestSummary {
	return {
		id: row.id,
		type: row.type,
		status: row.status,
		existingAreaName: row.existing_area_name,
		userNote: row.user_note,
		adminNote: row.admin_note,
		submittedAt: toDateString(row.submitted_at),
		resolvedAt: row.resolved_at ? toDateString(row.resolved_at) : null,
		isTemporary: Boolean(row.is_temporary),
		startsOn: row.starts_on,
		expiresOn: row.expires_on
	};
}

export async function listMyRequests(
	executor: QueryExecutor,
	discordId: string
): Promise<RequestSummary[]> {
	const [rows] = await executor.execute<MyRequestRow[]>(
		`SELECT id, type, status, existing_area_name, user_note, admin_note, submitted_at, resolved_at,
		        is_temporary, DATE_FORMAT(starts_on, '%Y-%m-%d') AS starts_on,
		        DATE_FORMAT(expires_on, '%Y-%m-%d') AS expires_on
		 FROM area_requests
		 WHERE discord_id = ?
		 ORDER BY submitted_at DESC`,
		[discordId]
	);
	return rows.map(toRequestSummary);
}

export async function deleteMyRequest(
	executor: QueryExecutor,
	id: number,
	discordId: string
): Promise<boolean> {
	const [result] = await executor.execute<{ affectedRows: number }>(
		'DELETE FROM area_requests WHERE id = ? AND discord_id = ?',
		[id, discordId]
	);
	return result.affectedRows > 0;
}

interface AdminRequestRow {
	id: number;
	type: RequestType;
	status: RequestStatus;
	geofence: string;
	existing_area_id: number | null;
	existing_area_name: string | null;
	user_note: string;
	admin_note: string | null;
	discord_id: string;
	username: string;
	submitted_at: Date | string;
	resolved_at: Date | string | null;
	resolved_by_username: string | null;
	created_area_id: number | null;
	is_temporary: number;
	starts_on: string | null;
	expires_on: string | null;
}

function toAdminAreaRequest(row: AdminRequestRow): AdminAreaRequest {
	return {
		id: row.id,
		type: row.type,
		status: row.status,
		geofence: row.geofence,
		existingAreaId: row.existing_area_id,
		existingAreaName: row.existing_area_name,
		userNote: row.user_note,
		adminNote: row.admin_note,
		discordId: row.discord_id,
		username: row.username,
		submittedAt: toDateString(row.submitted_at),
		resolvedAt: row.resolved_at ? toDateString(row.resolved_at) : null,
		resolvedByUsername: row.resolved_by_username,
		createdAreaId: row.created_area_id,
		isTemporary: Boolean(row.is_temporary),
		startsOn: row.starts_on,
		expiresOn: row.expires_on
	};
}

export async function listRequestsForAdmin(
	executor: QueryExecutor,
	statusFilter: RequestStatus | 'all'
): Promise<AdminAreaRequest[]> {
	const whereClause = statusFilter === 'all' ? '' : 'WHERE status = ?';
	const params = statusFilter === 'all' ? [] : [statusFilter];
	const [rows] = await executor.execute<AdminRequestRow[]>(
		`SELECT id, type, status, geofence, existing_area_id, existing_area_name,
		        user_note, admin_note, discord_id, username, submitted_at,
		        resolved_at, resolved_by_username, created_area_id, is_temporary,
		        DATE_FORMAT(starts_on, '%Y-%m-%d') AS starts_on,
		        DATE_FORMAT(expires_on, '%Y-%m-%d') AS expires_on
		 FROM area_requests ${whereClause}
		 ORDER BY submitted_at DESC`,
		params
	);
	return rows.map(toAdminAreaRequest);
}

export type RequestStatusCounts = Record<RequestStatus | 'all', number>;

interface StatusCountRow {
	status: RequestStatus;
	n: number | string;
}

/** How many requests are in each status, plus the total — for the admin filter tabs. */
export async function countRequestsByStatus(executor: QueryExecutor): Promise<RequestStatusCounts> {
	const [rows] = await executor.execute<StatusCountRow[]>(
		'SELECT status, COUNT(*) AS n FROM area_requests GROUP BY status'
	);
	const counts: RequestStatusCounts = { pending: 0, approved: 0, rejected: 0, all: 0 };
	for (const row of rows) {
		if (row.status in counts) counts[row.status] = Number(row.n);
		counts.all += Number(row.n);
	}
	return counts;
}

export interface PendingRequestRow {
	type: RequestType;
	status: RequestStatus;
	discord_id: string;
	existing_area_id: number | null;
	geofence: string;
	is_temporary: number;
	starts_on: string | null;
	expires_on: string | null;
	username: string;
}

export async function getRequestById(
	executor: QueryExecutor,
	id: number
): Promise<PendingRequestRow | null> {
	const [rows] = await executor.execute<PendingRequestRow[]>(
		`SELECT type, status, discord_id, existing_area_id, geofence, is_temporary,
		        DATE_FORMAT(starts_on, '%Y-%m-%d') AS starts_on,
		        DATE_FORMAT(expires_on, '%Y-%m-%d') AS expires_on, username
		 FROM area_requests WHERE id = ?`,
		[id]
	);
	return rows[0] ?? null;
}

export async function resolveRequest(
	executor: QueryExecutor,
	id: number,
	status: 'approved' | 'rejected',
	adminNote: string | null,
	resolvedByDiscordId: string,
	resolvedByUsername: string
): Promise<void> {
	await executor.execute(
		`UPDATE area_requests
		 SET status = ?, admin_note = ?, resolved_at = NOW(),
		     resolved_by_discord_id = ?, resolved_by_username = ?
		 WHERE id = ?`,
		[status, adminNote, resolvedByDiscordId, resolvedByUsername, id]
	);
}

export async function approveAsCreated(
	executor: QueryExecutor,
	id: number,
	adminNote: string | null,
	resolvedByDiscordId: string,
	resolvedByUsername: string,
	createdAreaId: number
): Promise<void> {
	await executor.execute(
		`UPDATE area_requests
		 SET status = 'approved', admin_note = ?, resolved_at = NOW(),
		     resolved_by_discord_id = ?, resolved_by_username = ?, created_area_id = ?
		 WHERE id = ?`,
		[adminNote, resolvedByDiscordId, resolvedByUsername, createdAreaId, id]
	);
}

/**
 * Replace the geofence of a request that is still a pending addition. The
 * status/type guard in the WHERE makes this safe against a concurrent resolve;
 * returns false when no row matched.
 */
export async function updatePendingAdditionGeofence(
	executor: QueryExecutor,
	id: number,
	geofence: string
): Promise<boolean> {
	const [result] = await executor.execute<{ affectedRows: number }>(
		"UPDATE area_requests SET geofence = ? WHERE id = ? AND status = 'pending' AND type = 'addition'",
		[geofence, id]
	);
	return result.affectedRows > 0;
}
