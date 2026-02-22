import {describe, it, expect, afterEach} from 'vitest';
import Database from 'better-sqlite3';
import {initSchema, SCHEMA_VERSION} from './schema.js';

describe('session schema', () => {
	let db: Database.Database;

	afterEach(() => {
		db?.close();
	});

	it('creates all tables on a fresh in-memory database', () => {
		db = new Database(':memory:');
		initSchema(db);

		const tables = db
			.prepare(
				"SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
			)
			.all()
			.map((r: any) => r.name);

		expect(tables).toContain('session');
		expect(tables).toContain('runtime_events');
		expect(tables).toContain('feed_events');
		expect(tables).toContain('adapter_sessions');
		expect(tables).toContain('schema_version');
	});

	it('is idempotent — calling initSchema twice does not throw', () => {
		db = new Database(':memory:');
		initSchema(db);
		expect(() => initSchema(db)).not.toThrow();
	});

	it('stores and retrieves schema version', () => {
		db = new Database(':memory:');
		initSchema(db);

		const row = db
			.prepare('SELECT version FROM schema_version')
			.get() as {version: number};
		expect(row.version).toBe(SCHEMA_VERSION);
	});
});
