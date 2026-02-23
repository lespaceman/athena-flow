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

	it('rejects pre-release v1 databases', () => {
		const db = new Database(':memory:');
		db.exec('CREATE TABLE schema_version (version INTEGER NOT NULL)');
		db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(1);
		// Minimal tables so initSchema doesn't fail on CREATE TABLE IF NOT EXISTS
		db.exec(
			'CREATE TABLE session (id TEXT PRIMARY KEY, project_dir TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, label TEXT, event_count INTEGER DEFAULT 0)',
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

		expect(() => initSchema(db)).toThrow(/predates the first release/);
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
