import mysql from 'mysql2/promise';

export interface QueryExecutor {
	query(sql: string): Promise<unknown>;
}

let pool: mysql.Pool | null = null;

export function getPool(databaseUrl: string | undefined): mysql.Pool | null {
	if (!databaseUrl) return null;
	if (!pool) {
		pool = mysql.createPool(databaseUrl);
	}
	return pool;
}

// Later phases append their own CREATE TABLE statements here — this is
// the one place local-DB schema is declared.
const SCHEMA_STATEMENTS: string[] = [
	`CREATE TABLE IF NOT EXISTS sessions (
		id VARCHAR(64) PRIMARY KEY,
		user_json MEDIUMTEXT NOT NULL,
		expires_at BIGINT NOT NULL
	)`,
	`CREATE TABLE IF NOT EXISTS area_votes (
		area_id INT NOT NULL,
		discord_id VARCHAR(32) NOT NULL,
		username VARCHAR(64) NOT NULL,
		voted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		UNIQUE KEY uq_area_user (area_id, discord_id),
		KEY idx_votes_user (discord_id)
	)`,
	// area_votes existed before token-based allocation was introduced, so
	// tables created by earlier deployments need this column backfilled.
	`ALTER TABLE area_votes ADD COLUMN IF NOT EXISTS amount INT NOT NULL DEFAULT 1`,
	`CREATE TABLE IF NOT EXISTS area_primary (
		discord_id VARCHAR(32) PRIMARY KEY,
		area_id INT NOT NULL,
		set_at DATETIME DEFAULT CURRENT_TIMESTAMP
	)`,
	`CREATE TABLE IF NOT EXISTS user_tiers (
		discord_id VARCHAR(32) PRIMARY KEY,
		username VARCHAR(64) NOT NULL,
		tier_name VARCHAR(64) NOT NULL,
		weight INT NOT NULL,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
	)`,
	`CREATE TABLE IF NOT EXISTS user_tier_overrides (
		discord_id VARCHAR(32) PRIMARY KEY,
		tier_name VARCHAR(64) NOT NULL,
		set_by VARCHAR(32) NOT NULL,
		set_at DATETIME DEFAULT CURRENT_TIMESTAMP
	)`,
	`CREATE TABLE IF NOT EXISTS geofence_archive (
		id INT AUTO_INCREMENT PRIMARY KEY,
		area_id INT NOT NULL,
		area_name VARCHAR(255) NOT NULL,
		geofence MEDIUMTEXT NOT NULL,
		archived_by_discord_id VARCHAR(32) NOT NULL,
		archived_by_username VARCHAR(64) NOT NULL,
		archived_at DATETIME DEFAULT CURRENT_TIMESTAMP
	)`,
	`CREATE TABLE IF NOT EXISTS area_requests (
		id INT AUTO_INCREMENT PRIMARY KEY,
		type ENUM('addition','removal') NOT NULL,
		status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
		geofence MEDIUMTEXT NOT NULL,
		existing_area_id INT NULL,
		existing_area_name VARCHAR(255) NULL,
		user_note TEXT NOT NULL,
		admin_note TEXT NULL,
		discord_id VARCHAR(32) NOT NULL,
		username VARCHAR(64) NOT NULL,
		submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		resolved_at DATETIME NULL,
		resolved_by_discord_id VARCHAR(32) NULL,
		resolved_by_username VARCHAR(64) NULL,
		created_area_id INT NULL,
		KEY idx_status (status),
		KEY idx_discord_id (discord_id)
	)`,
	// Temporary-area requests: area_requests predates these columns.
	`ALTER TABLE area_requests ADD COLUMN IF NOT EXISTS is_temporary TINYINT(1) NOT NULL DEFAULT 0`,
	`ALTER TABLE area_requests ADD COLUMN IF NOT EXISTS starts_on DATE NULL`,
	`ALTER TABLE area_requests ADD COLUMN IF NOT EXISTS expires_on DATE NULL`,
	`CREATE TABLE IF NOT EXISTS temporary_areas (
		area_id INT PRIMARY KEY,
		request_id INT NULL,
		starts_on DATE NOT NULL,
		expires_on DATE NOT NULL,
		discord_id VARCHAR(32) NOT NULL,
		username VARCHAR(64) NOT NULL,
		started_at DATETIME NULL,
		notified_at DATETIME NULL,
		disabled_at DATETIME NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	)`,
	`CREATE TABLE IF NOT EXISTS spawnpoint_cache (
		area_id INT NOT NULL,
		mode VARCHAR(16) NOT NULL,
		count INT NOT NULL,
		fetched_at BIGINT NOT NULL,
		PRIMARY KEY (area_id, mode)
	)`,
	`CREATE TABLE IF NOT EXISTS spawnpoint_settings (
		id TINYINT PRIMARY KEY DEFAULT 1,
		recent_days INT NOT NULL DEFAULT 30,
		cache_ttl_hours INT NOT NULL DEFAULT 72
	)`,
	`CREATE TABLE IF NOT EXISTS map_settings (
		id TINYINT PRIMARY KEY DEFAULT 1,
		tile_url_template VARCHAR(512) NOT NULL,
		tile_attribution VARCHAR(512) NOT NULL,
		tile_max_zoom INT NOT NULL DEFAULT 20,
		tile_size INT NOT NULL DEFAULT 256,
		zoom_offset INT NOT NULL DEFAULT 0
	)`,
	// map_settings existed before tile_size/zoom_offset were added, so tables
	// created by earlier deployments need these columns backfilled.
	`ALTER TABLE map_settings ADD COLUMN IF NOT EXISTS tile_size INT NOT NULL DEFAULT 256`,
	`ALTER TABLE map_settings ADD COLUMN IF NOT EXISTS zoom_offset INT NOT NULL DEFAULT 0`,
	`CREATE TABLE IF NOT EXISTS area_route_runs (
		area_id INT NOT NULL,
		route_type ENUM('spawnpoint','bootstrap') NOT NULL,
		generated_at DATETIME NOT NULL,
		stop_count INT NOT NULL,
		PRIMARY KEY (area_id, route_type)
	)`,
	`CREATE TABLE IF NOT EXISTS area_vote_targets (
		area_id INT PRIMARY KEY,
		mode ENUM('static','workers') NOT NULL DEFAULT 'static',
		static_value INT NOT NULL DEFAULT 0,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
	)`,
	// area_vote_targets existed before per-area workers-per-token overrides
	// were introduced, so tables created by earlier deployments need this
	// column backfilled. NULL means "use the voting_settings global default".
	`ALTER TABLE area_vote_targets ADD COLUMN IF NOT EXISTS workers_per_token_override INT NULL`,
	`CREATE TABLE IF NOT EXISTS voting_settings (
		id TINYINT PRIMARY KEY DEFAULT 1,
		workers_per_token INT NOT NULL DEFAULT 1
	)`,
	// voting_settings existed under an earlier deployment before the
	// tokens-per-worker ratio was renamed/inverted to workers-per-token, so
	// tables created back then need this column backfilled (CREATE TABLE IF
	// NOT EXISTS alone is a no-op once the table already exists).
	`ALTER TABLE voting_settings ADD COLUMN IF NOT EXISTS workers_per_token INT NOT NULL DEFAULT 1`,
	// voting_settings existed before the subscription-lapse grace period
	// setting was introduced, so tables created before that need this column
	// backfilled too.
	`ALTER TABLE voting_settings ADD COLUMN IF NOT EXISTS subscription_grace_period_days INT NOT NULL DEFAULT 7`,
	// voting_settings existed before the worker-autoscale sync interval was
	// introduced, so tables created before that need this column backfilled.
	`ALTER TABLE voting_settings ADD COLUMN IF NOT EXISTS autoscale_interval_minutes INT NOT NULL DEFAULT 15`,
	// One row per area, independent of whether autoscale is actually enabled
	// there — see autoscale/server/state.ts's ensureAutoscaleRows(). A
	// `workers`-mode vote target always resolves off max_pokemon_workers here
	// (never the area's live worker count), so the number stays stable even
	// while autoscale is actively throttling the area.
	`CREATE TABLE IF NOT EXISTS area_worker_autoscale (
		area_id INT PRIMARY KEY,
		enabled BOOLEAN NOT NULL DEFAULT FALSE,
		max_pokemon_workers INT NOT NULL,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
	)`,
	// Tracks the start of each user's current Discord-role subscription
	// check failing streak (see subscriptions/server/sync.ts) — NULL/absent
	// means their most recent check passed. failing_since is set once on the
	// first failure and left untouched by later failures; only a pass clears
	// it. Overwriting it on every failure would prevent the grace period
	// from ever elapsing.
	`CREATE TABLE IF NOT EXISTS subscription_role_checks (
		discord_id VARCHAR(32) PRIMARY KEY,
		failing_since DATETIME NULL
	)`
];

export async function ensureSchema(executor: QueryExecutor): Promise<void> {
	for (const stmt of SCHEMA_STATEMENTS) {
		await executor.query(stmt);
	}
}
