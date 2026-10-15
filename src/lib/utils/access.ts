/**
 * Discord role checks for the role-list env vars (OFFLINE_AREA_ACCESS,
 * ROUTE_ACCESS, SPAWNPOINT_ACCESS, SUBSCRIPTION_REQUIRED_ROLES, and each
 * tier's `roles` in VOTE_TIERS).
 *
 * A role setting is a comma-separated list of role IDs. Role IDs are unique
 * across all of Discord, so no server ID is needed next to them. A server's
 * own ID also works as a role ID: it's that server's @everyone role, so it
 * matches every member of the server.
 *
 * The older `{"guildId": ["roleId", ...]}` JSON shape is still accepted; its
 * server keys are ignored and only the role IDs are used.
 */

/** Parse a role setting into role IDs. Unset or malformed gives an empty list. */
export function parseRoleIds(value: string | undefined): string[] {
	const trimmed = value?.trim();
	if (!trimmed) return [];
	if (trimmed.startsWith('{')) {
		try {
			const legacy: unknown = JSON.parse(trimmed);
			if (!legacy || typeof legacy !== 'object') return [];
			return Object.values(legacy).flatMap((ids) =>
				Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : []
			);
		} catch {
			return [];
		}
	}
	return trimmed
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
}

/** Server IDs named as keys in a legacy `{"guildId": [...]}` setting; [] for a plain list. */
export function legacyGuildIds(value: string | undefined): string[] {
	const trimmed = value?.trim();
	if (!trimmed?.startsWith('{')) return [];
	try {
		const legacy: unknown = JSON.parse(trimmed);
		return legacy && typeof legacy === 'object' ? Object.keys(legacy) : [];
	} catch {
		return [];
	}
}

/**
 * Whether the user holds any of `roleIds`. `userGuildRoles` is the user's
 * roles per server they're a member of (from login); each server's ID counts
 * as one of their roles (@everyone).
 */
export function hasAnyRole(roleIds: string[], userGuildRoles: Record<string, string[]>): boolean {
	if (roleIds.length === 0) return false;
	const wanted = new Set(roleIds);
	for (const [guildId, roles] of Object.entries(userGuildRoles)) {
		if (wanted.has(guildId) || roles.some((r) => wanted.has(r))) return true;
	}
	return false;
}

/** Whether the user holds any role in a role setting. Unset means nobody (admins are checked separately). */
export function hasAccess(
	config: string | undefined,
	userGuildRoles: Record<string, string[]>
): boolean {
	return hasAnyRole(parseRoleIds(config), userGuildRoles);
}
