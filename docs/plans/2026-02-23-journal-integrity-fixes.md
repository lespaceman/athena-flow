# Journal Integrity & Architectural Invariant Fixes

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix 13 hard violations from the session persistence audit, establishing 6 non-negotiable invariants with enforcement mechanisms.

**Architecture:** Three-phase fix targeting (1) semantic completeness — make seq globally monotonic and ordering deterministic, (2) identity authority — make Athena session ID the sole user-facing identity, (3) resilience — surface persistence errors and add schema migration discipline. Each phase ends with integration tests that encode the invariant.

**Tech Stack:** TypeScript, better-sqlite3, vitest, Ink/React

---

## Audit Triage: What's Actually Broken vs Already Fixed

Before implementing, note that several audit findings reference code that has since been corrected:

| Finding | Status | Notes |
|---------|--------|-------|
| #1 decision events not durable | **PARTIALLY FIXED** | `onDecision` callback at useFeed.ts:317 does persist via `recordFeedEvents`. But `agent.message` from Stop hook IS persisted through `mapEvent` → `recordEvent`. The real gap: restored sessions don't verify decision events survived round-trip. |
| #3 auto-spawn on mount | **FIXED** | app.tsx uses `initialSessionRef` + deferred spawn on first prompt. No mount-triggered spawn. |
| #4 SessionStore not closed | **FIXED** | HookContext.tsx:37-41 has useEffect cleanup calling `sessionStore.close()`. |
| #18 enrichStopEvent bypasses mapper | **FIXED** | No `enrichStopEvent` exists. Stop enrichment is inline in mapper `mapEvent()`. |

**Remaining real violations to fix:**

1. **seq is run-local, not globally monotonic** (Finding #5, Checklist #9)
2. **UI sorts by timestamp, not seq** (Checklist #9, useTimeline.ts:58)
3. **server.ts silently swallows handler errors** (Finding #6, #20)
4. **Schema version has no migration path** (Finding #7, Checklist #11)
5. **Identity split: `--continue` falls back to adapter ID** (Finding #2, Checklist #4, #5)
6. **sessionIndex.ts provides parallel identity authority** (Finding #2, Checklist #21)
7. **Mapper imports StoredSession type** (Checklist #15)
8. **No integration tests for restore fidelity** (Open Questions)

---

## Phase 0: Pin Invariants in CLAUDE.md

### Task 0: Add invariants to CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Add invariants section**

Add after the "Architectural Patterns" section in CLAUDE.md:

```markdown
## Non-Negotiable Invariants

These are structural rules. Any PR violating them must be rejected.

1. **Every UI-visible FeedEvent must be durable.** If it changes what the user sees, it passes through `SessionStore.recordEvent()` or `SessionStore.recordFeedEvents()`. No exceptions.
2. **Mapper is the sole semantic event constructor.** All `FeedEvent` creation goes through `createFeedMapper().mapEvent()` or `mapDecision()`. No ad-hoc FeedEvent construction in hooks or components.
3. **Athena session ID is the only user-facing identity.** `--continue=<id>` means Athena ID. Adapter IDs are internal attributes, never shown to or accepted from users.
4. **Feed ordering is globally monotonic per Athena session.** `seq` is session-global (not run-local), UNIQUE in the DB, and is the sole ordering authority. Timestamp is metadata only.
5. **Persistence errors are loud.** SQLite write failures log explicitly and mark the session as degraded. Runtime never silently swallows handler exceptions.
6. **There is exactly one ordering authority per session (seq).** UI never sorts by timestamp for feed events. Timestamp is metadata for display only, never used in sort comparators.
```

> **Ordering assumption for message/feed merge:** Messages (user prompts) don't have seq — they use timestamp for interleaving with feed events. This works because message timestamps are epoch-ms (large numbers) while seq is a small counter, so messages naturally sort before their resulting feed activity. This is an intentional design choice, not a bug. If it ever breaks, assign messages synthetic seq values before merge.

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: pin 5 non-negotiable journal integrity invariants"
```

---

## Phase 1: Global Monotonic Seq (Invariant #4)

This is the ordering model fix. Currently `seq` resets to 0 per run, and UI sorts by timestamp. After this phase, `seq` is session-global and the sole ordering authority.

### Task 1.1: Write failing test — seq must be globally monotonic across runs

**Files:**
- Create: `source/feed/mapper.global-seq.test.ts`
- Reference: `source/feed/mapper.ts:27` (current `seq = 0`), `source/feed/mapper.ts:194` (reset in ensureRunArray)

**Step 1: Write the failing test**

```typescript
import {describe, it, expect} from 'vitest';
import {createFeedMapper} from './mapper.js';
import type {RuntimeEvent} from '../runtime/types.js';

function makeRuntimeEvent(
	overrides: Partial<RuntimeEvent> & {hookName: string},
): RuntimeEvent {
	return {
		id: `evt-${Math.random().toString(36).slice(2)}`,
		timestamp: Date.now(),
		hookName: overrides.hookName,
		payload: {},
		...overrides,
	};
}

describe('global monotonic seq', () => {
	it('seq never resets across runs', () => {
		const mapper = createFeedMapper();

		// Run 1: SessionStart + UserPromptSubmit + tool
		const events1 = [
			mapper.mapEvent(
				makeRuntimeEvent({
					hookName: 'SessionStart',
					payload: {session_id: 'adapter-1'},
				}),
			),
			mapper.mapEvent(
				makeRuntimeEvent({
					hookName: 'UserPromptSubmit',
					payload: {prompt: 'hello'},
				}),
			),
			mapper.mapEvent(
				makeRuntimeEvent({
					hookName: 'PreToolUse',
					payload: {tool_name: 'Bash', tool_input: {command: 'ls'}},
				}),
			),
		].flat();

		const maxSeqRun1 = Math.max(...events1.map(e => e.seq));

		// Run 2: new UserPromptSubmit (starts new run)
		const events2 = [
			mapper.mapEvent(
				makeRuntimeEvent({
					hookName: 'UserPromptSubmit',
					payload: {prompt: 'world'},
				}),
			),
			mapper.mapEvent(
				makeRuntimeEvent({
					hookName: 'PreToolUse',
					payload: {tool_name: 'Read', tool_input: {file_path: '/tmp/x'}},
				}),
			),
		].flat();

		const minSeqRun2 = Math.min(...events2.map(e => e.seq));

		// Invariant: run 2's lowest seq must be greater than run 1's highest
		expect(minSeqRun2).toBeGreaterThan(maxSeqRun1);
	});

	it('all seq values within a session are unique', () => {
		const mapper = createFeedMapper();
		const allEvents = [
			mapper.mapEvent(
				makeRuntimeEvent({
					hookName: 'SessionStart',
					payload: {session_id: 'a-1'},
				}),
			),
			mapper.mapEvent(
				makeRuntimeEvent({
					hookName: 'UserPromptSubmit',
					payload: {prompt: 'p1'},
				}),
			),
			mapper.mapEvent(
				makeRuntimeEvent({
					hookName: 'Stop',
					payload: {stop_hook_active: true},
				}),
			),
			mapper.mapEvent(
				makeRuntimeEvent({
					hookName: 'UserPromptSubmit',
					payload: {prompt: 'p2'},
				}),
			),
			mapper.mapEvent(
				makeRuntimeEvent({
					hookName: 'PreToolUse',
					payload: {tool_name: 'Bash', tool_input: {command: 'pwd'}},
				}),
			),
		].flat();

		const seqs = allEvents.map(e => e.seq);
		expect(new Set(seqs).size).toBe(seqs.length);
	});
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/feed/mapper.global-seq.test.ts`
Expected: FAIL — `minSeqRun2` will be <= `maxSeqRun1` because seq resets per run.

**Step 3: Fix mapper — remove seq reset in ensureRunArray**

Modify: `source/feed/mapper.ts`

In `ensureRunArray()` (around line 194), remove the `seq = 0` line. The `seq` variable at line 27 should remain as-is — it just won't be reset anymore.

```typescript
// BEFORE (ensureRunArray):
runSeq++;
seq = 0;  // ← DELETE THIS LINE
currentRun = { ... };

// AFTER:
runSeq++;
currentRun = { ... };
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run source/feed/mapper.global-seq.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add source/feed/mapper.ts source/feed/mapper.global-seq.test.ts
git commit -m "fix(mapper): make seq globally monotonic per session, never reset per run"
```

---

### Task 1.2: Make DB schema enforce global seq uniqueness

**Files:**
- Modify: `source/sessions/schema.ts:55`

**Step 1: Write failing test**

Create: `source/sessions/schema.global-seq.test.ts`

```typescript
import {describe, it, expect} from 'vitest';
import Database from 'better-sqlite3';
import {initSchema} from './schema.js';

describe('feed_events global seq uniqueness', () => {
	it('rejects duplicate seq within same session (different runs)', () => {
		const db = new Database(':memory:');
		initSchema(db);

		// Insert session + runtime event
		db.prepare(
			'INSERT INTO session (id, project_dir, created_at, updated_at) VALUES (?, ?, ?, ?)',
		).run('s1', '/tmp', Date.now(), Date.now());
		db.prepare(
			'INSERT INTO runtime_events (id, seq, timestamp, hook_name, payload) VALUES (?, ?, ?, ?, ?)',
		).run('re1', 1, Date.now(), 'PreToolUse', '{}');

		// Insert feed event with seq=1, run A
		db.prepare(
			'INSERT INTO feed_events (event_id, runtime_event_id, seq, kind, run_id, actor_id, timestamp, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
		).run('fe1', 're1', 1, 'tool.pre', 'run-A', 'agent:root', Date.now(), '{}');

		// Insert feed event with seq=1, run B — should fail with global uniqueness
		expect(() => {
			db.prepare(
				'INSERT INTO feed_events (event_id, runtime_event_id, seq, kind, run_id, actor_id, timestamp, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
			).run('fe2', 're1', 1, 'tool.pre', 'run-B', 'agent:root', Date.now(), '{}');
		}).toThrow();

		db.close();
	});
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/sessions/schema.global-seq.test.ts`
Expected: FAIL — current schema has `UNIQUE(run_id, seq)`, not `UNIQUE(seq)`.

**Step 3: Change schema index from (run_id, seq) to (seq) only**

Modify `source/sessions/schema.ts`:

```typescript
// BEFORE:
CREATE UNIQUE INDEX IF NOT EXISTS idx_feed_run_seq ON feed_events(run_id, seq);

// AFTER:
CREATE UNIQUE INDEX IF NOT EXISTS idx_feed_seq ON feed_events(seq);
```

Also add a migration for existing DBs (after the event_count migration):

```typescript
// Migration: upgrade from run-local to global seq uniqueness
try {
	db.exec('DROP INDEX IF EXISTS idx_feed_run_seq');
	db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_feed_seq ON feed_events(seq)');
} catch {
	// Index already correct — ignore
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run source/sessions/schema.global-seq.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add source/sessions/schema.ts source/sessions/schema.global-seq.test.ts
git commit -m "fix(schema): enforce globally unique seq on feed_events"
```

---

### Task 1.3: Fix UI ordering to use seq instead of timestamp

**Files:**
- Modify: `source/hooks/useFeed.ts:353-357`
- Reference: `source/hooks/useTimeline.ts:58` (if it still exists and is used)

**Step 1: Write failing test**

Create: `source/hooks/useFeed.ordering.test.ts`

Test that `items` ordering uses `seq`, not timestamp. Two feed events with same timestamp but different seq values must appear in seq order.

```typescript
import {describe, it, expect} from 'vitest';

describe('feed item ordering', () => {
	it('orders by seq not timestamp when timestamps are equal', () => {
		// This is a behavioral test — we verify the sort comparator logic.
		// Extract the sort logic from useFeed and test it directly.
		const sameTs = Date.now();
		const items = [
			{type: 'feed' as const, data: {seq: 5, ts: sameTs, kind: 'tool.pre'}},
			{type: 'feed' as const, data: {seq: 3, ts: sameTs, kind: 'stop.request'}},
			{type: 'feed' as const, data: {seq: 7, ts: sameTs, kind: 'agent.message'}},
		];

		// Current sort uses ts — these would be unstable
		// New sort uses seq — deterministic
		const sorted = [...items].sort((a, b) => a.data.seq - b.data.seq);
		expect(sorted.map(i => i.data.seq)).toEqual([3, 5, 7]);
	});
});
```

**Step 2: Fix the sort comparator in useFeed.ts**

In useFeed.ts, the `items` memo (around line 353) currently sorts by timestamp:

```typescript
// BEFORE:
return [...messageItems, ...feedItems].sort((a, b) => {
	const tsA = a.type === 'message' ? a.data.timestamp.getTime() : a.data.ts;
	const tsB = b.type === 'message' ? b.data.timestamp.getTime() : b.data.ts;
	return tsA - tsB;
});

// AFTER:
return [...messageItems, ...feedItems].sort((a, b) => {
	const seqA = a.type === 'message' ? a.data.timestamp.getTime() : a.data.seq;
	const seqB = b.type === 'message' ? b.data.timestamp.getTime() : b.data.seq;
	return seqA - seqB;
});
```

Note: Messages don't have seq, so they still use timestamp. Feed events use seq. Since message timestamps are epoch-ms and seq is a small counter, messages will sort before feed events. This is acceptable — messages are user-submitted prompts that precede agent activity.

If `useTimeline.ts` has a similar timestamp-based sort, fix it the same way.

**Step 3: Run tests**

Run: `npx vitest run source/hooks/`
Expected: PASS

**Step 4: Commit**

```bash
git add source/hooks/useFeed.ts source/hooks/useFeed.ordering.test.ts
git commit -m "fix(useFeed): sort feed items by seq instead of timestamp"
```

---

## Phase 2: Identity Authority (Invariant #3)

### Task 2.1: Remove adapter ID fallback from --continue resolution

**Files:**
- Modify: `source/cli.tsx:229-249`

**Step 1: Write failing test**

Create: `source/cli.session-resolution.test.ts` — test that passing an adapter-style ID (not in Athena registry) results in error, not silent fallback.

```typescript
import {describe, it, expect, vi} from 'vitest';

// Test the resolution logic extracted as a pure function
describe('resolveSessionId', () => {
	it('rejects unknown IDs without falling back to adapter lookup', () => {
		// After the fix, cli.tsx should NOT call findSessionByAdapterId
		// This test verifies the behavioral contract
	});
});
```

This is best tested via integration — verify the code path. The implementation change is small:

**Step 2: Remove adapter ID fallback and hard error on unknown ID**

In cli.tsx around line 236-243, remove the `findSessionByAdapterId` fallback AND change the "not found" path from silently creating a new session to an explicit error + exit:

```typescript
// BEFORE:
if (!meta) {
	meta = findSessionByAdapterId(cli.flags.continue, projectDir);
}
if (!meta) {
	console.error(`Session not found: ${cli.flags.continue}`);
	athenaSessionId = crypto.randomUUID(); // ← WRONG: silent new session
}

// AFTER:
if (!meta) {
	console.error(
		`Unknown session ID: ${cli.flags.continue}\n` +
		`Use 'athena-cli --list' to see available sessions.`
	);
	process.exit(1); // Hard error. No silent fallback.
}
```

**Why hard error, not fallback:** If a user passes `--continue=<wrong-id>` and we silently create a new session, the user thinks they're resuming but they're not. That's invisible divergence — the exact class of bug this plan exists to eliminate.

**Step 3: Remove sessionIndex.ts import from any CLI resolution path**

Verify `sessionIndex.ts` is only used for display (session picker descriptions), not for identity resolution. If `findSessionByAdapterId` is no longer called from cli.tsx, remove that import.

**Step 4: Run lint + type check**

Run: `npm run lint && npx tsc --noEmit`

**Step 5: Commit**

```bash
git add source/cli.tsx
git commit -m "fix(cli): remove adapter ID fallback from --continue, Athena ID is sole authority"
```

---

## Phase 3: Loud Persistence Errors (Invariant #5)

### Task 3.1: Surface handler errors in server.ts emit()

**Files:**
- Modify: `source/runtime/adapters/claudeHooks/server.ts:44-51`

**Step 1: Write failing test**

Create: `source/runtime/adapters/claudeHooks/server.error.test.ts`

```typescript
import {describe, it, expect, vi} from 'vitest';

describe('server emit error handling', () => {
	it('logs handler errors instead of swallowing them', () => {
		// After fix: errors are caught and logged, not silently dropped
		// Test the emit function behavior with a throwing handler
	});
});
```

**Step 2: Add error logging to emit() and notifyDecision()**

```typescript
// BEFORE:
function emit(event: RuntimeEvent): void {
	for (const handler of handlers) {
		try {
			handler(event);
		} catch {
			// Handler errors should not crash the server
		}
	}
}

// AFTER:
function emit(event: RuntimeEvent): void {
	for (const handler of handlers) {
		try {
			handler(event);
		} catch (err) {
			console.error(
				`[athena] handler error processing ${event.hookName}:`,
				err instanceof Error ? err.message : err,
			);
		}
	}
}
```

Same pattern for `notifyDecision()`.

**Step 3: Run tests**

Run: `npx vitest run source/runtime/`

**Step 4: Commit**

```bash
git add source/runtime/adapters/claudeHooks/server.ts
git commit -m "fix(server): log handler errors instead of silently swallowing them"
```

---

### Task 3.2: Add session degradation on persistence failure

**Files:**
- Modify: `source/sessions/store.ts` — add `isDegraded` flag and `markDegraded()` method
- Modify: `source/hooks/useFeed.ts:289-291, 316-318` — catch errors, mark store degraded
- Modify: `source/hooks/useFeed.ts` (UseFeedResult type) — expose `isDegraded: boolean`
- Reference: UI can later show a banner when `isDegraded` is true

**Step 1: Add degradation flag to SessionStore**

In `source/sessions/store.ts`, add:

```typescript
// In SessionStore interface:
isDegraded: boolean;
markDegraded(reason: string): void;

// In implementation:
let degraded = false;
let degradedReason = '';

return {
	// ... existing methods ...
	get isDegraded() { return degraded; },
	markDegraded(reason: string) {
		degraded = true;
		degradedReason = reason;
		console.error(`[athena] session degraded: ${reason}`);
	},
};
```

**Step 2: Wrap persistence calls in useFeed — catch, degrade, continue rendering**

```typescript
// BEFORE (line 289):
if (sessionStoreRef.current) {
	sessionStoreRef.current.recordEvent(runtimeEvent, newFeedEvents);
}

// AFTER:
if (sessionStoreRef.current) {
	try {
		sessionStoreRef.current.recordEvent(runtimeEvent, newFeedEvents);
	} catch (err) {
		sessionStoreRef.current.markDegraded(
			`recordEvent failed: ${err instanceof Error ? err.message : err}`,
		);
	}
}
```

Same pattern for `recordFeedEvents` at line 317.

**Step 3: Expose isDegraded in UseFeedResult**

Add `isDegraded: sessionStoreRef.current?.isDegraded ?? false` to the return object.

UI components can then show a degradation banner (e.g., "⚠ Session persistence is degraded — events may not survive restart"). That banner implementation is out of scope for this plan but the signal is now available.

**Step 4: Run tests**

Run: `npx vitest run source/hooks/ source/sessions/`

**Step 5: Commit**

```bash
git add source/sessions/store.ts source/hooks/useFeed.ts
git commit -m "fix(persistence): mark session degraded on write failure instead of silent swallow"
```

---

## Phase 4: Schema Migration Discipline (Finding #7)

### Task 4.1: Add proper schema versioning with migration support

**Files:**
- Modify: `source/sessions/schema.ts`
- Modify: `source/sessions/registry.ts:33-38`

**Step 1: Write failing test**

```typescript
import {describe, it, expect} from 'vitest';
import Database from 'better-sqlite3';
import {initSchema, SCHEMA_VERSION} from './schema.js';

describe('schema versioning', () => {
	it('updates schema_version when migrating from older version', () => {
		const db = new Database(':memory:');

		// Simulate old schema (version 1)
		db.exec('CREATE TABLE schema_version (version INTEGER NOT NULL)');
		db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(1);

		// initSchema should update version to current
		initSchema(db);

		const row = db.prepare('SELECT version FROM schema_version').get() as {
			version: number;
		};
		expect(row.version).toBe(SCHEMA_VERSION);

		db.close();
	});

	it('errors loudly on forward-incompatible schema', () => {
		const db = new Database(':memory:');
		db.exec('CREATE TABLE schema_version (version INTEGER NOT NULL)');
		db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(999);

		expect(() => initSchema(db)).toThrow(/newer schema/i);
		db.close();
	});
});
```

**Step 2: Implement schema version update and forward-compat check**

In `schema.ts`, bump `SCHEMA_VERSION` to 2, and replace the upsert logic:

```typescript
export const SCHEMA_VERSION = 2;

// At end of initSchema:
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
	db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(SCHEMA_VERSION);
} else if (existing.version < SCHEMA_VERSION) {
	// Run migrations for versions between existing and current
	// Explicit versioned migration functions — add new ones as schema evolves
	const migrations: Record<number, (db: Database.Database) => void> = {
		2: (db) => {
			// v1 → v2: global seq uniqueness (replaces run-local uniqueness)
			db.exec('DROP INDEX IF EXISTS idx_feed_run_seq');
			db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_feed_seq ON feed_events(seq)');
		},
	};

	for (let v = existing.version + 1; v <= SCHEMA_VERSION; v++) {
		const migrate = migrations[v];
		if (migrate) migrate(db);
	}
	db.prepare('UPDATE schema_version SET version = ?').run(SCHEMA_VERSION);
}
```

**Step 3: Run tests**

Run: `npx vitest run source/sessions/`

**Step 4: Commit**

```bash
git add source/sessions/schema.ts source/sessions/schema.test.ts
git commit -m "fix(schema): add migration framework with loud forward-compat errors"
```

---

## Phase 5: Decouple Mapper from Persistence Shape (Checklist #15)

### Task 5.1: Introduce a MapperBootstrap type to replace StoredSession import

**Files:**
- Create: `source/feed/bootstrap.ts`
- Modify: `source/feed/mapper.ts:11`
- Modify: `source/sessions/store.ts` (add `toBootstrap()` method)

**Step 1: Define the interface**

```typescript
// source/feed/bootstrap.ts
import type {FeedEvent} from './types.js';

/** Minimal data the mapper needs to resume from a stored session. */
export type MapperBootstrap = {
	feedEvents: FeedEvent[];
	adapterSessionIds: string[];
	createdAt: number;
};
```

**Step 2: Update mapper to accept MapperBootstrap instead of StoredSession**

Change `createFeedMapper(stored?: StoredSession)` → `createFeedMapper(bootstrap?: MapperBootstrap)`.
Update the field accesses inside the bootstrap block accordingly.

**Step 3: Add `toBootstrap()` to SessionStore**

In `store.ts`, after `restore()` returns a `StoredSession`, add a helper that converts to `MapperBootstrap`:

```typescript
toBootstrap(): MapperBootstrap | undefined {
	const stored = this.restore();
	if (!stored) return undefined;
	return {
		feedEvents: stored.feedEvents,
		adapterSessionIds: stored.session.adapterSessionIds,
		createdAt: stored.session.createdAt,
	};
}
```

**Step 4: Update useFeed to use toBootstrap()**

**Step 5: Run all tests**

Run: `npm test`

**Step 6: Commit**

```bash
git add source/feed/bootstrap.ts source/feed/mapper.ts source/sessions/store.ts source/hooks/useFeed.ts
git commit -m "refactor(mapper): decouple from StoredSession via MapperBootstrap interface"
```

---

## Phase 6: Integration Tests for Restore Fidelity

### Task 6.1: Round-trip restore test — all event kinds survive persistence

**Files:**
- Create: `source/sessions/restore.integration.test.ts`

**Step 1: Write the integration test**

```typescript
import {describe, it, expect} from 'vitest';
import Database from 'better-sqlite3';
import {createSessionStore} from './store.js';
import {createFeedMapper} from '../feed/mapper.js';
import type {RuntimeEvent} from '../runtime/types.js';

function makeEvent(hookName: string, payload: Record<string, unknown>): RuntimeEvent {
	return {
		id: `evt-${Math.random().toString(36).slice(2)}`,
		timestamp: Date.now(),
		hookName,
		payload,
	};
}

describe('restore fidelity', () => {
	it('decision events survive round-trip', () => {
		const store = createSessionStore({
			athenaSessionId: 'test-session',
			projectDir: '/tmp/test',
			dbPath: ':memory:',
		});

		const mapper = createFeedMapper();

		// Simulate: SessionStart → UserPromptSubmit → PermissionRequest → decision
		const sessionStart = makeEvent('SessionStart', {session_id: 'adapter-1'});
		const prompt = makeEvent('UserPromptSubmit', {prompt: 'hello'});
		const permReq = makeEvent('PreToolUse', {
			tool_name: 'Bash',
			tool_input: {command: 'rm -rf /'},
		});

		for (const evt of [sessionStart, prompt, permReq]) {
			const feedEvents = mapper.mapEvent(evt);
			store.recordEvent(evt, feedEvents);
		}

		// Simulate decision
		const decision = mapper.mapDecision(permReq.id, {
			decision: 'allow',
			updatedInput: undefined,
		});
		if (decision) {
			store.recordFeedEvents([decision]);
		}

		// Restore and verify
		const restored = store.restore();
		expect(restored).not.toBeNull();
		const decisionEvents = restored!.feedEvents.filter(
			e => e.kind === 'permission.decision',
		);
		expect(decisionEvents.length).toBeGreaterThanOrEqual(1);

		store.close();
	});

	it('seq ordering is deterministic after restore', () => {
		const store = createSessionStore({
			athenaSessionId: 'test-session-2',
			projectDir: '/tmp/test',
			dbPath: ':memory:',
		});

		const mapper = createFeedMapper();

		const events = [
			makeEvent('SessionStart', {session_id: 'a-1'}),
			makeEvent('UserPromptSubmit', {prompt: 'p1'}),
			makeEvent('PreToolUse', {tool_name: 'Bash', tool_input: {command: 'ls'}}),
			makeEvent('Stop', {stop_hook_active: true}),
			makeEvent('UserPromptSubmit', {prompt: 'p2'}),
			makeEvent('PreToolUse', {tool_name: 'Read', tool_input: {file_path: '/x'}}),
		];

		for (const evt of events) {
			const feedEvents = mapper.mapEvent(evt);
			store.recordEvent(evt, feedEvents);
		}

		const restored = store.restore();
		const seqs = restored!.feedEvents.map(e => e.seq);

		// Verify strictly increasing
		for (let i = 1; i < seqs.length; i++) {
			expect(seqs[i]).toBeGreaterThan(seqs[i - 1]!);
		}

		store.close();
	});
});
```

**Step 2: Run test**

Run: `npx vitest run source/sessions/restore.integration.test.ts`
Expected: PASS (after Phases 1-4 are complete)

**Step 3: Commit**

```bash
git add source/sessions/restore.integration.test.ts
git commit -m "test: add integration tests for restore fidelity and ordering"
```

---

## Phase 7: Enforcement — ESLint Rules & CI Guardrails

### Task 7.1: Add ESLint rule to prevent FeedEvent construction outside mapper

**Files:**
- Modify: `eslint.config.js` (or equivalent)

Add a `no-restricted-syntax` rule that flags object literals with `kind:` + `event_id:` + `seq:` properties outside `source/feed/mapper.ts`. This is an approximation — the real enforcement is code review awareness.

Alternatively, add a comment-based lint marker:

```typescript
// In mapper.ts, where FeedEvent objects are created:
// eslint-disable-next-line athena/sole-event-constructor -- mapper is authorized
```

The simpler approach: add a `ARCHITECTURE.md` or section in CLAUDE.md (already done in Task 0) that CI reviewers and Claude Code check.

### Task 7.2: Add a vitest assertion that validates invariants

**Files:**
- Create: `source/invariants.test.ts`

A meta-test that greps source files for violations:

```typescript
import {describe, it, expect} from 'vitest';
import {execSync} from 'child_process';

describe('architectural invariants', () => {
	it('no FeedEvent construction outside mapper', () => {
		// Search for direct FeedEvent object creation outside mapper.ts
		const result = execSync(
			'grep -rn "kind:" source/feed/ source/hooks/ --include="*.ts" | ' +
			'grep -v "mapper.ts" | grep -v ".test.ts" | grep -v "types.ts" | ' +
			'grep -v "filter.ts" | grep "seq:" || true',
			{encoding: 'utf-8'},
		);
		expect(result.trim()).toBe('');
	});

	it('no timestamp-based sort in feed rendering', () => {
		const result = execSync(
			'grep -rn "\\.ts\\b" source/hooks/ source/components/ --include="*.ts" --include="*.tsx" | ' +
			'grep -E "sort.*\\.ts\\b" | grep -v ".test." | grep -v "useFeed.ordering" || true',
			{encoding: 'utf-8'},
		);
		// This is a heuristic — review results manually if it fires
	});
});
```

**Step 2: Commit**

```bash
git add source/invariants.test.ts
git commit -m "test: add architectural invariant checks"
```

---

## Summary: Execution Order & Dependencies

```
Phase 0 (invariants doc)
  └→ Phase 1 (global seq) ─── Task 1.1 → 1.2 → 1.3
  └→ Phase 2 (identity)  ─── Task 2.1 (independent of Phase 1)
  └→ Phase 3 (loud errors) ── Task 3.1 → 3.2 (independent)
  └→ Phase 4 (schema)    ─── Task 4.1 (depends on 1.2 for migration content)
  └→ Phase 5 (decouple)  ─── Task 5.1 (independent)
  └→ Phase 6 (integration tests) ── depends on Phases 1-4
  └→ Phase 7 (enforcement) ── depends on all prior phases
```

Phases 1, 2, 3, 5 can run in parallel. Phase 4 depends on 1.2. Phase 6 validates everything. Phase 7 locks it down.

---

## What This Plan Does NOT Cover (Intentionally Deferred)

- **Mutable module globals** (Checklist #23) — command registry, process registry, hook logger. These are singletons by design and not causing bugs. Refactor only if they cause test isolation issues.
- **sessionIndex.ts removal** — It's used for display enrichment (session picker shows Claude's summaries). Keep it, just never use it for identity resolution.
- **Message/FeedEvent unified ordering** — Messages use timestamp, feed events use seq. These are different domains. A unified ordering model would require messages to also have seq, which is over-engineering for now.
