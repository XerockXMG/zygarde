/**
 * Clean up votes left on areas Dragonite no longer has. Areas are deleted in
 * Dragonite (or via Kōji), never through Zygarde, so there's no delete hook
 * to clean up in — instead the scheduler compares area_votes / area_primary
 * against Dragonite's live area list. Votes on a deleted area still count
 * against the voter's token budget (getUserAllocatedTotal sums every row), so
 * without this the tokens are stuck until an admin deletes the rows by hand.
 *
 * An area must be missing on two consecutive runs before its votes go, so a
 * single bad or partial answer from Dragonite can never wipe live votes.
 */
import type { QueryExecutor } from './votes';

export interface OrphanCleanupResult {
	/** Area ids whose votes/primaries were removed this run */
	removedAreaIds: number[];
	/** Tokens returned per voter */
	freedTokens: Record<string, number>;
	removedPrimaries: number;
	/** Missing for the first time; removed next run if still missing */
	pendingAreaIds: number[];
}

/**
 * Pure decision step: which referenced area ids are gone, and which of those
 * were already gone last run (so are safe to clean up now).
 */
export function planOrphanCleanup(
	referencedAreaIds: Iterable<number>,
	liveAreaIds: ReadonlySet<number>,
	missingLastRun: ReadonlySet<number>
): { remove: number[]; pending: number[] } {
	const remove: number[] = [];
	const pending: number[] = [];
	for (const id of new Set(referencedAreaIds)) {
		if (liveAreaIds.has(id)) continue;
		(missingLastRun.has(id) ? remove : pending).push(id);
	}
	return { remove: remove.sort((a, b) => a - b), pending: pending.sort((a, b) => a - b) };
}

interface AreaIdRow {
	area_id: number;
}

interface OrphanVoteRow {
	area_id: number;
	discord_id: string;
	amount: number | string;
}

interface DeleteResult {
	affectedRows?: number;
}

/**
 * Remove area_votes and area_primary rows for areas that were missing from
 * Dragonite on this run and the previous one. `missingLastRun` is the
 * previous result's `pendingAreaIds` plus `removedAreaIds` (kept by the caller
 * between runs). An empty live list is treated as a failed lookup: nothing is
 * removed and nothing becomes pending.
 */
export async function cleanupOrphanedVotes(
	executor: QueryExecutor,
	liveAreaIds: ReadonlySet<number>,
	missingLastRun: ReadonlySet<number>
): Promise<OrphanCleanupResult> {
	const result: OrphanCleanupResult = {
		removedAreaIds: [],
		freedTokens: {},
		removedPrimaries: 0,
		pendingAreaIds: []
	};
	if (liveAreaIds.size === 0) return result;

	const [voteAreas] = await executor.execute<AreaIdRow[]>(
		'SELECT DISTINCT area_id FROM area_votes'
	);
	const [primaryAreas] = await executor.execute<AreaIdRow[]>(
		'SELECT DISTINCT area_id FROM area_primary'
	);
	const plan = planOrphanCleanup(
		[...voteAreas, ...primaryAreas].map((r) => Number(r.area_id)),
		liveAreaIds,
		missingLastRun
	);
	result.pendingAreaIds = plan.pending;
	if (plan.remove.length === 0) return result;

	const placeholders = plan.remove.map(() => '?').join(', ');
	const [votes] = await executor.execute<OrphanVoteRow[]>(
		`SELECT area_id, discord_id, amount FROM area_votes WHERE area_id IN (${placeholders})`,
		plan.remove
	);
	for (const v of votes) {
		result.freedTokens[v.discord_id] = (result.freedTokens[v.discord_id] ?? 0) + Number(v.amount);
	}

	await executor.execute(`DELETE FROM area_votes WHERE area_id IN (${placeholders})`, plan.remove);
	const [primaryDelete] = await executor.execute<DeleteResult>(
		`DELETE FROM area_primary WHERE area_id IN (${placeholders})`,
		plan.remove
	);
	result.removedPrimaries = Number(primaryDelete?.affectedRows ?? 0);
	result.removedAreaIds = plan.remove;
	return result;
}
