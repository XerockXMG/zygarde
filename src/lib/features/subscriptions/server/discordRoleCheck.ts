import { fetchGuildRoles } from '$lib/features/auth/server/discord';
import { hasAnyRole, legacyGuildIds, parseRoleIds } from '$lib/utils/access';

/**
 * Whether a specific Discord user currently holds one of the required roles
 * in any of the given servers — a per-user REST lookup
 * (GET /guilds/{id}/members/{id} via fetchGuildRoles, the same call login
 * already makes), never a bulk guild member list. That's deliberate: a bulk
 * list needs Discord's privileged Guild Members intent, which triggers bot
 * verification. `requiredRoles` is a role setting (see utils/access.ts);
 * the servers are DISCORD_GUILD_IDS, plus any named in a legacy JSON value.
 */
export async function checkUserHasRequiredRole(
	botToken: string,
	requiredRoles: string,
	guildIds: string[],
	discordId: string
): Promise<boolean> {
	const roleIds = parseRoleIds(requiredRoles);
	const servers = [...new Set([...guildIds, ...legacyGuildIds(requiredRoles)])];
	if (roleIds.length === 0 || servers.length === 0) return false;
	const guildRoles = await fetchGuildRoles(botToken, servers, discordId);
	return hasAnyRole(roleIds, guildRoles);
}
