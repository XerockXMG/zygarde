import { afterEach, describe, expect, it, vi } from 'vitest';
import { syncSubscriptionRoleChecks, type QueryExecutor } from './sync';

function fakeExecutor(): QueryExecutor & { execute: ReturnType<typeof vi.fn> } {
	return { execute: vi.fn() };
}

const requiredRoles = 'r1';
const guildIds = ['g1'];

function stubFetchWithRole(hasRole: boolean): void {
	vi.stubGlobal(
		'fetch',
		vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ roles: hasRole ? ['r1'] : ['other'] })
		})
	);
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('syncSubscriptionRoleChecks', () => {
	it('does nothing when there are no candidates (no elevated, non-overridden users)', async () => {
		const local = fakeExecutor();
		local.execute.mockResolvedValueOnce([[], undefined]); // listUserTiers

		const result = await syncSubscriptionRoleChecks(
			local,
			'bot-token',
			requiredRoles,
			guildIds,
			7,
			'No Subscription',
			0
		);

		expect(result).toEqual({ downgraded: [] });
	});

	it('skips a user with an active manual override without checking Discord', async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
		const local = fakeExecutor();
		local.execute.mockResolvedValueOnce([
			[
				{
					discord_id: 'u1',
					username: 'alice',
					tier_name: 'VIP',
					weight: 5,
					override_tier_name: 'VIP'
				}
			],
			undefined
		]);

		const result = await syncSubscriptionRoleChecks(
			local,
			'bot-token',
			requiredRoles,
			guildIds,
			7,
			'No Subscription',
			0
		);

		expect(result).toEqual({ downgraded: [] });
		expect(fetchMock).not.toHaveBeenCalled();
		expect(local.execute).toHaveBeenCalledTimes(1); // only listUserTiers
	});

	it('clears an existing failing streak when the check passes', async () => {
		stubFetchWithRole(true);
		const local = fakeExecutor();
		local.execute
			.mockResolvedValueOnce([
				[
					{
						discord_id: 'u1',
						username: 'alice',
						tier_name: 'VIP',
						weight: 5,
						override_tier_name: null
					}
				],
				undefined
			]) // listUserTiers
			.mockResolvedValueOnce([{}, undefined]); // DELETE subscription_role_checks

		const result = await syncSubscriptionRoleChecks(
			local,
			'bot-token',
			requiredRoles,
			guildIds,
			7,
			'No Subscription',
			0
		);

		expect(result).toEqual({ downgraded: [] });
		expect(local.execute).toHaveBeenCalledWith(
			expect.stringContaining('DELETE FROM subscription_role_checks'),
			['u1']
		);
	});

	it('starts the streak on a first failure without downgrading', async () => {
		stubFetchWithRole(false);
		const local = fakeExecutor();
		local.execute
			.mockResolvedValueOnce([
				[
					{
						discord_id: 'u1',
						username: 'alice',
						tier_name: 'VIP',
						weight: 5,
						override_tier_name: null
					}
				],
				undefined
			]) // listUserTiers
			.mockResolvedValueOnce([[], undefined]) // SELECT failing_since -> none yet
			.mockResolvedValueOnce([{}, undefined]); // INSERT ... ON DUPLICATE KEY UPDATE

		const result = await syncSubscriptionRoleChecks(
			local,
			'bot-token',
			requiredRoles,
			guildIds,
			7,
			'No Subscription',
			0
		);

		expect(result).toEqual({ downgraded: [] });
		expect(local.execute).toHaveBeenCalledWith(
			expect.stringContaining('INSERT INTO subscription_role_checks'),
			['u1']
		);
	});

	it('does nothing further when a failure is still within the grace period', async () => {
		stubFetchWithRole(false);
		const local = fakeExecutor();
		const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
		local.execute
			.mockResolvedValueOnce([
				[
					{
						discord_id: 'u1',
						username: 'alice',
						tier_name: 'VIP',
						weight: 5,
						override_tier_name: null
					}
				],
				undefined
			]) // listUserTiers
			.mockResolvedValueOnce([[{ failing_since: twoDaysAgo }], undefined]); // SELECT failing_since

		const result = await syncSubscriptionRoleChecks(
			local,
			'bot-token',
			requiredRoles,
			guildIds,
			7,
			'No Subscription',
			0
		);

		expect(result).toEqual({ downgraded: [] });
		expect(local.execute).toHaveBeenCalledTimes(2); // listUserTiers + the SELECT, nothing else
	});

	it('downgrades and clears the streak once a failure has exceeded the grace period', async () => {
		stubFetchWithRole(false);
		const local = fakeExecutor();
		const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
		local.execute
			.mockResolvedValueOnce([
				[
					{
						discord_id: 'u1',
						username: 'alice',
						tier_name: 'VIP',
						weight: 5,
						override_tier_name: null
					}
				],
				undefined
			]) // listUserTiers
			.mockResolvedValueOnce([[{ failing_since: eightDaysAgo }], undefined]) // SELECT failing_since
			.mockResolvedValueOnce([{}, undefined]) // applyResolvedTier: UPDATE user_tiers
			.mockResolvedValueOnce([[{ total: '0' }], undefined]) // enforceUserBudget: getUserAllocatedTotal (no-op)
			.mockResolvedValueOnce([{}, undefined]); // DELETE subscription_role_checks

		const result = await syncSubscriptionRoleChecks(
			local,
			'bot-token',
			requiredRoles,
			guildIds,
			7,
			'No Subscription',
			0
		);

		expect(result).toEqual({ downgraded: ['u1'] });
		expect(local.execute).toHaveBeenCalledWith(expect.stringContaining('UPDATE user_tiers'), [
			'No Subscription',
			0,
			'u1'
		]);
		expect(local.execute).toHaveBeenLastCalledWith(
			expect.stringContaining('DELETE FROM subscription_role_checks'),
			['u1']
		);
	});
});
