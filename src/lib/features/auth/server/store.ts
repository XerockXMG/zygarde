import { getPool } from '$lib/server/db';
import { createDbSessionStore, createMemorySessionStore } from './session';
import type { SessionStore, QueryExecutor } from './session';

let store: SessionStore | undefined;

export function getSessionStore(databaseUrl?: string): SessionStore {
	if (!store) {
		const pool = getPool(databaseUrl);
		// mysql2's Pool.execute overloads don't structurally match our minimal
		// QueryExecutor interface, but they're runtime-compatible.
		store = pool
			? createDbSessionStore(pool as unknown as QueryExecutor)
			: createMemorySessionStore();
	}
	return store;
}
