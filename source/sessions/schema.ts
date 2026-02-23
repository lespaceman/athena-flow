import type Database from 'better-sqlite3';

export const SCHEMA_VERSION = 2;

export function initSchema(db: Database.Database): void {
	db.exec('PRAGMA journal_mode = WAL');
	db.exec('PRAGMA foreign_keys = ON');

	db.exec(`
		CREATE TABLE IF NOT EXISTS schema_version (
			version INTEGER NOT NULL
		);

		CREATE TABLE IF NOT EXISTS session (
			id TEXT PRIMARY KEY,
			project_dir TEXT NOT NULL,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL,
			label TEXT
		);

		CREATE TABLE IF NOT EXISTS runtime_events (
			id TEXT PRIMARY KEY,
			seq INTEGER NOT NULL UNIQUE,
			timestamp INTEGER NOT NULL,
			hook_name TEXT NOT NULL,
			adapter_session_id TEXT,
			payload JSON NOT NULL
		);

		CREATE TABLE IF NOT EXISTS feed_events (
			event_id TEXT PRIMARY KEY,
			runtime_event_id TEXT,
			seq INTEGER NOT NULL,
			kind TEXT NOT NULL,
			run_id TEXT NOT NULL,
			actor_id TEXT NOT NULL,
			timestamp INTEGER NOT NULL,
			data JSON NOT NULL,
			FOREIGN KEY (runtime_event_id) REFERENCES runtime_events(id)
		);

		CREATE TABLE IF NOT EXISTS adapter_sessions (
			session_id TEXT PRIMARY KEY,
			started_at INTEGER NOT NULL,
			ended_at INTEGER,
			model TEXT,
			source TEXT
		);
	`);

	db.exec(`
		CREATE INDEX IF NOT EXISTS idx_feed_kind ON feed_events(kind);
		CREATE INDEX IF NOT EXISTS idx_feed_run ON feed_events(run_id);
		CREATE UNIQUE INDEX IF NOT EXISTS idx_feed_seq ON feed_events(seq);
		CREATE INDEX IF NOT EXISTS idx_runtime_seq ON runtime_events(seq);
	`);

	// Migration: add event_count column (idempotent via try/catch since
	// SQLite doesn't support ALTER TABLE ... ADD COLUMN IF NOT EXISTS)
	try {
		db.exec('ALTER TABLE session ADD COLUMN event_count INTEGER DEFAULT 0');
	} catch {
		// Column already exists — ignore
	}

	// Check and migrate schema version
	const existing = db.prepare('SELECT version FROM schema_version').get() as
		| {version: number}
		| undefined;

	if (existing && existing.version > SCHEMA_VERSION) {
		throw new Error(
			`Database has newer schema version ${existing.version} (expected <= ${SCHEMA_VERSION}). ` +
				`Update athena-cli to open this session.`,
		);
	}

	if (!existing) {
		db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(
			SCHEMA_VERSION,
		);
	} else if (existing.version < SCHEMA_VERSION) {
		const migrations: Record<
			number,
			(d: import('better-sqlite3').Database) => void
		> = {
			2: d => {
				d.exec('DROP INDEX IF EXISTS idx_feed_run_seq');
				d.exec(
					'CREATE UNIQUE INDEX IF NOT EXISTS idx_feed_seq ON feed_events(seq)',
				);
			},
		};

		// Run all migrations in a single transaction so partial failures
		// don't leave the DB in an inconsistent state.
		const runMigrations = db.transaction(() => {
			for (let v = existing.version + 1; v <= SCHEMA_VERSION; v++) {
				const migrate = migrations[v];
				if (migrate) migrate(db);
			}
			db.prepare('UPDATE schema_version SET version = ?').run(
				SCHEMA_VERSION,
			);
		});
		runMigrations();
	}
}
