import { env } from '$env/dynamic/private';
import { logger } from '$lib/server/logger';
import { alertWebhookUrl, postAlert } from '$lib/server/alerts';
import { generateMapPreview } from './mappreview';
import type { GeoJsonGeometry } from '$lib/features/area-management/types';
import type { RequestType } from './requests';

const API = 'https://discord.com/api/v10';

/**
 * Fires when a user submits a new area request, if the `areaRequests` alert is
 * enabled. Best-effort — never throws.
 */
export async function sendRequestWebhook(
	type: RequestType,
	username: string,
	note: string,
	existingAreaName: string | null,
	geofence: GeoJsonGeometry | null
): Promise<void> {
	// Checked up front so a disabled alert skips rendering the map preview too.
	if (!alertWebhookUrl('areaRequests')) return;

	const color = type === 'addition' ? 0x10b981 : 0xef4444;
	const title = type === 'addition' ? 'Area Addition Request' : 'Area Removal Request';

	const fields: { name: string; value: string; inline?: boolean }[] = [
		{ name: 'Submitted by', value: username, inline: true }
	];
	if (type === 'removal' && existingAreaName) {
		fields.push({ name: 'Area', value: existingAreaName, inline: true });
	}
	fields.push({ name: 'Note', value: note.slice(0, 1024) });

	const embed: Record<string, unknown> = {
		title,
		color,
		fields,
		timestamp: new Date().toISOString()
	};

	let mapPng: Buffer | null = null;
	if (geofence) {
		try {
			mapPng = await generateMapPreview(geofence);
		} catch (e) {
			logger.warn(
				{ err: e instanceof Error ? e.message : String(e) },
				'Request webhook map preview failed'
			);
		}
	}
	if (mapPng) embed.image = { url: 'attachment://preview.png' };

	await postAlert(
		'areaRequests',
		[embed],
		mapPng ? { filename: 'preview.png', png: mapPng } : undefined
	);
}

/** Fires when an admin resolves a request. Best-effort — never throws. */
export async function sendResolutionDm(
	discordId: string,
	type: RequestType,
	status: 'approved' | 'rejected',
	adminNote: string | null,
	siteUrl: string | null,
	geofence: GeoJsonGeometry | null
): Promise<void> {
	const token = env.DISCORD_BOT_TOKEN;
	if (!token) return;

	const statusLabel = status === 'approved' ? 'approved ✅' : 'rejected ❌';
	const fillColor = status === 'approved' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)';
	const strokeColor = status === 'approved' ? 'rgba(16,185,129,1)' : 'rgba(239,68,68,1)';

	let mapPng: Buffer | null = null;
	if (geofence) {
		try {
			mapPng = await generateMapPreview(geofence, fillColor, strokeColor);
		} catch (e) {
			logger.warn(
				{ err: e instanceof Error ? e.message : String(e) },
				'Resolution DM map preview failed'
			);
		}
	}

	const embedColor = status === 'approved' ? 0x10b981 : 0xef4444;
	const title = type === 'addition' ? 'Area Addition Request' : 'Area Removal Request';
	const fields: { name: string; value: string; inline?: boolean }[] = [
		{ name: 'Status', value: statusLabel, inline: true }
	];
	if (adminNote) fields.push({ name: 'Note from admin', value: adminNote.slice(0, 1024) });

	const embed: Record<string, unknown> = {
		title,
		color: embedColor,
		fields,
		timestamp: new Date().toISOString()
	};
	if (mapPng) embed.image = { url: 'attachment://preview.png' };
	if (siteUrl) embed.url = siteUrl;

	try {
		const channelRes = await fetch(`${API}/users/@me/channels`, {
			method: 'POST',
			headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' },
			body: JSON.stringify({ recipient_id: discordId })
		});
		if (!channelRes.ok) {
			logger.warn({ status: channelRes.status, discordId }, 'Failed to open DM channel');
			return;
		}
		const channel = (await channelRes.json()) as { id: string };

		let msgRes: Response;
		if (mapPng) {
			const fd = new FormData();
			fd.append('payload_json', JSON.stringify({ embeds: [embed] }));
			fd.append(
				'files[0]',
				new Blob([mapPng.buffer as ArrayBuffer], { type: 'image/png' }),
				'preview.png'
			);
			msgRes = await fetch(`${API}/channels/${channel.id}/messages`, {
				method: 'POST',
				headers: { Authorization: `Bot ${token}` },
				body: fd
			});
		} else {
			msgRes = await fetch(`${API}/channels/${channel.id}/messages`, {
				method: 'POST',
				headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' },
				body: JSON.stringify({ embeds: [embed] })
			});
		}
		if (!msgRes.ok) {
			logger.warn({ status: msgRes.status, discordId }, 'Failed to send resolution DM');
		}
	} catch (e) {
		logger.warn(
			{ err: e instanceof Error ? e.message : String(e), discordId },
			'Resolution DM failed'
		);
	}
}

/**
 * DMs the requester the day before their temporary area is switched off.
 * Same mechanics and never-throws contract as `sendResolutionDm`.
 */
export async function sendTemporaryExpiryDm(
	discordId: string,
	areaName: string,
	expiresOn: string,
	siteUrl: string | null,
	geofence: GeoJsonGeometry | null
): Promise<void> {
	const token = env.DISCORD_BOT_TOKEN;
	if (!token) return;

	let mapPng: Buffer | null = null;
	if (geofence) {
		try {
			mapPng = await generateMapPreview(geofence, 'rgba(245,158,11,0.15)', 'rgba(245,158,11,1)');
		} catch (e) {
			logger.warn(
				{ err: e instanceof Error ? e.message : String(e) },
				'Temporary expiry DM map preview failed'
			);
		}
	}

	const embed: Record<string, unknown> = {
		title: 'Temporary area ending tomorrow',
		description: `Your temporary area **${areaName}** will be turned off tomorrow (${expiresOn}). If you'd like it extended, please reach out to an admin.`,
		color: 0xf59e0b,
		fields: [
			{ name: 'Area', value: areaName.slice(0, 1024), inline: true },
			{ name: 'Shuts off', value: expiresOn, inline: true }
		],
		timestamp: new Date().toISOString()
	};
	if (mapPng) embed.image = { url: 'attachment://preview.png' };
	if (siteUrl) embed.url = siteUrl;

	try {
		const channelRes = await fetch(`${API}/users/@me/channels`, {
			method: 'POST',
			headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' },
			body: JSON.stringify({ recipient_id: discordId })
		});
		if (!channelRes.ok) {
			logger.warn({ status: channelRes.status, discordId }, 'Failed to open DM channel');
			return;
		}
		const channel = (await channelRes.json()) as { id: string };

		let msgRes: Response;
		if (mapPng) {
			const fd = new FormData();
			fd.append('payload_json', JSON.stringify({ embeds: [embed] }));
			fd.append(
				'files[0]',
				new Blob([mapPng.buffer as ArrayBuffer], { type: 'image/png' }),
				'preview.png'
			);
			msgRes = await fetch(`${API}/channels/${channel.id}/messages`, {
				method: 'POST',
				headers: { Authorization: `Bot ${token}` },
				body: fd
			});
		} else {
			msgRes = await fetch(`${API}/channels/${channel.id}/messages`, {
				method: 'POST',
				headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' },
				body: JSON.stringify({ embeds: [embed] })
			});
		}
		if (!msgRes.ok) {
			logger.warn({ status: msgRes.status, discordId }, 'Failed to send temporary expiry DM');
		}
	} catch (e) {
		logger.warn(
			{ err: e instanceof Error ? e.message : String(e), discordId },
			'Temporary expiry DM failed'
		);
	}
}
