import { logger } from '$lib/server/logger';
import { alertWebhookUrl, postAlert } from '$lib/server/alerts';
import { generateMapPreview } from '$lib/features/area-requests/server/mappreview';
import type { GeoJsonGeometry } from '$lib/features/area-management/types';

export interface TokenChange {
	username: string;
	areaName: string;
	previousAmount: number;
	newAmount: number;
	/** The area's total allocated tokens after this change. */
	areaTotal: number;
	/** The area's resolved token target, or null if none is set. */
	target: number | null;
	geofence: GeoJsonGeometry | null;
}

export function buildTokenChangeEmbed(change: TokenChange): Record<string, unknown> {
	const delta = change.newAmount - change.previousAmount;
	const added = delta > 0;
	const signed = added ? `+${delta}` : String(delta);

	const fields: { name: string; value: string; inline?: boolean }[] = [
		{ name: 'User', value: change.username, inline: true },
		{ name: 'Area', value: change.areaName, inline: true },
		{
			name: 'Change',
			value: `${signed} (${change.previousAmount} → ${change.newAmount})`,
			inline: true
		},
		{ name: 'Area total', value: String(change.areaTotal), inline: true }
	];
	if (change.target !== null) {
		const funded =
			change.target > 0 ? ` (${Math.round((change.areaTotal / change.target) * 100)}% funded)` : '';
		fields.push({ name: 'Token target', value: `${change.target}${funded}`, inline: true });
	}

	return {
		title: added ? 'Tokens Added' : 'Tokens Removed',
		color: added ? 0x10b981 : 0xef4444,
		fields,
		timestamp: new Date().toISOString()
	};
}

/**
 * Fires when a user adds or removes tokens on an area, with the same map
 * preview request alerts use. Best-effort — never throws. No-ops unless the
 * `tokenChanges` alert is enabled, or if the amount didn't actually change.
 */
export async function sendTokenWebhook(change: TokenChange): Promise<void> {
	if (change.newAmount === change.previousAmount) return;
	// Checked up front so a disabled alert skips rendering the map preview too.
	if (!alertWebhookUrl('tokenChanges')) return;

	const embed = buildTokenChangeEmbed(change);

	let mapPng: Buffer | null = null;
	if (change.geofence) {
		try {
			mapPng = await generateMapPreview(change.geofence);
		} catch (e) {
			logger.warn(
				{ err: e instanceof Error ? e.message : String(e) },
				'Token webhook map preview failed'
			);
		}
	}
	if (mapPng) embed.image = { url: 'attachment://preview.png' };

	await postAlert(
		'tokenChanges',
		[embed],
		mapPng ? { filename: 'preview.png', png: mapPng } : undefined
	);
}
