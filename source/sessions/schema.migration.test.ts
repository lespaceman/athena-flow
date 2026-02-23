import {describe, it, expect} from 'vitest';
import Database from 'better-sqlite3';
import {initSchema, SCHEMA_VERSION} from './schema.js';

describe('schema migrations', () => {
	it('rejects duplicate global seq (different runs)', () => {
		const db = new Database(':memory:');
		initSchema(db);

		db.prepare(
			'INSERT INTO session (id, project_dir, created_at, updated_at) VALUES (?, ?, ?, ?)',
		).run('s1', '/tmp', Date.now(), Date.now());
		db.prepare(
			'INSERT INTO runtime_events (id, seq, timestamp, hook_name, payload) VALUES (?, ?, ?, ?, ?)',
		).run('re1', 1, Date.now(), 'PreToolUse', '{}');

		db.prepare(
			'INSERT INTO feed_events (event_id, runtime_event_id, seq, kind, run_id, actor_id, timestamp, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
		).run('fe1', 're1', 1, 'tool.pre', 'run-A', 'agent:root', Date.now(), '{}');

		expect(() => {
			db.prepare(
				'INSERT INTO feed_events (event_id, runtime_event_id, seq, kind, run_id, actor_id, timestamp, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
			).run(
				'fe2',
				're1',
				1,
				'tool.pre',
				'run-B',
				'agent:root',
				Date.now(),
				'{}',
			);
		}).toThrow();
		db.close();
	});

	it('updates version when migrating from v1', () => {
		const db = new Database(':memory:');
		// Manually set up v1 schema
		db.exec('PRAGMA journal_mode = WAL');
		db.exec('PRAGMA foreign_keys = ON');
		db.exec('CREATE TABLE schema_version (version INTEGER NOT NULL)');
		db.exec(
			'CREATE TABLE session (id TEXT PRIMARY KEY, project_dir TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, label TEXT)',
		);
		db.exec(
			'CREATE TABLE runtime_events (id TEXT PRIMARY KEY, seq INTEGER NOT NULL UNIQUE, timestamp INTEGER NOT NULL, hook_name TEXT NOT NULL, adapter_session_id TEXT, payload JSON NOT NULL)',
		);
		db.exec(
			'CREATE TABLE feed_events (event_id TEXT PRIMARY KEY, runtime_event_id TEXT, seq INTEGER NOT NULL, kind TEXT NOT NULL, run_id TEXT NOT NULL, actor_id TEXT NOT NULL, timestamp INTEGER NOT NULL, data JSON NOT NULL, FOREIGN KEY (runtime_event_id) REFERENCES runtime_events(id))',
		);
		db.exec(
			'CREATE TABLE adapter_sessions (session_id TEXT PRIMARY KEY, started_at INTEGER NOT NULL, ended_at INTEGER, model TEXT, source TEXT)',
		);
		db.exec('CREATE UNIQUE INDEX idx_feed_run_seq ON feed_events(run_id, seq)');
		db.exec('CREATE INDEX idx_feed_kind ON feed_events(kind)');
		db.exec('CREATE INDEX idx_feed_run ON feed_events(run_id)');
		db.exec('CREATE INDEX idx_runtime_seq ON runtime_events(seq)');
		db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(1);

		initSchema(db);

		const row = db.prepare('SELECT version FROM schema_version').get() as {
			version: number;
		};
		expect(row.version).toBe(SCHEMA_VERSION);

		// Verify the old index is gone and new one exists
		const indexes = db
			.prepare(
				"SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='feed_events'",
			)
			.all() as {name: string}[];
		const indexNames = indexes.map(i => i.name);
		expect(indexNames).not.toContain('idx_feed_run_seq');
		expect(indexNames).toContain('idx_feed_seq');

		db.close();
	});

	it('throws on forward-incompatible schema', () => {
		const db = new Database(':memory:');
		db.exec('CREATE TABLE schema_version (version INTEGER NOT NULL)');
		db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(999);

		expect(() => initSchema(db)).toThrow(/newer schema/i);
		db.close();
	});
});
