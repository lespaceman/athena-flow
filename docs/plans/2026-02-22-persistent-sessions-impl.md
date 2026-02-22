# Persistent Athena Sessions — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add persistent session storage so athena sessions survive across multiple Claude adapter sessions, with full feed restore on resume.

**Architecture:** A `SessionStore` middleware wraps the `Runtime`, intercepting events to persist both raw `RuntimeEvent` payloads and derived `FeedEvent` objects to a per-session SQLite database at `~/.config/athena/sessions/{id}/session.db`. On restore, stored `FeedEvent[]` hydrate `useFeed` directly, and `createFeedMapper` bootstraps its internal state from the last known session/run/actor data.

**Tech Stack:** TypeScript, better-sqlite3, vitest, existing feed/runtime types

**Design doc:** `docs/plans/2026-02-22-persistent-sessions-design.md`

---

### Task 1: Install better-sqlite3 and Add Session Types

**Files:**

- Modify: `package.json`
- Create: `source/sessions/types.ts`
- Create: `source/sessions/index.ts`
- Test: `source/sessions/types.test.ts`

**Step 1: Install better-sqlite3**

Run: `npm install better-sqlite3 && npm install -D @types/better-sqlite3`

**Step 2: Write the types file**

Create `source/sessions/types.ts`:

```typescript
import type {FeedEvent} from '../feed/types.js';

export type AthenaSession = {
	id: string;
	projectDir: string;
	createdAt: number;
	updatedAt: number;
	label?: string;
	adapterSessionIds: string[];
};

export type AdapterSessionRecord = {
	sessionId: string;
	startedAt: number;
	endedAt?: number;
	model?: string;
	source?: string;
};

export type StoredSession = {
	session: AthenaSession;
	feedEvents: FeedEvent[];
	adapterSessions: AdapterSessionRecord[];
};
```

**Step 3: Write type validation test**

Create `source/sessions/types.test.ts`:

```typescript
import {describe, it, expect} from 'vitest';
import type {
	AthenaSession,
	StoredSession,
	AdapterSessionRecord,
} from './types.js';

describe('session types', () => {
	it('AthenaSession satisfies expected shape', () => {
		const session: AthenaSession = {
			id: 'test-123',
			projectDir: '/home/user/project',
			createdAt: Date.now(),
			updatedAt: Date.now(),
			adapterSessionIds: ['claude-session-1'],
		};
		expect(session.id).toBe('test-123');
		expect(session.label).toBeUndefined();
	});

	it('StoredSession contains session, feedEvents, and adapterSessions', () => {
		const stored: StoredSession = {
			session: {
				id: 's1',
				projectDir: '/tmp',
				createdAt: 1,
				updatedAt: 2,
				adapterSessionIds: [],
			},
			feedEvents: [],
			adapterSessions: [],
		};
		expect(stored.feedEvents).toEqual([]);
	});
});
```

**Step 4: Create barrel export**

Create `source/sessions/index.ts`:

```typescript
export type {
	AthenaSession,
	AdapterSessionRecord,
	StoredSession,
} from './types.js';
```

**Step 5: Run test to verify it passes**

Run: `npx vitest run source/sessions/types.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add source/sessions/ package.json package-lock.json
git commit -m "feat(sessions): add session types and install better-sqlite3"
```

---

### Task 2: SQLite Schema Module

**Files:**

- Create: `source/sessions/schema.ts`
- Test: `source/sessions/schema.test.ts`

**Step 1: Write the failing test**

Create `source/sessions/schema.test.ts`:

```typescript
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

		const row = db.prepare('SELECT version FROM schema_version').get() as {
			version: number;
		};
		expect(row.version).toBe(SCHEMA_VERSION);
	});
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/sessions/schema.test.ts`
Expected: FAIL — module not found

**Step 3: Write the schema module**

Create `source/sessions/schema.ts`:

```typescript
import type Database from 'better-sqlite3';

export const SCHEMA_VERSION = 1;

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

	// Create indexes (IF NOT EXISTS for idempotency)
	db.exec(`
		CREATE INDEX IF NOT EXISTS idx_feed_kind ON feed_events(kind);
		CREATE INDEX IF NOT EXISTS idx_feed_run ON feed_events(run_id);
		CREATE INDEX IF NOT EXISTS idx_runtime_seq ON runtime_events(seq);
	`);

	// Upsert schema version
	const existing = db.prepare('SELECT version FROM schema_version').get() as
		| {version: number}
		| undefined;
	if (!existing) {
		db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(
			SCHEMA_VERSION,
		);
	}
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run source/sessions/schema.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add source/sessions/schema.ts source/sessions/schema.test.ts
git commit -m "feat(sessions): add SQLite schema module with WAL mode"
```

---

### Task 3: SessionStore — Core Recording

**Files:**

- Create: `source/sessions/store.ts`
- Test: `source/sessions/store.test.ts`

**Step 1: Write the failing test for recording runtime events and feed events**

Create `source/sessions/store.test.ts`:

```typescript
import {describe, it, expect, afterEach, vi} from 'vitest';
import Database from 'better-sqlite3';
import {createSessionStore} from './store.js';
import type {RuntimeEvent} from '../runtime/types.js';
import type {FeedEvent} from '../feed/types.js';

// Helper: minimal RuntimeEvent
function makeRuntimeEvent(overrides: Partial<RuntimeEvent> = {}): RuntimeEvent {
	return {
		id: 'rt-1',
		timestamp: Date.now(),
		hookName: 'PreToolUse',
		sessionId: 'claude-session-1',
		context: {cwd: '/tmp', transcriptPath: '/tmp/t.jsonl'},
		interaction: {expectsDecision: false},
		payload: {tool_name: 'Bash'},
		...overrides,
	} as RuntimeEvent;
}

// Helper: minimal FeedEvent
function makeFeedEvent(overrides: Partial<FeedEvent> = {}): FeedEvent {
	return {
		event_id: 'run1:E1',
		seq: 1,
		ts: Date.now(),
		session_id: 'claude-session-1',
		run_id: 'run1',
		kind: 'tool.pre',
		level: 'info',
		actor_id: 'agent:root',
		title: 'Bash',
		data: {},
		...overrides,
	} as unknown as FeedEvent;
}

describe('SessionStore', () => {
	let store: ReturnType<typeof createSessionStore>;

	afterEach(() => {
		store?.close();
	});

	it('records a runtime event and retrieves it', () => {
		store = createSessionStore({
			sessionId: 's1',
			projectDir: '/home/user/proj',
			dbPath: ':memory:',
		});

		const rtEvent = makeRuntimeEvent({id: 'rt-1', sessionId: 'cs-1'});
		store.recordRuntimeEvent(rtEvent);

		const restored = store.restore();
		expect(restored.session.id).toBe('s1');
		expect(restored.session.adapterSessionIds).toContain('cs-1');
	});

	it('records feed events linked to a runtime event', () => {
		store = createSessionStore({
			sessionId: 's2',
			projectDir: '/tmp',
			dbPath: ':memory:',
		});

		const rtEvent = makeRuntimeEvent({id: 'rt-2'});
		store.recordRuntimeEvent(rtEvent);

		const fe1 = makeFeedEvent({event_id: 'run1:E1', seq: 1});
		const fe2 = makeFeedEvent({event_id: 'run1:E2', seq: 2});
		store.recordFeedEvents('rt-2', [fe1, fe2]);

		const restored = store.restore();
		expect(restored.feedEvents).toHaveLength(2);
		expect(restored.feedEvents[0]!.event_id).toBe('run1:E1');
		expect(restored.feedEvents[1]!.event_id).toBe('run1:E2');
	});

	it('tracks adapter sessions from runtime events', () => {
		store = createSessionStore({
			sessionId: 's3',
			projectDir: '/tmp',
			dbPath: ':memory:',
		});

		store.recordRuntimeEvent(
			makeRuntimeEvent({id: 'rt-a', sessionId: 'adapter-1'}),
		);
		store.recordRuntimeEvent(
			makeRuntimeEvent({id: 'rt-b', sessionId: 'adapter-1'}),
		);
		store.recordRuntimeEvent(
			makeRuntimeEvent({id: 'rt-c', sessionId: 'adapter-2'}),
		);

		const restored = store.restore();
		expect(restored.session.adapterSessionIds).toEqual([
			'adapter-1',
			'adapter-2',
		]);
		expect(restored.adapterSessions).toHaveLength(2);
	});

	it('updates session updatedAt on each runtime event', () => {
		store = createSessionStore({
			sessionId: 's4',
			projectDir: '/tmp',
			dbPath: ':memory:',
		});

		const t1 = 1000;
		const t2 = 2000;
		store.recordRuntimeEvent(makeRuntimeEvent({id: 'r1', timestamp: t1}));
		store.recordRuntimeEvent(makeRuntimeEvent({id: 'r2', timestamp: t2}));

		const restored = store.restore();
		expect(restored.session.updatedAt).toBe(t2);
	});

	it('returns empty feedEvents when nothing recorded', () => {
		store = createSessionStore({
			sessionId: 's5',
			projectDir: '/tmp',
			dbPath: ':memory:',
		});

		const restored = store.restore();
		expect(restored.feedEvents).toEqual([]);
		expect(restored.adapterSessions).toEqual([]);
	});
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/sessions/store.test.ts`
Expected: FAIL — module not found

**Step 3: Write the store implementation**

Create `source/sessions/store.ts`:

```typescript
import Database from 'better-sqlite3';
import {initSchema} from './schema.js';
import type {
	AthenaSession,
	AdapterSessionRecord,
	StoredSession,
} from './types.js';
import type {RuntimeEvent} from '../runtime/types.js';
import type {FeedEvent} from '../feed/types.js';

export type SessionStoreOptions = {
	sessionId: string;
	projectDir: string;
	dbPath: string; // ':memory:' for tests, file path for production
	label?: string;
};

export type SessionStore = {
	recordRuntimeEvent(event: RuntimeEvent): void;
	recordFeedEvents(runtimeEventId: string, feedEvents: FeedEvent[]): void;
	restore(): StoredSession;
	getAthenaSession(): AthenaSession;
	updateLabel(label: string): void;
	close(): void;
};

export function createSessionStore(opts: SessionStoreOptions): SessionStore {
	const db = new Database(opts.dbPath);
	initSchema(db);

	let runtimeSeq = 0;

	// Track known adapter session IDs to avoid duplicate inserts
	const knownAdapterSessions = new Set<string>();

	// Initialize session row
	const now = Date.now();
	db.prepare(
		`INSERT OR IGNORE INTO session (id, project_dir, created_at, updated_at, label)
		 VALUES (?, ?, ?, ?, ?)`,
	).run(opts.sessionId, opts.projectDir, now, now, opts.label ?? null);

	// If resuming, load existing state
	const existingMaxSeq = db
		.prepare('SELECT MAX(seq) as maxSeq FROM runtime_events')
		.get() as {maxSeq: number | null};
	if (existingMaxSeq.maxSeq !== null) {
		runtimeSeq = existingMaxSeq.maxSeq;
	}

	// Load known adapter sessions
	const existingAdapters = db
		.prepare('SELECT session_id FROM adapter_sessions')
		.all() as {session_id: string}[];
	for (const row of existingAdapters) {
		knownAdapterSessions.add(row.session_id);
	}

	// Prepared statements
	const insertRuntimeEvent = db.prepare(
		`INSERT OR IGNORE INTO runtime_events (id, seq, timestamp, hook_name, adapter_session_id, payload)
		 VALUES (?, ?, ?, ?, ?, ?)`,
	);

	const insertFeedEvent = db.prepare(
		`INSERT OR IGNORE INTO feed_events (event_id, runtime_event_id, seq, kind, run_id, actor_id, timestamp, data)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
	);

	const insertAdapterSession = db.prepare(
		`INSERT OR IGNORE INTO adapter_sessions (session_id, started_at)
		 VALUES (?, ?)`,
	);

	const updateSessionTimestamp = db.prepare(
		`UPDATE session SET updated_at = ? WHERE id = ?`,
	);

	function recordRuntimeEvent(event: RuntimeEvent): void {
		runtimeSeq++;
		insertRuntimeEvent.run(
			event.id,
			runtimeSeq,
			event.timestamp,
			event.hookName,
			event.sessionId,
			JSON.stringify(event),
		);

		// Track adapter session
		if (event.sessionId && !knownAdapterSessions.has(event.sessionId)) {
			knownAdapterSessions.add(event.sessionId);
			insertAdapterSession.run(event.sessionId, event.timestamp);
		}

		// Update session timestamp
		updateSessionTimestamp.run(event.timestamp, opts.sessionId);
	}

	function recordFeedEvents(
		runtimeEventId: string,
		feedEvents: FeedEvent[],
	): void {
		const insertMany = db.transaction(() => {
			for (const fe of feedEvents) {
				insertFeedEvent.run(
					fe.event_id,
					runtimeEventId,
					fe.seq,
					fe.kind,
					fe.run_id,
					fe.actor_id,
					fe.ts,
					JSON.stringify(fe),
				);
			}
		});
		insertMany();
	}

	function restore(): StoredSession {
		const sessionRow = db
			.prepare('SELECT * FROM session WHERE id = ?')
			.get(opts.sessionId) as
			| {
					id: string;
					project_dir: string;
					created_at: number;
					updated_at: number;
					label: string | null;
			  }
			| undefined;

		const adapterRows = db
			.prepare('SELECT * FROM adapter_sessions ORDER BY started_at')
			.all() as Array<{
			session_id: string;
			started_at: number;
			ended_at: number | null;
			model: string | null;
			source: string | null;
		}>;

		const feedRows = db
			.prepare('SELECT data FROM feed_events ORDER BY seq')
			.all() as Array<{data: string}>;

		const adapterSessionIds = adapterRows.map(r => r.session_id);

		const session: AthenaSession = sessionRow
			? {
					id: sessionRow.id,
					projectDir: sessionRow.project_dir,
					createdAt: sessionRow.created_at,
					updatedAt: sessionRow.updated_at,
					label: sessionRow.label ?? undefined,
					adapterSessionIds,
				}
			: {
					id: opts.sessionId,
					projectDir: opts.projectDir,
					createdAt: now,
					updatedAt: now,
					adapterSessionIds,
				};

		const adapterSessions: AdapterSessionRecord[] = adapterRows.map(r => ({
			sessionId: r.session_id,
			startedAt: r.started_at,
			endedAt: r.ended_at ?? undefined,
			model: r.model ?? undefined,
			source: r.source ?? undefined,
		}));

		const feedEvents: FeedEvent[] = feedRows.map(
			r => JSON.parse(r.data) as FeedEvent,
		);

		return {session, feedEvents, adapterSessions};
	}

	function getAthenaSession(): AthenaSession {
		return restore().session;
	}

	function updateLabel(label: string): void {
		db.prepare('UPDATE session SET label = ? WHERE id = ?').run(
			label,
			opts.sessionId,
		);
	}

	function close(): void {
		db.close();
	}

	return {
		recordRuntimeEvent,
		recordFeedEvents,
		restore,
		getAthenaSession,
		updateLabel,
		close,
	};
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run source/sessions/store.test.ts`
Expected: PASS

**Step 5: Update barrel export**

Add to `source/sessions/index.ts`:

```typescript
export type {
	AthenaSession,
	AdapterSessionRecord,
	StoredSession,
} from './types.js';
export {createSessionStore} from './store.js';
export type {SessionStore, SessionStoreOptions} from './store.js';
```

**Step 6: Commit**

```bash
git add source/sessions/store.ts source/sessions/store.test.ts source/sessions/index.ts
git commit -m "feat(sessions): add SessionStore with SQLite recording and restore"
```

---

### Task 4: Session Registry

**Files:**

- Create: `source/sessions/registry.ts`
- Test: `source/sessions/registry.test.ts`

**Step 1: Write the failing test**

Create `source/sessions/registry.test.ts`:

```typescript
import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createSessionStore} from './store.js';
import {
	listSessions,
	getSessionMeta,
	removeSession,
	getMostRecentAthenaSession,
	sessionsDir,
} from './registry.js';

describe('session registry', () => {
	let tmpDir: string;
	let originalHome: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'athena-sessions-'));
		originalHome = process.env['HOME']!;
		// Override HOME so sessionsDir() resolves to our tmpDir
		process.env['HOME'] = tmpDir;
		// Create the sessions directory
		fs.mkdirSync(sessionsDir(), {recursive: true});
	});

	afterEach(() => {
		process.env['HOME'] = originalHome;
		fs.rmSync(tmpDir, {recursive: true, force: true});
	});

	it('lists sessions from disk', () => {
		// Create two sessions via store
		const s1 = createSessionStore({
			sessionId: 'sess-1',
			projectDir: '/proj/a',
			dbPath: path.join(sessionsDir(), 'sess-1', 'session.db'),
		});
		s1.close();

		const s2 = createSessionStore({
			sessionId: 'sess-2',
			projectDir: '/proj/b',
			dbPath: path.join(sessionsDir(), 'sess-2', 'session.db'),
		});
		s2.close();

		const sessions = listSessions();
		expect(sessions).toHaveLength(2);
		expect(sessions.map(s => s.id)).toContain('sess-1');
		expect(sessions.map(s => s.id)).toContain('sess-2');
	});

	it('filters sessions by projectDir', () => {
		const s1 = createSessionStore({
			sessionId: 'sess-a',
			projectDir: '/proj/a',
			dbPath: path.join(sessionsDir(), 'sess-a', 'session.db'),
		});
		s1.close();

		const s2 = createSessionStore({
			sessionId: 'sess-b',
			projectDir: '/proj/b',
			dbPath: path.join(sessionsDir(), 'sess-b', 'session.db'),
		});
		s2.close();

		const filtered = listSessions('/proj/a');
		expect(filtered).toHaveLength(1);
		expect(filtered[0]!.id).toBe('sess-a');
	});

	it('gets session metadata by ID', () => {
		const store = createSessionStore({
			sessionId: 'sess-x',
			projectDir: '/my/proj',
			dbPath: path.join(sessionsDir(), 'sess-x', 'session.db'),
		});
		store.updateLabel('my label');
		store.close();

		const meta = getSessionMeta('sess-x');
		expect(meta).not.toBeNull();
		expect(meta!.projectDir).toBe('/my/proj');
		expect(meta!.label).toBe('my label');
	});

	it('returns null for nonexistent session', () => {
		expect(getSessionMeta('nonexistent')).toBeNull();
	});

	it('removes a session directory', () => {
		const store = createSessionStore({
			sessionId: 'sess-del',
			projectDir: '/tmp',
			dbPath: path.join(sessionsDir(), 'sess-del', 'session.db'),
		});
		store.close();

		removeSession('sess-del');
		expect(getSessionMeta('sess-del')).toBeNull();
	});

	it('gets most recent session for a project', () => {
		// Create two sessions for same project with different timestamps
		const s1 = createSessionStore({
			sessionId: 'old',
			projectDir: '/proj',
			dbPath: path.join(sessionsDir(), 'old', 'session.db'),
		});
		s1.close();

		// Ensure s2 is newer
		const s2 = createSessionStore({
			sessionId: 'new',
			projectDir: '/proj',
			dbPath: path.join(sessionsDir(), 'new', 'session.db'),
		});
		s2.close();

		const recent = getMostRecentAthenaSession('/proj');
		expect(recent).not.toBeNull();
		expect(recent!.id).toBe('new');
	});
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/sessions/registry.test.ts`
Expected: FAIL — module not found

**Step 3: Write the registry implementation**

Create `source/sessions/registry.ts`:

```typescript
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import Database from 'better-sqlite3';
import type {AthenaSession} from './types.js';

export function sessionsDir(): string {
	return path.join(os.homedir(), '.config', 'athena', 'sessions');
}

function sessionDbPath(sessionId: string): string {
	return path.join(sessionsDir(), sessionId, 'session.db');
}

function readSessionFromDb(dbPath: string): AthenaSession | null {
	if (!fs.existsSync(dbPath)) return null;

	try {
		const db = new Database(dbPath, {readonly: true});
		const row = db.prepare('SELECT * FROM session LIMIT 1').get() as
			| {
					id: string;
					project_dir: string;
					created_at: number;
					updated_at: number;
					label: string | null;
			  }
			| undefined;

		const adapters = db
			.prepare('SELECT session_id FROM adapter_sessions ORDER BY started_at')
			.all() as {session_id: string}[];

		db.close();

		if (!row) return null;

		return {
			id: row.id,
			projectDir: row.project_dir,
			createdAt: row.created_at,
			updatedAt: row.updated_at,
			label: row.label ?? undefined,
			adapterSessionIds: adapters.map(a => a.session_id),
		};
	} catch {
		return null;
	}
}

export function listSessions(projectDir?: string): AthenaSession[] {
	const dir = sessionsDir();
	if (!fs.existsSync(dir)) return [];

	const entries = fs.readdirSync(dir, {withFileTypes: true});
	const sessions: AthenaSession[] = [];

	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		const dbPath = path.join(dir, entry.name, 'session.db');
		const session = readSessionFromDb(dbPath);
		if (session) {
			if (!projectDir || session.projectDir === projectDir) {
				sessions.push(session);
			}
		}
	}

	return sessions.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getSessionMeta(sessionId: string): AthenaSession | null {
	return readSessionFromDb(sessionDbPath(sessionId));
}

export function removeSession(sessionId: string): void {
	const dir = path.join(sessionsDir(), sessionId);
	if (fs.existsSync(dir)) {
		fs.rmSync(dir, {recursive: true, force: true});
	}
}

export function getMostRecentAthenaSession(
	projectDir: string,
): AthenaSession | null {
	const sessions = listSessions(projectDir);
	return sessions[0] ?? null;
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run source/sessions/registry.test.ts`
Expected: PASS

**Step 5: Update barrel export**

Add to `source/sessions/index.ts`:

```typescript
export {
	listSessions,
	getSessionMeta,
	removeSession,
	getMostRecentAthenaSession,
	sessionsDir,
} from './registry.js';
```

**Step 6: Commit**

```bash
git add source/sessions/registry.ts source/sessions/registry.test.ts source/sessions/index.ts
git commit -m "feat(sessions): add session registry for listing and managing sessions"
```

---

### Task 5: Extend createFeedMapper to Accept StoredSession

**Files:**

- Modify: `source/feed/mapper.ts:22-33` (factory signature + state init)
- Test: `source/feed/mapper.test.ts` (add restore test)

**Step 1: Write the failing test**

Add a new test to the existing mapper test file (or create if needed). The test verifies that `createFeedMapper(stored)` initializes state from stored data and produces correct sequence numbers for new events.

```typescript
// Add to mapper tests:
import type {StoredSession} from '../sessions/types.js';

describe('createFeedMapper with stored session', () => {
	it('bootstraps seq and runSeq from stored feed events', () => {
		const stored: StoredSession = {
			session: {
				id: 'athena-1',
				projectDir: '/tmp',
				createdAt: 1000,
				updatedAt: 2000,
				adapterSessionIds: ['cs-1'],
			},
			feedEvents: [
				// Simulate a previous run with 3 events
				makeFeedEvent({
					event_id: 'R1:E1',
					seq: 1,
					run_id: 'R1',
					kind: 'session.start',
				}),
				makeFeedEvent({
					event_id: 'R1:E2',
					seq: 2,
					run_id: 'R1',
					kind: 'tool.pre',
				}),
				makeFeedEvent({
					event_id: 'R1:E3',
					seq: 3,
					run_id: 'R1',
					kind: 'session.end',
				}),
			],
			adapterSessions: [{sessionId: 'cs-1', startedAt: 1000}],
		};

		const mapper = createFeedMapper(stored);

		// Mapper should have restored session state
		expect(mapper.getSession()).not.toBeNull();
	});
});
```

The exact test details depend on the existing test patterns in `source/feed/mapper.test.ts`. Read the file first and follow its conventions.

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/feed/mapper.test.ts`
Expected: FAIL — `createFeedMapper` does not accept arguments

**Step 3: Modify createFeedMapper to accept optional StoredSession**

In `source/feed/mapper.ts`, change the signature at line 22:

```typescript
// Before:
export function createFeedMapper(): FeedMapper {

// After:
export function createFeedMapper(stored?: StoredSession): FeedMapper {
```

Add import at top:

```typescript
import type {StoredSession} from '../sessions/types.js';
```

After the state variable declarations (around line 33), add initialization from stored data:

```typescript
// Bootstrap from stored session if provided
if (stored && stored.feedEvents.length > 0) {
	const lastEvent = stored.feedEvents[stored.feedEvents.length - 1]!;
	seq = lastEvent.seq;

	// Count distinct run_ids to set runSeq
	const runIds = new Set(stored.feedEvents.map(e => e.run_id));
	runSeq = runIds.size;

	// Reconstruct session from last session.start event
	const lastSessionStart = [...stored.feedEvents]
		.reverse()
		.find(e => e.kind === 'session.start');
	if (lastSessionStart) {
		currentSession = {
			session_id: lastSessionStart.session_id,
			started_at: lastSessionStart.ts,
			source: (lastSessionStart.data as any)?.source,
			model: (lastSessionStart.data as any)?.model,
		};
	}

	// Reconstruct current run from last run.start event
	const lastRunStart = [...stored.feedEvents]
		.reverse()
		.find(e => e.kind === 'run.start');
	if (lastRunStart) {
		currentRun = {
			run_id: lastRunStart.run_id,
			session_id: lastRunStart.session_id,
			started_at: lastRunStart.ts,
			trigger: (lastRunStart.data as any)?.trigger ?? {
				type: 'unknown',
				prompt_preview: '',
			},
			status: 'completed',
			actors: {root_agent_id: 'agent:root', subagent_ids: []},
			counters: {
				tool_uses: 0,
				tool_failures: 0,
				permission_requests: 0,
				blocks: 0,
			},
		};
	}

	// Reconstruct actors from feed events
	const actorIds = new Set(stored.feedEvents.map(e => e.actor_id));
	for (const actorId of actorIds) {
		if (
			actorId === 'user' ||
			actorId === 'system' ||
			actorId === 'agent:root'
		) {
			actors.getOrCreate(actorId);
		} else if (actorId.startsWith('subagent:')) {
			actors.getOrCreate(actorId);
		}
	}
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run source/feed/mapper.test.ts`
Expected: PASS

**Step 5: Run all existing mapper tests to verify no regressions**

Run: `npx vitest run source/feed/`
Expected: All PASS

**Step 6: Commit**

```bash
git add source/feed/mapper.ts source/feed/mapper.test.ts
git commit -m "feat(feed): extend createFeedMapper to bootstrap state from StoredSession"
```

---

### Task 6: Integrate SessionStore into useFeed

**Files:**

- Modify: `source/hooks/useFeed.ts:134-138` (signature), `~148` (mapper init), `~310-345` (event handler), `~24` (MAX_EVENTS)
- Test: `source/hooks/useFeed.test.ts` (add session store integration tests)

**Step 1: Write the failing test**

Add to existing useFeed tests or create a new describe block:

```typescript
import {createSessionStore} from '../sessions/store.js';

describe('useFeed with SessionStore', () => {
	it('records feed events to session store', () => {
		const store = createSessionStore({
			sessionId: 'test-s1',
			projectDir: '/tmp',
			dbPath: ':memory:',
		});

		// Render useFeed with the store, send a runtime event, verify store has data
		// ... follow existing useFeed test patterns with mock runtime
	});

	it('restores feed events from session store on mount', () => {
		// Pre-populate a store with feed events
		// Mount useFeed with that store
		// Verify feedEvents state contains restored events
	});
});
```

The exact implementation depends on existing test patterns in `source/hooks/useFeed.test.ts` — read the file first and follow its mocking conventions for `Runtime`.

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/hooks/useFeed.test.ts`
Expected: FAIL — useFeed doesn't accept sessionStore

**Step 3: Modify useFeed**

In `source/hooks/useFeed.ts`:

1. Change signature (line ~134):

```typescript
export function useFeed(
	runtime: Runtime,
	messages: Message[] = [],
	initialAllowedTools?: string[],
	sessionStore?: SessionStore,
): UseFeedResult {
```

2. Add import:

```typescript
import type {SessionStore} from '../sessions/store.js';
```

3. Modify mapper initialization (line ~148):

```typescript
// If we have a session store, attempt restore and bootstrap mapper
const initialStored = sessionStore ? sessionStore.restore() : undefined;
const mapperRef = useRef<FeedMapper>(createFeedMapper(initialStored));
const [feedEvents, setFeedEvents] = useState<FeedEvent[]>(
	initialStored?.feedEvents ?? [],
);
```

4. In the onEvent handler (around line ~320), after `mapEvent`, record to store:

```typescript
const newFeedEvents = mapperRef.current.mapEvent(runtimeEvent);

// Persist to session store
if (sessionStoreRef.current) {
	sessionStoreRef.current.recordRuntimeEvent(runtimeEvent);
	if (newFeedEvents.length > 0) {
		sessionStoreRef.current.recordFeedEvents(runtimeEvent.id, newFeedEvents);
	}
}
```

5. Use a ref for sessionStore to avoid stale closures:

```typescript
const sessionStoreRef = useRef(sessionStore);
sessionStoreRef.current = sessionStore;
```

6. Remove the MAX_EVENTS cap (line ~340-345) or make it conditional:

```typescript
setFeedEvents(prev => {
	const updated = [...prev, ...newFeedEvents];
	// No cap when using persistent sessions — SQLite is the source of truth
	if (!sessionStoreRef.current && updated.length > MAX_EVENTS) {
		return updated.slice(-MAX_EVENTS);
	}
	return updated;
});
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run source/hooks/useFeed.test.ts`
Expected: PASS

**Step 5: Run full test suite**

Run: `npx vitest run source/`
Expected: All PASS — existing tests unaffected (sessionStore is optional)

**Step 6: Commit**

```bash
git add source/hooks/useFeed.ts source/hooks/useFeed.test.ts
git commit -m "feat(feed): integrate SessionStore into useFeed for recording and restore"
```

---

### Task 7: Wire SessionStore into HookProvider and App

**Files:**

- Modify: `source/context/HookContext.tsx:11-27` (add sessionStore creation)
- Modify: `source/app.tsx:41-56` (add athenaSessionId prop), `~724-729` (phase routing)
- Modify: `source/cli.tsx:91-97` (flag changes), `~214-231` (resolution logic)

**Step 1: Modify HookProvider to create SessionStore**

In `source/context/HookContext.tsx`:

```typescript
import {createSessionStore, type SessionStore} from '../sessions/store.js';
import {sessionsDir} from '../sessions/registry.js';
import path from 'node:path';
import fs from 'node:fs';

export function HookProvider({
	projectDir,
	instanceId,
	allowedTools,
	athenaSessionId,
	children,
}: HookProviderProps & {athenaSessionId: string}) {
	const runtime = useMemo(
		() => createClaudeHookRuntime({projectDir, instanceId}),
		[projectDir, instanceId],
	);

	const sessionStore = useMemo(() => {
		const dir = path.join(sessionsDir(), athenaSessionId);
		fs.mkdirSync(dir, {recursive: true});
		return createSessionStore({
			sessionId: athenaSessionId,
			projectDir,
			dbPath: path.join(dir, 'session.db'),
		});
	}, [athenaSessionId, projectDir]);

	const hookServer = useFeed(runtime, [], allowedTools, sessionStore);

	return (
		<HookContext.Provider value={hookServer}>{children}</HookContext.Provider>
	);
}
```

**Step 2: Add athenaSessionId to App props**

In `source/app.tsx`, add `athenaSessionId: string` to the `Props` type and thread it through to `HookProvider`.

**Step 3: Update cli.tsx for athena session resolution**

In `source/cli.tsx`:

```typescript
import {nanoid} from 'nanoid'; // or use crypto.randomUUID()
import {getMostRecentAthenaSession} from './sessions/registry.js';

// Replace Claude session resolution with athena session resolution:
let athenaSessionId: string;
let initialSessionId: string | undefined; // Claude session ID, if resuming Claude too

const hasContinueFlag = process.argv.includes('--continue');

if (cli.flags.continue) {
	// --continue=<athenaSessionId>
	athenaSessionId = cli.flags.continue;
} else if (hasContinueFlag) {
	// --continue (no value) — resume most recent athena session for this project
	const recent = getMostRecentAthenaSession(cli.flags.projectDir);
	if (recent) {
		athenaSessionId = recent.id;
	} else {
		athenaSessionId = nanoid();
	}
} else {
	athenaSessionId = nanoid();
}
```

**Step 4: Handle --label flag**

Add to meow flags definition:

```typescript
label: {
	type: 'string',
},
```

**Step 5: Run lint and typecheck**

Run: `npm run lint && npx tsc --noEmit`
Expected: No errors

**Step 6: Run full test suite**

Run: `npx vitest run source/`
Expected: All PASS

**Step 7: Commit**

```bash
git add source/context/HookContext.tsx source/app.tsx source/cli.tsx
git commit -m "feat(sessions): wire SessionStore into HookProvider and CLI flags"
```

---

### Task 8: Update Session Picker for Athena Sessions

**Files:**

- Modify: `source/app.tsx:~743-746` (session picker data source)
- Modify: any session picker component that renders the list

**Step 1: Update session picker to read from athena registry**

Replace the `readSessionIndex(projectDir)` call with `listSessions(projectDir)` from `source/sessions/registry.js`.

Map `AthenaSession` to whatever format the session picker component expects, or update the component to accept `AthenaSession[]`.

**Step 2: Update session selection handler**

When user selects a session, pass the athena session ID (not a Claude session ID) to the `main` phase.

**Step 3: Run typecheck and lint**

Run: `npm run lint && npx tsc --noEmit`
Expected: No errors

**Step 4: Manual test**

Run: `npm run build && node dist/cli.js --sessions`
Expected: Shows athena sessions (empty list initially is fine)

**Step 5: Commit**

```bash
git add source/app.tsx
git commit -m "feat(sessions): update session picker to use athena session registry"
```

---

### Task 9: End-to-End Integration Test

**Files:**

- Create: `source/sessions/integration.test.ts`

**Step 1: Write integration test**

This test simulates the full lifecycle: create store → record runtime events → record feed events → close → restore → verify feed is populated.

```typescript
import {describe, it, expect} from 'vitest';
import {createSessionStore} from './store.js';
import {createFeedMapper} from '../feed/mapper.js';
import type {RuntimeEvent} from '../runtime/types.js';

describe('session store integration', () => {
	it('full lifecycle: record → close → restore → verify', () => {
		// Phase 1: Record events
		const store = createSessionStore({
			sessionId: 'integration-1',
			projectDir: '/test/proj',
			dbPath: ':memory:',
		});

		// Simulate a SessionStart runtime event
		const sessionStartEvent: RuntimeEvent = {
			id: 'evt-1',
			timestamp: 1000,
			hookName: 'SessionStart',
			sessionId: 'claude-1',
			context: {cwd: '/test', transcriptPath: '/tmp/t.jsonl'},
			interaction: {expectsDecision: false},
			payload: {session_id: 'claude-1', source: 'startup'},
		} as RuntimeEvent;

		// Use real mapper to produce feed events
		const mapper = createFeedMapper();
		const feedEvents = mapper.mapEvent(sessionStartEvent);

		store.recordRuntimeEvent(sessionStartEvent);
		store.recordFeedEvents(sessionStartEvent.id, feedEvents);

		// Phase 2: Restore and verify
		const restored = store.restore();
		expect(restored.session.id).toBe('integration-1');
		expect(restored.session.projectDir).toBe('/test/proj');
		expect(restored.feedEvents.length).toBeGreaterThan(0);
		expect(restored.adapterSessions).toHaveLength(1);
		expect(restored.adapterSessions[0]!.sessionId).toBe('claude-1');

		// Phase 3: Bootstrap mapper from restored data
		const restoredMapper = createFeedMapper(restored);
		expect(restoredMapper.getSession()).not.toBeNull();

		store.close();
	});
});
```

**Step 2: Run integration test**

Run: `npx vitest run source/sessions/integration.test.ts`
Expected: PASS

**Step 3: Run full test suite, lint, and typecheck**

Run: `npx vitest run source/ && npm run lint && npx tsc --noEmit`
Expected: All PASS

**Step 4: Commit**

```bash
git add source/sessions/integration.test.ts
git commit -m "test(sessions): add end-to-end integration test for session lifecycle"
```

---

### Task 10: Final Cleanup and Barrel Exports

**Files:**

- Modify: `source/sessions/index.ts` (ensure all public API exported)
- Verify: All imports use `.js` extensions (ESM requirement)

**Step 1: Verify barrel export is complete**

`source/sessions/index.ts` should export:

```typescript
// Types
export type {
	AthenaSession,
	AdapterSessionRecord,
	StoredSession,
} from './types.js';
export type {SessionStore, SessionStoreOptions} from './store.js';

// Factories
export {createSessionStore} from './store.js';

// Registry
export {
	listSessions,
	getSessionMeta,
	removeSession,
	getMostRecentAthenaSession,
	sessionsDir,
} from './registry.js';

// Schema (for advanced usage / migrations)
export {SCHEMA_VERSION} from './schema.js';
```

**Step 2: Run full test suite, lint, typecheck**

Run: `npx vitest run source/ && npm run lint && npx tsc --noEmit`
Expected: All PASS, no lint errors, no type errors

**Step 3: Commit**

```bash
git add source/sessions/index.ts
git commit -m "chore(sessions): finalize barrel exports for sessions module"
```
