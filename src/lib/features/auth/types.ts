export interface SessionUser {
	discordId: string;
	username: string;
	avatar: string | null;
	/** Map of guild ID → array of role IDs the user holds in that guild */
	guildRoles: Record<string, string[]>;
	isAdmin: boolean;
}
