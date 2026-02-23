import type Database from 'better-sqlite3';

export const SCHEMA_VERSION = 2;

/**
 * Reassign feed_events.seq to be globally unique.
 * v1 schema enforced (run_id, seq) uniqueness, so the same seq could appear
 * across runs. This assigns new seq values based on rowid order (preserving
 * relative ordering) to satisfy the v2 global uniqueness constraint.
 */
function deduplicateFeedSeq(db: Database.Database): void {
	const hasDupes = db
		.prepare(
			'SELECT 1 FROM feed_events GROUP BY seq HAVING COUNT(*) > 1 LIMIT 1',
		)
		.get();
	if (!hasDupes) return;

	// Reassign seq = rowid-based counter, ordered by existing seq then rowid
	// to preserve relative ordering within and across runs.
	db.exec(`
		UPDATE feed_events SET seq = (
			SELECT rn FROM (
				SELECT rowid AS rid, ROW_NUMBER() OVER (ORDER BY seq, rowid) AS rn
				FROM feed_events
			) AS numbered
			WHERE numbered.rid = feed_events.rowid
		)
	`);
}

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
		CREATE INDEX IF NOT EXISTS idx_runtime_seq ON runtime_events(seq);
	`);
	// NOTE: idx_feed_seq (UNIQUE) is created by migration 2 or the new-DB path below.
	// It must NOT be created unconditionally here because v1 DBs may have
	// duplicate seq values that need deduplication first.

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
		// Fresh DB — create unique index directly (no data to conflict)
		db.exec(
			'CREATE UNIQUE INDEX IF NOT EXISTS idx_feed_seq ON feed_events(seq)',
		);
	} else if (existing.version < SCHEMA_VERSION) {
		const migrations: Record<
			number,
			(d: import('better-sqlite3').Database) => void
		> = {
			2: d => {
				d.exec('DROP INDEX IF EXISTS idx_feed_run_seq');
				// Deduplicate seq values before adding unique constraint.
				// v1 schema used (run_id, seq) uniqueness, so the same seq
				// could appear in multiple runs. Reassign globally unique
				// seq values based on rowid order (preserves relative ordering).
				deduplicateFeedSeq(d);
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
