import { describe, expect, it, vi } from 'vitest';
import {
	getVotingSettings,
	setVotingSettings,
	setAutoscaleInterval,
	DEFAULT_VOTING_SETTINGS,
	type QueryExecutor
} from './settings';

function fakeExecutor(): QueryExecutor & { execute: ReturnType<typeof vi.fn> } {
	return { execute: vi.fn() };
}

describe('getVotingSettings', () => {
	it('returns the stored row, mapped to camelCase', async () => {
		const executor = fakeExecutor();
		executor.execute.mockResolvedValueOnce([
			[
				{
					workers_per_token: 5,
					subscription_grace_period_days: 14,
					autoscale_interval_minutes: 30
				}
			],
			undefined
		]);

		const result = await getVotingSettings(executor);

		expect(result).toEqual({
			workersPerToken: 5,
			subscriptionGracePeriodDays: 14,
			autoscaleIntervalMinutes: 30
		});
		expect(executor.execute).toHaveBeenCalledWith(expect.stringContaining('FROM voting_settings'));
	});

	it('returns the defaults when no row exists yet', async () => {
		const executor = fakeExecutor();
		executor.execute.mockResolvedValueOnce([[], undefined]);

		const result = await getVotingSettings(executor);

		expect(result).toEqual(DEFAULT_VOTING_SETTINGS);
	});
});

describe('setVotingSettings', () => {
	it('upserts only the workers-per-token and grace-period columns', async () => {
		const executor = fakeExecutor();
		executor.execute.mockResolvedValueOnce([{}, undefined]);

		await setVotingSettings(executor, 7, 10);

		const [sql, params] = executor.execute.mock.calls[0];
		expect(sql).toContain('INSERT INTO voting_settings');
		expect(sql).toContain('ON DUPLICATE KEY UPDATE');
		expect(sql).not.toContain('autoscale_interval_minutes');
		expect(params).toEqual([7, 10]);
	});
});

describe('setAutoscaleInterval', () => {
	it('upserts only the autoscale interval column', async () => {
		const executor = fakeExecutor();
		executor.execute.mockResolvedValueOnce([{}, undefined]);

		await setAutoscaleInterval(executor, 20);

		const [sql, params] = executor.execute.mock.calls[0];
		expect(sql).toContain('INSERT INTO voting_settings');
		expect(sql).toContain('ON DUPLICATE KEY UPDATE autoscale_interval_minutes');
		expect(sql).not.toContain('workers_per_token');
		expect(sql).not.toContain('subscription_grace_period_days');
		expect(params).toEqual([20]);
	});
});
