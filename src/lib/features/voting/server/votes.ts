export interface QueryExecutor {
	execute<T = unknown>(sql: string, params?: unknown[]): Promise<[T, unknown]>;
}

export interface VoteDetail {
	discordId: string;
	username: string;
	tierName: string;
	isPrimary: boolean;
	amount: number;
}

interface AreaIdRow {
	area_id: number;
}

interface AmountRow {
	amount: number;
}

interface TokenTotalRow {
	area_id: number;
	total: number | string;
}

export async function getAreaTokenTotals(executor: QueryExecutor): Promise<Record<number, number>> {
	const [rows] = await executor.execute<TokenTotalRow[]>(
		'SELECT area_id, SUM(amount) as total FROM area_votes GROUP BY area_id'
	);
	const totals: Record<number, number> = {};
	for (const row of rows) totals[row.area_id] = Number(row.total);
	return totals;
}

interface AllocationRow {
	area_id: number;
	amount: number;
}

export async function getUserAllocations(
	executor: QueryExecutor,
	discordId: string
): Promise<{ allocations: Record<number, number>; primaryAreaId: number | null }> {
	const [allocRows] = await executor.execute<AllocationRow[]>(
		'SELECT area_id, amount FROM area_votes WHERE discord_id = ?',
		[discordId]
	);
	const [primaryRows] = await executor.execute<AreaIdRow[]>(
		'SELECT area_id FROM area_primary WHERE discord_id = ?',
		[discordId]
	);
	const allocations: Record<number, number> = {};
	for (const row of allocRows) allocations[row.area_id] = row.amount;
	return {
		allocations,
		primaryAreaId: primaryRows[0]?.area_id ?? null
	};
}

interface WeightRow {
	weight: number | string;
}

export async function getUserTokenBudget(
	executor: QueryExecutor,
	discordId: string
): Promise<number> {
	const [rows] = await executor.execute<WeightRow[]>(
		'SELECT weight FROM user_tiers WHERE discord_id = ?',
		[discordId]
	);
	return rows[0] ? Number(rows[0].weight) : 1;
}

interface TotalRow {
	total: number | string | null;
}

export async function getUserAllocatedTotal(
	executor: QueryExecutor,
	discordId: string
): Promise<number> {
	const [rows] = await executor.execute<TotalRow[]>(
		'SELECT SUM(amount) as total FROM area_votes WHERE discord_id = ?',
		[discordId]
	);
	return Number(rows[0]?.total ?? 0);
}

/**
 * Trims a user's existing allocations down to fit a (possibly lower) budget.
 * Called whenever a user's weight is written (login role resolution, admin
 * override set/clear) since `allocateTokens` only guards against exceeding
 * budget when *adding* tokens — nothing else ever re-checks existing
 * allocations if the budget itself shrinks. No-ops when already within
 * budget. Preserves the primary area's allocation first (clamped to the new
 * budget), then spends whatever's left oldest-first across the rest,
 * partially reducing a row's amount if only part of it fits, and fully
 * deleting (with the same area_primary cascade `allocateTokens` uses) once
 * budget runs out.
 */
export async function enforceUserBudget(
	executor: QueryExecutor,
	discordId: string,
	budget: number
): Promise<void> {
	const total = await getUserAllocatedTotal(executor, discordId);
	if (total <= budget) return;

	const [rows] = await executor.execute<AllocationRow[]>(
		'SELECT area_id, amount FROM area_votes WHERE discord_id = ? ORDER BY voted_at ASC',
		[discordId]
	);
	const [primaryRows] = await executor.execute<AreaIdRow[]>(
		'SELECT area_id FROM area_primary WHERE discord_id = ?',
		[discordId]
	);
	const primaryAreaId = primaryRows[0]?.area_id ?? null;

	let remaining = budget;
	const newAmounts = new Map<number, number>();

	const primaryRow =
		primaryAreaId != null ? rows.find((r) => r.area_id === primaryAreaId) : undefined;
	if (primaryRow) {
		const kept = Math.min(primaryRow.amount, remaining);
		newAmounts.set(primaryRow.area_id, kept);
		remaining -= kept;
	}

	for (const row of rows) {
		if (row.area_id === primaryAreaId) continue;
		const kept = Math.max(0, Math.min(row.amount, remaining));
		newAmounts.set(row.area_id, kept);
		remaining -= kept;
	}

	for (const row of rows) {
		const kept = newAmounts.get(row.area_id) ?? 0;
		if (kept === row.amount) continue;

		if (kept === 0) {
			await executor.execute('DELETE FROM area_votes WHERE area_id = ? AND discord_id = ?', [
				row.area_id,
				discordId
			]);
			await executor.execute('DELETE FROM area_primary WHERE discord_id = ? AND area_id = ?', [
				discordId,
				row.area_id
			]);
		} else {
			await executor.execute(
				'UPDATE area_votes SET amount = ? WHERE area_id = ? AND discord_id = ?',
				[kept, row.area_id, discordId]
			);
		}
	}
}

export class TokenBudgetExceededError extends Error {
	constructor(message = 'Token budget exceeded') {
		super(message);
		this.name = 'TokenBudgetExceededError';
	}
}

/** Returns the amount the user previously had on this area (0 if none). */
export async function allocateTokens(
	executor: QueryExecutor,
	areaId: number,
	discordId: string,
	username: string,
	amount: number
): Promise<number> {
	if (!Number.isInteger(amount) || amount < 0) {
		throw new Error('Token amount must be a non-negative integer');
	}

	const budget = await getUserTokenBudget(executor, discordId);
	const allocatedTotal = await getUserAllocatedTotal(executor, discordId);
	const [existing] = await executor.execute<AmountRow[]>(
		'SELECT amount FROM area_votes WHERE area_id = ? AND discord_id = ?',
		[areaId, discordId]
	);
	const currentAmount = existing[0]?.amount ?? 0;
	const allocatedElsewhere = allocatedTotal - currentAmount;

	if (allocatedElsewhere + amount > budget) {
		throw new TokenBudgetExceededError(
			`Allocating ${amount} token(s) here would exceed your budget of ${budget}`
		);
	}

	if (amount === 0) {
		await executor.execute('DELETE FROM area_votes WHERE area_id = ? AND discord_id = ?', [
			areaId,
			discordId
		]);
		await executor.execute('DELETE FROM area_primary WHERE discord_id = ? AND area_id = ?', [
			discordId,
			areaId
		]);
		return currentAmount;
	}

	await executor.execute(
		`INSERT INTO area_votes (area_id, discord_id, username, amount)
		 VALUES (?, ?, ?, ?)
		 ON DUPLICATE KEY UPDATE amount = VALUES(amount), username = VALUES(username)`,
		[areaId, discordId, username, amount]
	);
	return currentAmount;
}

/** Returns true if a token had to be auto-allocated to make the area primary. */
export async function setPrimary(
	executor: QueryExecutor,
	areaId: number,
	discordId: string,
	username: string
): Promise<boolean> {
	if (areaId === 0) {
		await executor.execute('DELETE FROM area_primary WHERE discord_id = ?', [discordId]);
		return false;
	}

	const [existing] = await executor.execute<AmountRow[]>(
		'SELECT amount FROM area_votes WHERE area_id = ? AND discord_id = ? AND amount > 0',
		[areaId, discordId]
	);

	const autoAllocated = existing.length === 0;
	if (autoAllocated) {
		await allocateTokens(executor, areaId, discordId, username, 1);
	}

	await executor.execute(
		`INSERT INTO area_primary (discord_id, area_id)
		 VALUES (?, ?)
		 ON DUPLICATE KEY UPDATE area_id = VALUES(area_id), set_at = NOW()`,
		[discordId, areaId]
	);
	return autoAllocated;
}

interface VoteDetailRow {
	area_id: number;
	discord_id: string;
	username: string;
	tier_name: string | null;
	is_primary: number;
	amount: number;
}

export async function getAllVoteDetails(
	executor: QueryExecutor
): Promise<Record<number, VoteDetail[]>> {
	const [rows] = await executor.execute<VoteDetailRow[]>(
		`SELECT av.area_id AS area_id, av.discord_id AS discord_id, av.username AS username,
		        av.amount AS amount, ut.tier_name AS tier_name,
		        IF(ap.discord_id IS NOT NULL, 1, 0) AS is_primary
		 FROM area_votes av
		 LEFT JOIN user_tiers ut ON av.discord_id = ut.discord_id
		 LEFT JOIN area_primary ap ON av.area_id = ap.area_id AND av.discord_id = ap.discord_id
		 ORDER BY av.voted_at DESC`
	);
	const result: Record<number, VoteDetail[]> = {};
	for (const row of rows) {
		if (!result[row.area_id]) result[row.area_id] = [];
		result[row.area_id].push({
			discordId: row.discord_id,
			username: row.username,
			tierName: row.tier_name ?? 'Default',
			isPrimary: Boolean(row.is_primary),
			amount: row.amount
		});
	}
	return result;
}

export async function upsertUserTier(
	executor: QueryExecutor,
	discordId: string,
	username: string,
	tierName: string,
	weight: number
): Promise<void> {
	await executor.execute(
		`INSERT INTO user_tiers (discord_id, username, tier_name, weight)
		 VALUES (?, ?, ?, ?)
		 ON DUPLICATE KEY UPDATE username = VALUES(username), tier_name = VALUES(tier_name), weight = VALUES(weight)`,
		[discordId, username, tierName, weight]
	);
	await enforceUserBudget(executor, discordId, weight);
}

interface TierNameRow {
	tier_name: string;
}

export async function getUserTierOverride(
	executor: QueryExecutor,
	discordId: string
): Promise<string | null> {
	const [rows] = await executor.execute<TierNameRow[]>(
		'SELECT tier_name FROM user_tier_overrides WHERE discord_id = ?',
		[discordId]
	);
	return rows[0]?.tier_name ?? null;
}

export async function setTierOverride(
	executor: QueryExecutor,
	discordId: string,
	tierName: string,
	setBy: string
): Promise<void> {
	await executor.execute(
		`INSERT INTO user_tier_overrides (discord_id, tier_name, set_by)
		 VALUES (?, ?, ?)
		 ON DUPLICATE KEY UPDATE tier_name = VALUES(tier_name), set_by = VALUES(set_by), set_at = NOW()`,
		[discordId, tierName, setBy]
	);
}

export async function clearTierOverride(executor: QueryExecutor, discordId: string): Promise<void> {
	await executor.execute('DELETE FROM user_tier_overrides WHERE discord_id = ?', [discordId]);
}

export async function applyResolvedTier(
	executor: QueryExecutor,
	discordId: string,
	tierName: string,
	weight: number
): Promise<void> {
	await executor.execute('UPDATE user_tiers SET tier_name = ?, weight = ? WHERE discord_id = ?', [
		tierName,
		weight,
		discordId
	]);
	await enforceUserBudget(executor, discordId, weight);
}

export interface TierListEntry {
	discordId: string;
	username: string;
	tierName: string;
	weight: number;
	source: 'override' | 'role';
}

interface TierListRow {
	discord_id: string;
	username: string;
	tier_name: string;
	weight: number | string;
	override_tier_name: string | null;
}

export async function listUserTiers(executor: QueryExecutor): Promise<TierListEntry[]> {
	const [rows] = await executor.execute<TierListRow[]>(
		`SELECT ut.discord_id AS discord_id, ut.username AS username, ut.tier_name AS tier_name,
		        ut.weight AS weight, uto.tier_name AS override_tier_name
		 FROM user_tiers ut
		 LEFT JOIN user_tier_overrides uto ON ut.discord_id = uto.discord_id
		 ORDER BY ut.username ASC`
	);
	return rows.map((row) => ({
		discordId: row.discord_id,
		username: row.username,
		tierName: row.tier_name,
		weight: Number(row.weight),
		source: row.override_tier_name ? ('override' as const) : ('role' as const)
	}));
}
