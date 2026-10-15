import { describe, expect, it, vi } from 'vitest';
import { getPool, ensureSchema, type QueryExecutor } from './db';

describe('getPool', () => {
	it('returns null when no database URL is given', () => {
		expect(getPool(undefined)).toBeNull();
	});

	it('returns a pool with a query method when given a URL', () => {
		const pool = getPool('mysql://user:pass@localhost:3306/zygarde_test');
		expect(pool).not.toBeNull();
		expect(typeof pool?.query).toBe('function');
	});

	it('returns the same pool instance on repeated calls', () => {
		const first = getPool('mysql://user:pass@localhost:3306/zygarde_test');
		const second = getPool('mysql://user:pass@localhost:3306/zygarde_test');
		expect(first).toBe(second);
	});
});

describe('ensureSchema', () => {
	it('runs every schema statement against the executor', async () => {
		const executor: QueryExecutor = { query: vi.fn().mockResolvedValue(undefined) };
		await ensureSchema(executor);
		expect(executor.query).toHaveBeenCalled();
		const calledSql = (executor.query as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
		expect(
			calledSql.some((sql: string) => sql.includes('CREATE TABLE IF NOT EXISTS sessions'))
		).toBe(true);
	});

	it('includes the area_votes table', async () => {
		const executor: QueryExecutor = { query: vi.fn().mockResolvedValue(undefined) };
		await ensureSchema(executor);
		const calledSql = (executor.query as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
		expect(
			calledSql.some((sql: string) => sql.includes('CREATE TABLE IF NOT EXISTS area_votes'))
		).toBe(true);
	});

	it('includes the area_primary table', async () => {
		const executor: QueryExecutor = { query: vi.fn().mockResolvedValue(undefined) };
		await ensureSchema(executor);
		const calledSql = (executor.query as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
		expect(
			calledSql.some((sql: string) => sql.includes('CREATE TABLE IF NOT EXISTS area_primary'))
		).toBe(true);
	});

	it('includes the user_tiers table', async () => {
		const executor: QueryExecutor = { query: vi.fn().mockResolvedValue(undefined) };
		await ensureSchema(executor);
		const calledSql = (executor.query as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
		expect(
			calledSql.some((sql: string) => sql.includes('CREATE TABLE IF NOT EXISTS user_tiers'))
		).toBe(true);
	});

	it('includes the user_tier_overrides table', async () => {
		const executor: QueryExecutor = { query: vi.fn().mockResolvedValue(undefined) };
		await ensureSchema(executor);
		const calledSql = (executor.query as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
		expect(
			calledSql.some((sql: string) =>
				sql.includes('CREATE TABLE IF NOT EXISTS user_tier_overrides')
			)
		).toBe(true);
	});

	it('includes the area_requests table', async () => {
		const executor: QueryExecutor = { query: vi.fn().mockResolvedValue(undefined) };
		await ensureSchema(executor);
		const calledSql = (executor.query as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
		expect(
			calledSql.some((sql: string) => sql.includes('CREATE TABLE IF NOT EXISTS area_requests'))
		).toBe(true);
	});

	it('includes the spawnpoint_cache table', async () => {
		const executor: QueryExecutor = { query: vi.fn().mockResolvedValue(undefined) };
		await ensureSchema(executor);
		const calledSql = (executor.query as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
		expect(
			calledSql.some((sql: string) => sql.includes('CREATE TABLE IF NOT EXISTS spawnpoint_cache'))
		).toBe(true);
	});

	it('includes the spawnpoint_settings table', async () => {
		const executor: QueryExecutor = { query: vi.fn().mockResolvedValue(undefined) };
		await ensureSchema(executor);
		const calledSql = (executor.query as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
		expect(
			calledSql.some((sql: string) =>
				sql.includes('CREATE TABLE IF NOT EXISTS spawnpoint_settings')
			)
		).toBe(true);
	});

	it('includes the map_settings table', async () => {
		const executor: QueryExecutor = { query: vi.fn().mockResolvedValue(undefined) };
		await ensureSchema(executor);
		const calledSql = (executor.query as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
		expect(
			calledSql.some((sql: string) => sql.includes('CREATE TABLE IF NOT EXISTS map_settings'))
		).toBe(true);
	});

	it('includes the area_route_runs table', async () => {
		const executor: QueryExecutor = { query: vi.fn().mockResolvedValue(undefined) };
		await ensureSchema(executor);
		const calledSql = (executor.query as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
		expect(
			calledSql.some((sql: string) => sql.includes('CREATE TABLE IF NOT EXISTS area_route_runs'))
		).toBe(true);
	});
});
