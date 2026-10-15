import { afterEach, describe, expect, it, vi } from 'vitest';

const mockEnv: Record<string, string | undefined> = {};
vi.mock('$env/dynamic/private', () => ({ env: mockEnv }));

const { isTruthy, alertWebhookUrl, postAlert } = await import('./alerts');

const URL = 'https://discord.test/webhook';

afterEach(() => {
	vi.unstubAllGlobals();
	for (const k of Object.keys(mockEnv)) delete mockEnv[k];
});

describe('isTruthy', () => {
	it('accepts true/1/yes/on in any case, rejects everything else', () => {
		for (const v of ['true', 'TRUE', ' True ', '1', 'yes', 'on']) expect(isTruthy(v)).toBe(true);
		for (const v of [undefined, '', 'false', '0', 'no', 'off', 'nope'])
			expect(isTruthy(v)).toBe(false);
	});
});

describe('alertWebhookUrl', () => {
	it('returns null when no alert webhook is set, even with the toggle on', () => {
		mockEnv.ALERT_TOKEN_CHANGES = 'true';
		expect(alertWebhookUrl('tokenChanges')).toBeNull();
	});

	it('returns null when the webhook is set but the event toggle is unset or false', () => {
		mockEnv.DISCORD_ALERT_WEBHOOK_URL = URL;
		expect(alertWebhookUrl('tokenChanges')).toBeNull();
		mockEnv.ALERT_TOKEN_CHANGES = 'false';
		expect(alertWebhookUrl('tokenChanges')).toBeNull();
	});

	it('gates each event on its own toggle', () => {
		mockEnv.DISCORD_ALERT_WEBHOOK_URL = URL;
		mockEnv.ALERT_AREA_REQUESTS = 'true';
		expect(alertWebhookUrl('areaRequests')).toBe(URL);
		expect(alertWebhookUrl('tokenChanges')).toBeNull();
	});
});

describe('postAlert', () => {
	it('does not call fetch when the event is toggled off', async () => {
		mockEnv.DISCORD_ALERT_WEBHOOK_URL = URL;
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
		await postAlert('areaRequests', [{ title: 'x' }]);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('POSTs JSON embeds when enabled, and multipart when an image is attached', async () => {
		mockEnv.DISCORD_ALERT_WEBHOOK_URL = URL;
		mockEnv.ALERT_AREA_REQUESTS = 'true';
		const fetchMock = vi.fn().mockResolvedValue({ ok: true });
		vi.stubGlobal('fetch', fetchMock);

		await postAlert('areaRequests', [{ title: 'x' }]);
		expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ embeds: [{ title: 'x' }] });

		await postAlert('areaRequests', [{ title: 'y' }], {
			filename: 'preview.png',
			png: Buffer.from([1, 2, 3])
		});
		expect(fetchMock.mock.calls[1][1].body).toBeInstanceOf(FormData);
	});

	it('swallows fetch errors', async () => {
		mockEnv.DISCORD_ALERT_WEBHOOK_URL = URL;
		mockEnv.ALERT_TOKEN_CHANGES = 'true';
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
		await expect(postAlert('tokenChanges', [{ title: 'x' }])).resolves.toBeUndefined();
	});
});
