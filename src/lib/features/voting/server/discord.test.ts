import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GeoJsonGeometry } from '$lib/features/area-management/types';

const postAlert = vi.fn();
const alertWebhookUrl = vi.fn();
vi.mock('$lib/server/alerts', () => ({ postAlert, alertWebhookUrl }));
const generateMapPreview = vi.fn();
vi.mock('$lib/features/area-requests/server/mappreview', () => ({ generateMapPreview }));

const { buildTokenChangeEmbed, sendTokenWebhook } = await import('./discord');

const GEOFENCE: GeoJsonGeometry = {
	type: 'Polygon',
	coordinates: [
		[
			[0, 0],
			[1, 0],
			[1, 1],
			[0, 0]
		]
	]
};
const base = {
	username: 'tester',
	areaName: 'Downtown',
	areaTotal: 7,
	target: null,
	geofence: null
};

afterEach(() => {
	postAlert.mockReset();
	alertWebhookUrl.mockReset();
	generateMapPreview.mockReset();
});

describe('buildTokenChangeEmbed', () => {
	it('describes an increase as "Tokens Added" with a signed delta', () => {
		const embed = buildTokenChangeEmbed({ ...base, previousAmount: 1, newAmount: 3 });
		expect(embed.title).toBe('Tokens Added');
		expect(embed.fields).toContainEqual({ name: 'Change', value: '+2 (1 → 3)', inline: true });
		expect(embed.fields).toContainEqual({ name: 'Area total', value: '7', inline: true });
	});

	it('describes a decrease (including removing all tokens) as "Tokens Removed"', () => {
		const embed = buildTokenChangeEmbed({ ...base, previousAmount: 3, newAmount: 0 });
		expect(embed.title).toBe('Tokens Removed');
		expect(embed.fields).toContainEqual({ name: 'Change', value: '-3 (3 → 0)', inline: true });
	});

	it('omits the target field when the area has no target', () => {
		const embed = buildTokenChangeEmbed({ ...base, previousAmount: 0, newAmount: 1 });
		const names = (embed.fields as { name: string }[]).map((f) => f.name);
		expect(names).not.toContain('Token target');
	});

	it('shows the target with % funded when one is set', () => {
		const embed = buildTokenChangeEmbed({ ...base, target: 10, previousAmount: 0, newAmount: 1 });
		expect(embed.fields).toContainEqual({
			name: 'Token target',
			value: '10 (70% funded)',
			inline: true
		});
	});

	it('shows a zero target without a % (no divide-by-zero)', () => {
		const embed = buildTokenChangeEmbed({ ...base, target: 0, previousAmount: 0, newAmount: 1 });
		expect(embed.fields).toContainEqual({ name: 'Token target', value: '0', inline: true });
	});
});

describe('sendTokenWebhook', () => {
	it('does nothing when the amount did not change', async () => {
		alertWebhookUrl.mockReturnValue('https://discord.test/webhook');
		await sendTokenWebhook({ ...base, previousAmount: 2, newAmount: 2 });
		expect(postAlert).not.toHaveBeenCalled();
	});

	it('skips the map preview and the post when the alert is disabled', async () => {
		alertWebhookUrl.mockReturnValue(null);
		await sendTokenWebhook({ ...base, geofence: GEOFENCE, previousAmount: 0, newAmount: 1 });
		expect(generateMapPreview).not.toHaveBeenCalled();
		expect(postAlert).not.toHaveBeenCalled();
	});

	it('attaches the area map preview when one renders', async () => {
		alertWebhookUrl.mockReturnValue('https://discord.test/webhook');
		const png = Buffer.from([1, 2, 3]);
		generateMapPreview.mockResolvedValue(png);

		await sendTokenWebhook({ ...base, geofence: GEOFENCE, previousAmount: 0, newAmount: 1 });

		expect(generateMapPreview).toHaveBeenCalledWith(GEOFENCE);
		expect(postAlert).toHaveBeenCalledWith(
			'tokenChanges',
			[
				expect.objectContaining({
					title: 'Tokens Added',
					image: { url: 'attachment://preview.png' }
				})
			],
			{ filename: 'preview.png', png }
		);
	});

	it('still posts without an image when the preview fails', async () => {
		alertWebhookUrl.mockReturnValue('https://discord.test/webhook');
		generateMapPreview.mockRejectedValue(new Error('tileserver down'));

		await sendTokenWebhook({ ...base, geofence: GEOFENCE, previousAmount: 1, newAmount: 0 });

		const [event, embeds, image] = postAlert.mock.calls[0];
		expect(event).toBe('tokenChanges');
		expect(embeds[0].image).toBeUndefined();
		expect(image).toBeUndefined();
	});
});
