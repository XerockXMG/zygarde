import crypto from 'node:crypto';
import type { SessionUser } from '../types';

export interface SessionStore {
	create(user: SessionUser): Promise<string>;
	get(id: string): Promise<SessionUser | null>;
	delete(id: string): Promise<void>;
}

export interface QueryExecutor {
	execute<T = unknown>(sql: string, params?: unknown[]): Promise<[T, unknown]>;
}

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export function createMemorySessionStore(ttlMs: number = SESSION_TTL_MS): SessionStore {
	const store = new Map<string, { user: SessionUser; expiresAt: number }>();
	return {
		async create(user) {
			const id = crypto.randomBytes(32).toString('hex');
			store.set(id, { user, expiresAt: Date.now() + ttlMs });
			return id;
		},
		async get(id) {
			const entry = store.get(id);
			if (!entry) return null;
			if (Date.now() > entry.expiresAt) {
				store.delete(id);
				return null;
			}
			return entry.user;
		},
		async delete(id) {
			store.delete(id);
		}
	};
}

interface SessionRow {
	user_json: string;
	expires_at: number;
}

export function createDbSessionStore(
	executor: QueryExecutor,
	ttlMs: number = SESSION_TTL_MS
): SessionStore {
	return {
		async create(user) {
			const id = crypto.randomBytes(32).toString('hex');
			const expiresAt = Date.now() + ttlMs;
			await executor.execute('INSERT INTO sessions (id, user_json, expires_at) VALUES (?, ?, ?)', [
				id,
				JSON.stringify(user),
				expiresAt
			]);
			return id;
		},
		async get(id) {
			const [rows] = await executor.execute<SessionRow[]>(
				'SELECT user_json, expires_at FROM sessions WHERE id = ?',
				[id]
			);
			const row = rows[0];
			if (!row) return null;
			if (Date.now() > row.expires_at) {
				await executor.execute('DELETE FROM sessions WHERE id = ?', [id]);
				return null;
			}
			try {
				return JSON.parse(row.user_json) as SessionUser;
			} catch {
				return null;
			}
		},
		async delete(id) {
			await executor.execute('DELETE FROM sessions WHERE id = ?', [id]);
		}
	};
}
