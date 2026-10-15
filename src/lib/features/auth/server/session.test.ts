import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemorySessionStore, createDbSessionStore, type QueryExecutor } from './session';
import type { SessionUser } from '../types';

const testUser: SessionUser = {
	discordId: '111',
	username: 'tester',
	avatar: null,
	guildRoles: { g1: ['r1'] },
	isAdmin: false
};

describe('createMemorySessionStore', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it('creates a session and retrieves the same user by id', async () => {
		const store = createMemorySessionStore();
		const id = await store.create(testUser);
		expect(typeof id).toBe('string');
		expect(id.length).toBeGreaterThan(0);
		await expect(store.get(id)).resolves.toEqual(testUser);
	});

	it('returns null for an unknown id', async () => {
		const store = createMemorySessionStore();
		await expect(store.get('does-not-exist')).resolves.toBeNull();
	});

	it('returns null and forgets the session once the TTL has elapsed', async () => {
		const store = createMemorySessionStore(1000);
		const id = await store.create(testUser);
		vi.advanceTimersByTime(1001);
		await expect(store.get(id)).resolves.toBeNull();
		await expect(store.get(id)).resolves.toBeNull(); // still gone, not re-added
	});

	it('deletes a session on demand', async () => {
		const store = createMemorySessionStore();
		const id = await store.create(testUser);
		await store.delete(id);
		await expect(store.get(id)).resolves.toBeNull();
	});

	it('generates a different id for each session', async () => {
		const store = createMemorySessionStore();
		const id1 = await store.create(testUser);
		const id2 = await store.create(testUser);
		expect(id1).not.toBe(id2);
	});
});

describe('createDbSessionStore', () => {
	function fakeExecutor(): QueryExecutor & { execute: ReturnType<typeof vi.fn> } {
		return { execute: vi.fn() };
	}

	it('inserts a row on create and returns the generated id', async () => {
		const executor = fakeExecutor();
		executor.execute.mockResolvedValueOnce([{}, undefined]);
		const store = createDbSessionStore(executor);
		const id = await store.create(testUser);
		expect(executor.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO sessions'), [
			id,
			JSON.stringify(testUser),
			expect.any(Number)
		]);
	});

	it('returns the parsed user when the row exists and has not expired', async () => {
		const executor = fakeExecutor();
		executor.execute.mockResolvedValueOnce([
			[{ user_json: JSON.stringify(testUser), expires_at: Date.now() + 10_000 }],
			undefined
		]);
		const store = createDbSessionStore(executor);
		await expect(store.get('abc')).resolves.toEqual(testUser);
	});

	it('deletes and returns null when the row has expired', async () => {
		const executor = fakeExecutor();
		executor.execute.mockResolvedValueOnce([
			[{ user_json: JSON.stringify(testUser), expires_at: Date.now() - 1 }],
			undefined
		]);
		executor.execute.mockResolvedValueOnce([{}, undefined]); // the DELETE
		const store = createDbSessionStore(executor);
		await expect(store.get('abc')).resolves.toBeNull();
		expect(executor.execute).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM sessions'), [
			'abc'
		]);
	});

	it('returns null when no row is found', async () => {
		const executor = fakeExecutor();
		executor.execute.mockResolvedValueOnce([[], undefined]);
		const store = createDbSessionStore(executor);
		await expect(store.get('missing')).resolves.toBeNull();
	});

	it('deletes a row on demand', async () => {
		const executor = fakeExecutor();
		executor.execute.mockResolvedValueOnce([{}, undefined]);
		const store = createDbSessionStore(executor);
		await store.delete('abc');
		expect(executor.execute).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM sessions'), [
			'abc'
		]);
	});
});
