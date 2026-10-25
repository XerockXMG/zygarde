import { describe, expect, it, vi } from 'vitest';
import {
	getAreaTokenTotals,
	getUserAllocations,
	getUserTokenBudget,
	getUserAllocatedTotal,
	enforceUserBudget,
	allocateTokens,
	TokenBudgetExceededError,
	setPrimary,
	getAllVoteDetails,
	upsertUserTier,
	getUserTierOverride,
	setTierOverride,
	clearTierOverride,
	applyResolvedTier,
	listUserTiers,
	type QueryExecutor
} from './votes';

function fakeExecutor(): QueryExecutor & { execute: ReturnType<typeof vi.fn> } {
	return { execute: vi.fn() };
}

describe('getAreaTokenTotals', () => {
	it('sums amount per area id, coercing the SUM() result to a number', async () => {
		const executor = fakeExecutor();
		executor.execute.mockResolvedValueOnce([
			[
				{ area_id: 1, total: '3' },
				{ area_id: 2, total: 1 }
			],
			undefined
		]);
		await expect(getAreaTokenTotals(executor)).resolves.toEqual({ 1: 3, 2: 1 });
	});
});

describe('getUserAllocations', () => {
	it("combines this user's allocations and their primary area id", async () => {
		const executor = fakeExecutor();
		executor.execute
			.mockResolvedValueOnce([
				[
					{ area_id: 1, amount: 2 },
					{ area_id: 2, amount: 1 }
				],
				undefined
			])
			.mockResolvedValueOnce([[{ area_id: 2 }], undefined]);
		await expect(getUserAllocations(executor, 'u1')).resolves.toEqual({
			allocations: { 1: 2, 2: 1 },
			primaryAreaId: 2
		});
	});

	it('returns null primaryAreaId when there is no primary row', async () => {
		const executor = fakeExecutor();
		executor.execute
			.mockResolvedValueOnce([[{ area_id: 1, amount: 1 }], undefined])
			.mockResolvedValueOnce([[], undefined]);
		await expect(getUserAllocations(executor, 'u1')).resolves.toEqual({
			allocations: { 1: 1 },
			primaryAreaId: null
		});
	});
});

describe('getUserTokenBudget', () => {
	it("returns the user's tier weight, coerced to a number", async () => {
		const executor = fakeExecutor();
		executor.execute.mockResolvedValueOnce([[{ weight: '5' }], undefined]);
		await expect(getUserTokenBudget(executor, 'u1')).resolves.toBe(5);
	});

	it('defaults to 1 when the user has no tier row', async () => {
		const executor = fakeExecutor();
		executor.execute.mockResolvedValueOnce([[], undefined]);
		await expect(getUserTokenBudget(executor, 'u1')).resolves.toBe(1);
	});
});

describe('getUserAllocatedTotal', () => {
	it("sums this user's amount across all areas, coercing the SUM() result", async () => {
		const executor = fakeExecutor();
		executor.execute.mockResolvedValueOnce([[{ total: '4' }], undefined]);
		await expect(getUserAllocatedTotal(executor, 'u1')).resolves.toBe(4);
	});

	it('returns 0 when the user has no votes (SUM() is NULL)', async () => {
		const executor = fakeExecutor();
		executor.execute.mockResolvedValueOnce([[{ total: null }], undefined]);
		await expect(getUserAllocatedTotal(executor, 'u1')).resolves.toBe(0);
	});
});

describe('enforceUserBudget', () => {
	it('does nothing when the user is already within budget', async () => {
		const executor = fakeExecutor();
		executor.execute.mockResolvedValueOnce([[{ total: '3' }], undefined]); // getUserAllocatedTotal

		await enforceUserBudget(executor, 'u1', 5);

		expect(executor.execute).toHaveBeenCalledTimes(1);
	});

	it("preserves the primary area's allocation first, then spends remaining budget oldest-first, partially reducing a non-primary row", async () => {
		const executor = fakeExecutor();
		executor.execute
			.mockResolvedValueOnce([[{ total: '4' }], undefined]) // getUserAllocatedTotal
			.mockResolvedValueOnce([
				[
					{ area_id: 10, amount: 2 },
					{ area_id: 20, amount: 2 }
				],
				undefined
			]) // area_votes, oldest (10) first; 20 is primary but voted later
			.mockResolvedValueOnce([[{ area_id: 20 }], undefined]) // area_primary
			.mockResolvedValueOnce([{}, undefined]); // UPDATE area 10

		await enforceUserBudget(executor, 'u1', 3);

		expect(executor.execute).toHaveBeenCalledWith(expect.stringContaining('UPDATE area_votes'), [
			1,
			10,
			'u1'
		]);
		expect(executor.execute).toHaveBeenCalledTimes(4);
	});

	it('fully deletes a row (and cascades to area_primary) when its allocation is reduced to zero', async () => {
		const executor = fakeExecutor();
		executor.execute
			.mockResolvedValueOnce([[{ total: '3' }], undefined]) // getUserAllocatedTotal
			.mockResolvedValueOnce([[{ area_id: 5, amount: 3 }], undefined]) // area_votes
			.mockResolvedValueOnce([[], undefined]) // area_primary (none)
			.mockResolvedValueOnce([{}, undefined]) // DELETE area_votes
			.mockResolvedValueOnce([{}, undefined]); // DELETE area_primary

		await enforceUserBudget(executor, 'u1', 0);

		expect(executor.execute).toHaveBeenCalledWith(
			expect.stringContaining('DELETE FROM area_votes'),
			[5, 'u1']
		);
		expect(executor.execute).toHaveBeenCalledWith(
			expect.stringContaining('DELETE FROM area_primary'),
			['u1', 5]
		);
	});

	it('spends budget oldest-first when no primary area is set, partially reducing one row then fully dropping a later one', async () => {
		const executor = fakeExecutor();
		executor.execute
			.mockResolvedValueOnce([[{ total: '6' }], undefined]) // getUserAllocatedTotal
			.mockResolvedValueOnce([
				[
					{ area_id: 1, amount: 2 },
					{ area_id: 2, amount: 2 },
					{ area_id: 3, amount: 2 }
				],
				undefined
			]) // area_votes, oldest first
			.mockResolvedValueOnce([[], undefined]) // area_primary (none)
			.mockResolvedValueOnce([{}, undefined]) // UPDATE area 2
			.mockResolvedValueOnce([{}, undefined]) // DELETE area_votes area 3
			.mockResolvedValueOnce([{}, undefined]); // DELETE area_primary area 3

		await enforceUserBudget(executor, 'u1', 3);

		expect(executor.execute).toHaveBeenCalledWith(expect.stringContaining('UPDATE area_votes'), [
			1,
			2,
			'u1'
		]);
		expect(executor.execute).toHaveBeenCalledWith(
			expect.stringContaining('DELETE FROM area_votes'),
			[3, 'u1']
		);
	});
});

describe('allocateTokens', () => {
	it('rejects a non-integer or negative amount without querying the database', async () => {
		const executor = fakeExecutor();
		await expect(allocateTokens(executor, 5, 'u1', 'tester', -1)).rejects.toThrow();
		await expect(allocateTokens(executor, 5, 'u1', 'tester', 1.5)).rejects.toThrow();
		expect(executor.execute).not.toHaveBeenCalled();
	});

	it('upserts the allocation when the new total is within budget', async () => {
		const executor = fakeExecutor();
		executor.execute
			.mockResolvedValueOnce([[{ weight: 5 }], undefined]) // budget
			.mockResolvedValueOnce([[{ total: '2' }], undefined]) // allocated total (elsewhere)
			.mockResolvedValueOnce([[], undefined]) // existing amount on this area
			.mockResolvedValueOnce([{}, undefined]); // INSERT

		await expect(allocateTokens(executor, 5, 'u1', 'tester', 3)).resolves.toBe(0);

		expect(executor.execute).toHaveBeenCalledWith(
			expect.stringContaining('INSERT INTO area_votes'),
			[5, 'u1', 'tester', 3]
		);
	});

	it('throws TokenBudgetExceededError when the new total would exceed budget', async () => {
		const executor = fakeExecutor();
		executor.execute
			.mockResolvedValueOnce([[{ weight: 3 }], undefined]) // budget
			.mockResolvedValueOnce([[{ total: '3' }], undefined]) // allocated total (all elsewhere)
			.mockResolvedValueOnce([[], undefined]); // existing amount on this area

		await expect(allocateTokens(executor, 5, 'u1', 'tester', 2)).rejects.toBeInstanceOf(
			TokenBudgetExceededError
		);
		expect(executor.execute).toHaveBeenCalledTimes(3);
	});

	it('serializes parallel allocations from one user so the budget cannot be overspent', async () => {
		// A tiny in-memory area_votes table; each query yields to the event loop first so
		// unserialized calls would interleave their budget checks.
		const votes = new Map<number, number>();
		const tick = () => new Promise((r) => setTimeout(r, 0));
		const executor: QueryExecutor = {
			execute: vi.fn(async (sql: string, params?: unknown[]) => {
				await tick();
				if (sql.includes('FROM user_tiers')) return [[{ weight: 3 }], undefined];
				if (sql.includes('SUM(amount)')) {
					const total = [...votes.values()].reduce((a, b) => a + b, 0);
					return [[{ total }], undefined];
				}
				if (sql.startsWith('SELECT amount FROM area_votes')) {
					const amount = votes.get(params![0] as number);
					return [amount === undefined ? [] : [{ amount }], undefined];
				}
				if (sql.includes('INSERT INTO area_votes')) {
					votes.set(params![0] as number, params![3] as number);
				}
				return [{}, undefined];
			}) as unknown as QueryExecutor['execute']
		};

		const results = await Promise.allSettled(
			[1, 2, 3, 4, 5].map((areaId) => allocateTokens(executor, areaId, 'u1', 'tester', 3))
		);

		expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
		expect([...votes.values()].reduce((a, b) => a + b, 0)).toBe(3);
	});

	it('deletes the allocation and cascades to area_primary when amount is 0', async () => {
		const executor = fakeExecutor();
		executor.execute
			.mockResolvedValueOnce([[{ weight: 5 }], undefined]) // budget
			.mockResolvedValueOnce([[{ total: '3' }], undefined]) // allocated total (includes this area's 3)
			.mockResolvedValueOnce([[{ amount: 3 }], undefined]) // existing amount on this area
			.mockResolvedValueOnce([{}, undefined]) // DELETE area_votes
			.mockResolvedValueOnce([{}, undefined]); // DELETE area_primary

		await expect(allocateTokens(executor, 5, 'u1', 'tester', 0)).resolves.toBe(3);

		expect(executor.execute).toHaveBeenCalledWith(
			expect.stringContaining('DELETE FROM area_votes'),
			[5, 'u1']
		);
		expect(executor.execute).toHaveBeenCalledWith(
			expect.stringContaining('DELETE FROM area_primary'),
			['u1', 5]
		);
	});

	it('allows moving tokens from one area to another within budget', async () => {
		const executor = fakeExecutor();
		// Step 1: reduce area A (id 1) from 3 down to 1.
		executor.execute
			.mockResolvedValueOnce([[{ weight: 3 }], undefined]) // budget
			.mockResolvedValueOnce([[{ total: '3' }], undefined]) // allocated total (all on area A)
			.mockResolvedValueOnce([[{ amount: 3 }], undefined]) // existing amount on area A
			.mockResolvedValueOnce([{}, undefined]); // INSERT (update area A to 1)

		await expect(allocateTokens(executor, 1, 'u1', 'tester', 1)).resolves.toBe(3);

		expect(executor.execute).toHaveBeenLastCalledWith(
			expect.stringContaining('INSERT INTO area_votes'),
			[1, 'u1', 'tester', 1]
		);

		// Step 2: allocate the freed-up tokens to area B (id 2).
		executor.execute
			.mockResolvedValueOnce([[{ weight: 3 }], undefined]) // budget
			.mockResolvedValueOnce([[{ total: '1' }], undefined]) // allocated total (now just area A's 1)
			.mockResolvedValueOnce([[], undefined]) // existing amount on area B
			.mockResolvedValueOnce([{}, undefined]); // INSERT

		await allocateTokens(executor, 2, 'u1', 'tester', 2);

		expect(executor.execute).toHaveBeenLastCalledWith(
			expect.stringContaining('INSERT INTO area_votes'),
			[2, 'u1', 'tester', 2]
		);
	});
});

describe('setPrimary', () => {
	it('deletes the primary row when areaId is 0', async () => {
		const executor = fakeExecutor();
		executor.execute.mockResolvedValueOnce([{}, undefined]);

		await expect(setPrimary(executor, 0, 'u1', 'tester')).resolves.toBe(false);

		expect(executor.execute).toHaveBeenCalledTimes(1);
		expect(executor.execute).toHaveBeenCalledWith(
			expect.stringContaining('DELETE FROM area_primary'),
			['u1']
		);
	});

	it('auto-allocates 1 token and upserts the primary row when the user has no allocation there', async () => {
		const executor = fakeExecutor();
		executor.execute
			.mockResolvedValueOnce([[], undefined]) // existing allocation check (none)
			.mockResolvedValueOnce([[{ weight: 5 }], undefined]) // allocateTokens: budget
			.mockResolvedValueOnce([[{ total: '0' }], undefined]) // allocateTokens: allocated total
			.mockResolvedValueOnce([[], undefined]) // allocateTokens: existing amount on this area
			.mockResolvedValueOnce([{}, undefined]) // allocateTokens: INSERT
			.mockResolvedValueOnce([{}, undefined]); // upsert area_primary

		await expect(setPrimary(executor, 7, 'u1', 'tester')).resolves.toBe(true);

		expect(executor.execute).toHaveBeenCalledWith(
			expect.stringContaining('INSERT INTO area_votes'),
			[7, 'u1', 'tester', 1]
		);
		expect(executor.execute).toHaveBeenCalledWith(
			expect.stringContaining('ON DUPLICATE KEY UPDATE area_id'),
			['u1', 7]
		);
	});

	it('throws TokenBudgetExceededError when auto-allocation would exceed budget', async () => {
		const executor = fakeExecutor();
		executor.execute
			.mockResolvedValueOnce([[], undefined]) // existing allocation check (none)
			.mockResolvedValueOnce([[{ weight: 1 }], undefined]) // allocateTokens: budget
			.mockResolvedValueOnce([[{ total: '1' }], undefined]) // allocateTokens: allocated total (already at budget)
			.mockResolvedValueOnce([[], undefined]); // allocateTokens: existing amount on this area

		await expect(setPrimary(executor, 7, 'u1', 'tester')).rejects.toBeInstanceOf(
			TokenBudgetExceededError
		);
		expect(executor.execute).not.toHaveBeenCalledWith(
			expect.stringContaining('INSERT INTO area_primary'),
			expect.anything()
		);
	});

	it('only upserts the primary row (no re-allocation) when the user already has an allocation there', async () => {
		const executor = fakeExecutor();
		executor.execute
			.mockResolvedValueOnce([[{ amount: 3 }], undefined]) // existing allocation check (found)
			.mockResolvedValueOnce([{}, undefined]); // upsert area_primary

		await expect(setPrimary(executor, 7, 'u1', 'tester')).resolves.toBe(false);

		expect(executor.execute).toHaveBeenCalledTimes(2);
		expect(executor.execute).toHaveBeenCalledWith(
			expect.stringContaining('ON DUPLICATE KEY UPDATE area_id'),
			['u1', 7]
		);
	});
});

describe('getAllVoteDetails', () => {
	it('groups voter rows by area id, including amount, defaulting a missing tier name to "Default"', async () => {
		const executor = fakeExecutor();
		executor.execute.mockResolvedValueOnce([
			[
				{
					area_id: 1,
					discord_id: 'u1',
					username: 'alice',
					tier_name: 'VIP',
					is_primary: 1,
					amount: 3
				},
				{
					area_id: 1,
					discord_id: 'u2',
					username: 'bob',
					tier_name: null,
					is_primary: 0,
					amount: 1
				},
				{
					area_id: 2,
					discord_id: 'u3',
					username: 'carol',
					tier_name: 'Free',
					is_primary: 0,
					amount: 2
				}
			],
			undefined
		]);

		await expect(getAllVoteDetails(executor)).resolves.toEqual({
			1: [
				{ discordId: 'u1', username: 'alice', tierName: 'VIP', isPrimary: true, amount: 3 },
				{ discordId: 'u2', username: 'bob', tierName: 'Default', isPrimary: false, amount: 1 }
			],
			2: [{ discordId: 'u3', username: 'carol', tierName: 'Free', isPrimary: false, amount: 2 }]
		});
	});
});

describe('upsertUserTier', () => {
	it('sends an INSERT ... ON DUPLICATE KEY UPDATE with the given values, then enforces the new budget', async () => {
		const executor = fakeExecutor();
		executor.execute
			.mockResolvedValueOnce([{}, undefined]) // INSERT ... ON DUPLICATE KEY UPDATE
			.mockResolvedValueOnce([[{ total: '0' }], undefined]); // enforceUserBudget: already within budget

		await upsertUserTier(executor, 'u1', 'tester', 'VIP', 5);

		expect(executor.execute).toHaveBeenCalledWith(
			expect.stringContaining('ON DUPLICATE KEY UPDATE'),
			['u1', 'tester', 'VIP', 5]
		);
		expect(executor.execute).toHaveBeenCalledTimes(2);
	});
});

describe('getUserTierOverride', () => {
	it('returns the tier name when an override exists', async () => {
		const executor = fakeExecutor();
		executor.execute.mockResolvedValueOnce([[{ tier_name: 'VIP' }], undefined]);
		await expect(getUserTierOverride(executor, 'u1')).resolves.toBe('VIP');
	});

	it('returns null when no override exists', async () => {
		const executor = fakeExecutor();
		executor.execute.mockResolvedValueOnce([[], undefined]);
		await expect(getUserTierOverride(executor, 'u1')).resolves.toBeNull();
	});
});

describe('setTierOverride', () => {
	it('sends an INSERT ... ON DUPLICATE KEY UPDATE with the given values', async () => {
		const executor = fakeExecutor();
		executor.execute.mockResolvedValueOnce([{}, undefined]);

		await setTierOverride(executor, 'u1', 'VIP', 'admin1');

		expect(executor.execute).toHaveBeenCalledWith(
			expect.stringContaining('INSERT INTO user_tier_overrides'),
			['u1', 'VIP', 'admin1']
		);
	});
});

describe('clearTierOverride', () => {
	it('deletes the override row for the given user', async () => {
		const executor = fakeExecutor();
		executor.execute.mockResolvedValueOnce([{}, undefined]);

		await clearTierOverride(executor, 'u1');

		expect(executor.execute).toHaveBeenCalledWith(
			expect.stringContaining('DELETE FROM user_tier_overrides'),
			['u1']
		);
	});
});

describe('applyResolvedTier', () => {
	it('updates the tier_name and weight for the given user, then enforces the new budget', async () => {
		const executor = fakeExecutor();
		executor.execute
			.mockResolvedValueOnce([{}, undefined]) // UPDATE user_tiers
			.mockResolvedValueOnce([[{ total: '0' }], undefined]); // enforceUserBudget: already within budget

		await applyResolvedTier(executor, 'u1', 'VIP', 5);

		expect(executor.execute).toHaveBeenCalledWith(expect.stringContaining('UPDATE user_tiers'), [
			'VIP',
			5,
			'u1'
		]);
		expect(executor.execute).toHaveBeenCalledTimes(2);
	});
});

describe('listUserTiers', () => {
	it('marks a user as "override" when an override row exists, "role" otherwise, coercing weight to a number', async () => {
		const executor = fakeExecutor();
		executor.execute.mockResolvedValueOnce([
			[
				{
					discord_id: 'u1',
					username: 'alice',
					tier_name: 'VIP',
					weight: 5,
					override_tier_name: 'VIP'
				},
				{
					discord_id: 'u2',
					username: 'bob',
					tier_name: 'Free',
					weight: '1',
					override_tier_name: null
				}
			],
			undefined
		]);

		await expect(listUserTiers(executor)).resolves.toEqual([
			{ discordId: 'u1', username: 'alice', tierName: 'VIP', weight: 5, source: 'override' },
			{ discordId: 'u2', username: 'bob', tierName: 'Free', weight: 1, source: 'role' }
		]);
	});
});
