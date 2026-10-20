import { env } from '$env/dynamic/private';
import { logger } from '$lib/server/logger';

/**
 * Every alert goes to the one DISCORD_ALERT_WEBHOOK_URL; each event type is
 * then individually switched on by its own true/false env toggle (off unless set).
 */
export const ALERT_TOGGLES = {
	areaRequests: 'ALERT_AREA_REQUESTS',
	tokenChanges: 'ALERT_TOKEN_CHANGES',
	temporaryAreaExpired: 'ALERT_TEMP_AREA_EXPIRED'
} as const;

export type AlertEvent = keyof typeof ALERT_TOGGLES;

export function isTruthy(value: string | undefined): boolean {
	return ['true', '1', 'yes', 'on'].includes((value ?? '').trim().toLowerCase());
}

/** The webhook URL to post `event` to, or null if no webhook is set or the event is toggled off. */
export function alertWebhookUrl(event: AlertEvent): string | null {
	const url = env.DISCORD_ALERT_WEBHOOK_URL;
	if (!url || !isTruthy(env[ALERT_TOGGLES[event]])) return null;
	return url;
}

/** Posts embeds (plus an optional PNG attachment) for `event`. Best-effort — never throws. */
export async function postAlert(
	event: AlertEvent,
	embeds: Record<string, unknown>[],
	image?: { filename: string; png: Buffer }
): Promise<void> {
	const url = alertWebhookUrl(event);
	if (!url) return;

	try {
		let res: Response;
		if (image) {
			const fd = new FormData();
			fd.append('payload_json', JSON.stringify({ embeds }));
			fd.append(
				'files[0]',
				new Blob([image.png.buffer as ArrayBuffer], { type: 'image/png' }),
				image.filename
			);
			res = await fetch(url, { method: 'POST', body: fd });
		} else {
			res = await fetch(url, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ embeds })
			});
		}
		if (!res.ok) {
			const body = await res.text().catch(() => '');
			logger.warn({ status: res.status, body, event }, 'Alert webhook returned non-2xx');
		}
	} catch (e) {
		logger.warn({ err: e instanceof Error ? e.message : String(e), event }, 'Alert webhook failed');
	}
}
