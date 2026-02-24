# Test Suite Architectural Correction Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rebalance the athena-cli test suite from library-style pure-function testing toward pipeline integrity testing. Add 7 system sentinel tests that protect real cross-layer risk, write reference documents with risk-weighted analysis, then remove low-signal noise.

**Architecture:** Athena CLI is a pipeline + persistence engine + permission orchestrator + replay-driven UI. Risk concentrates at cross-layer boundaries (mapper→store→restore, event→decision→persistence, burst→ordering, resume→continuation). Sentinel tests live in `source/__sentinels__/` — a dedicated directory that signals architectural weight, not scattered into domain directories where they'd be treated as normal unit tests.

**Tech Stack:** vitest, better-sqlite3, existing SessionStore/FeedMapper/hookController APIs

**Phasing:** Sentinels first (Phase 1), documents second (Phase 2), cleanup last (Phase 3). Never delete before adding. Degraded mode sentinel is last in Phase 1 because it may require production refactor for deterministic failure injection.

---

## Phase 1 — System Sentinel Tests (Tasks 1–8)

7 sentinels + shared helpers. All live in `source/__sentinels__/`.

### Sentinel Rules (enforce in TESTING_PRINCIPLES.md)

Every sentinel file must:

- End with `.sentinel.test.ts`
- Start with an architectural sentinel header comment:

```ts
/**
 * ARCHITECTURAL SENTINEL
 *
 * Protects: <explicit invariant>
 * Risk weight: <N>
 *
 * If this test fails, investigate pipeline integrity before touching assertions.
 */
```

Sentinel tests must:

- Cross at least two architectural layers
- Use real persistence (SQLite in-memory)
- Avoid mocks except for external process boundaries (e.g., spawnClaude)
- Assert invariant properties, not formatting details
- Total sentinel count should stay at ~8–10 maximum. If it grows beyond that, the bar is too low.

### Task 1: Create sentinel directory and helpers

**Files:**

- Create: `source/__sentinels__/helpers.ts`

**Step 1: Write the helper file**

```typescript
import type {RuntimeEvent, RuntimeDecision} from '../runtime/types.js';

let counter = 0;

export function resetCounter(): void {
	counter = 0;
}

export function makeEvent(
	hookName: string,
	overrides: Partial<RuntimeEvent> = {},
): RuntimeEvent {
	counter++;
	return {
		id: `rt-${counter}`,
		timestamp: Date.now() + counter,
		hookName,
		sessionId: 'claude-sess-1',
		context: {cwd: '/tmp', transcriptPath: '/tmp/t.jsonl'},
		interaction: {expectsDecision: hookName === 'PermissionRequest'},
		payload: {
			...(hookName === 'SessionStart'
				? {session_id: 'claude-sess-1', source: 'startup'}
				: {}),
			...(hookName === 'UserPromptSubmit' ? {prompt: 'test prompt'} : {}),
			...(hookName === 'PreToolUse' ||
			hookName === 'PostToolUse' ||
			hookName === 'PostToolUseFailure'
				? {
						tool_name: 'Bash',
						tool_use_id: `tu-${counter}`,
						tool_input: {command: 'echo hi'},
					}
				: {}),
			...(hookName === 'PermissionRequest'
				? {tool_name: 'Bash', tool_use_id: `tu-${counter}`}
				: {}),
			...(hookName === 'Stop' || hookName === 'SubagentStop'
				? {stop_reason: 'end_turn', last_assistant_message: 'Done.'}
				: {}),
		},
		...overrides,
	};
}

export function makeDecision(
	intent: RuntimeDecision['intent'],
	source: RuntimeDecision['source'] = 'user',
): RuntimeDecision {
	return {type: 'json', source, intent};
}
```

**Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
git add source/__sentinels__/helpers.ts
git commit -m "test: add sentinel test directory and shared helpers"
```

---

### Task 2: Sentinel 1 — Full Feed Replay Equivalence

**Risk weight: 5** — If persist→restore loses or mutates events, sessions corrupt silently.

**Why `__sentinels__/` not `sessions/`:** This tests the full pipeline boundary (runtime → mapper → store → restore → bootstrap mapper), not just session storage.

**Files:**

- Create: `source/__sentinels__/replay-equivalence.sentinel.test.ts`

**Step 1: Write the failing test**

```typescript
import {describe, it, expect, afterEach} from 'vitest';
import {createSessionStore, type SessionStore} from '../sessions/store.js';
import {createFeedMapper} from '../feed/mapper.js';
import type {FeedEvent} from '../feed/types.js';
import {makeEvent, makeDecision, resetCounter} from './helpers.js';

describe('Sentinel: replay equivalence', () => {
	let store: SessionStore;

	afterEach(() => {
		store?.close();
		resetCounter();
	});

	it('full canonical session survives persist → restore with structural equivalence', () => {
		store = createSessionStore({
			sessionId: 'replay-eq-1',
			projectDir: '/tmp/proj',
			dbPath: ':memory:',
		});
		const mapper = createFeedMapper();
		const allFeedEvents: FeedEvent[] = [];

		const scenario = [
			makeEvent('SessionStart'),
			makeEvent('UserPromptSubmit'),
			makeEvent('PreToolUse'),
			makeEvent('PostToolUse'),
			makeEvent('PermissionRequest'),
			makeEvent('Stop'),
			makeEvent('SessionEnd'),
		];

		for (const evt of scenario) {
			const feed = mapper.mapEvent(evt);
			store.recordEvent(evt, feed);
			allFeedEvents.push(...feed);
		}

		// Add permission decision
		const permReqEvent = scenario.find(
			e => e.hookName === 'PermissionRequest',
		)!;
		const decision = mapper.mapDecision(
			permReqEvent.id,
			makeDecision({kind: 'permission_allow'}),
		);
		if (decision) {
			store.recordFeedEvents([decision]);
			allFeedEvents.push(decision);
		}

		// Restore and compare on stable fields
		const restored = store.restore();

		// Structural equivalence: kind, seq, actor, cause, run_id
		// Intentionally excludes title — title wording may change without structural corruption
		const normalize = (events: FeedEvent[]) =>
			events
				.sort((a, b) => a.seq - b.seq)
				.map(e => ({
					kind: e.kind,
					seq: e.seq,
					actor_id: e.actor_id,
					cause: e.cause,
					run_id: e.run_id,
				}));

		expect(normalize(restored.feedEvents)).toEqual(normalize(allFeedEvents));
		expect(restored.feedEvents.length).toBe(allFeedEvents.length);

		// Separately: titles exist and are non-empty for all events
		for (const e of restored.feedEvents) {
			expect(e.title).toBeTruthy();
		}
	});

	it('restored mapper resumes seq without gaps or duplicates', () => {
		store = createSessionStore({
			sessionId: 'replay-eq-2',
			projectDir: '/tmp/proj',
			dbPath: ':memory:',
		});
		const mapper1 = createFeedMapper();

		const events = [
			makeEvent('SessionStart'),
			makeEvent('UserPromptSubmit'),
			makeEvent('PreToolUse'),
		];
		for (const evt of events) {
			store.recordEvent(evt, mapper1.mapEvent(evt));
		}

		const bootstrap = store.toBootstrap();
		expect(bootstrap).not.toBeUndefined();
		const mapper2 = createFeedMapper(bootstrap!);

		const restored = store.restore();
		const maxStoredSeq = Math.max(...restored.feedEvents.map(e => e.seq));

		const newFeed = mapper2.mapEvent(makeEvent('PostToolUse'));
		for (const fe of newFeed) {
			expect(fe.seq).toBeGreaterThan(maxStoredSeq);
		}
	});
});
```

**Step 2: Run test**

Run: `npx vitest run source/__sentinels__/replay-equivalence.sentinel.test.ts -v`

**Step 3: If any assertion fails, investigate — this reveals a real persistence bug.**

**Step 4: Commit**

```bash
git add source/__sentinels__/replay-equivalence.sentinel.test.ts
git commit -m "test: sentinel — full feed replay equivalence across pipeline"
```

---

### Task 3: Sentinel 2 — Rapid Event Burst Ordering

**Risk weight: 4** — Burst events with interleaved decisions could break seq monotonicity.

**Files:**

- Create: `source/__sentinels__/burst-ordering.sentinel.test.ts`

**Step 1: Write the failing test**

```typescript
import {describe, it, expect, afterEach} from 'vitest';
import {createFeedMapper} from '../feed/mapper.js';
import {createSessionStore, type SessionStore} from '../sessions/store.js';
import type {FeedEvent} from '../feed/types.js';
import {makeEvent, makeDecision, resetCounter} from './helpers.js';

describe('Sentinel: burst event ordering', () => {
	let store: SessionStore;

	afterEach(() => {
		store?.close();
		resetCounter();
	});

	it('100 interleaved events preserve strict seq monotonicity', () => {
		store = createSessionStore({
			sessionId: 'burst-1',
			projectDir: '/tmp/proj',
			dbPath: ':memory:',
		});
		const mapper = createFeedMapper();
		const allFeed: FeedEvent[] = [];

		let feed = mapper.mapEvent(makeEvent('SessionStart'));
		store.recordEvent(makeEvent('SessionStart'), feed);
		// Note: must use same event object for store. Fix: capture event ref.
		// Corrected approach below.

		resetCounter(); // restart for clean ids
		const mapper2 = createFeedMapper();
		const allFeed2: FeedEvent[] = [];

		const start = makeEvent('SessionStart');
		feed = mapper2.mapEvent(start);
		store.close();

		store = createSessionStore({
			sessionId: 'burst-2',
			projectDir: '/tmp/proj',
			dbPath: ':memory:',
		});
		store.recordEvent(start, feed);
		allFeed2.push(...feed);

		const prompt = makeEvent('UserPromptSubmit');
		feed = mapper2.mapEvent(prompt);
		store.recordEvent(prompt, feed);
		allFeed2.push(...feed);

		for (let i = 0; i < 30; i++) {
			const pre = makeEvent('PreToolUse');
			feed = mapper2.mapEvent(pre);
			store.recordEvent(pre, feed);
			allFeed2.push(...feed);

			if (i % 5 === 0) {
				const perm = makeEvent('PermissionRequest');
				feed = mapper2.mapEvent(perm);
				store.recordEvent(perm, feed);
				allFeed2.push(...feed);

				const dec = mapper2.mapDecision(
					perm.id,
					makeDecision({kind: 'permission_allow'}),
				);
				if (dec) {
					store.recordFeedEvents([dec]);
					allFeed2.push(dec);
				}
			}

			const post = makeEvent('PostToolUse');
			feed = mapper2.mapEvent(post);
			store.recordEvent(post, feed);
			allFeed2.push(...feed);
		}

		// Strict monotonicity
		const seqs = allFeed2.map(e => e.seq);
		for (let i = 1; i < seqs.length; i++) {
			expect(seqs[i]).toBeGreaterThan(seqs[i - 1]!);
		}

		// No duplicate seq
		expect(new Set(seqs).size).toBe(seqs.length);

		// Restored order matches
		const restored = store.restore();
		const restoredSeqs = restored.feedEvents.map(e => e.seq);
		for (let i = 1; i < restoredSeqs.length; i++) {
			expect(restoredSeqs[i]).toBeGreaterThan(restoredSeqs[i - 1]!);
		}
	});
});
```

**Step 2: Run test**

Run: `npx vitest run source/__sentinels__/burst-ordering.sentinel.test.ts -v`

**Step 3: Commit**

```bash
git add source/__sentinels__/burst-ordering.sentinel.test.ts
git commit -m "test: sentinel — rapid burst ordering under interleaved decisions"
```

---

### Task 4: Sentinel 3 — Double-Decision Race

**Risk weight: 4** — Two decisions for one PermissionRequest corrupts permission state.

**Files:**

- Create: `source/__sentinels__/double-decision.sentinel.test.ts`

**Step 1: Write the failing test**

```typescript
import {describe, it, expect, afterEach} from 'vitest';
import {createFeedMapper} from '../feed/mapper.js';
import {makeEvent, makeDecision, resetCounter} from './helpers.js';

describe('Sentinel: double-decision race', () => {
	afterEach(() => resetCounter());

	it('second decision for same request is rejected (returns null)', () => {
		const mapper = createFeedMapper();

		mapper.mapEvent(makeEvent('SessionStart'));
		mapper.mapEvent(makeEvent('UserPromptSubmit'));
		const permReq = makeEvent('PermissionRequest');
		mapper.mapEvent(permReq);

		const first = mapper.mapDecision(
			permReq.id,
			makeDecision({kind: 'permission_allow'}),
		);
		expect(first).not.toBeNull();
		expect(first!.kind).toBe('permission.decision');

		// Second decision: must be rejected
		const second = mapper.mapDecision(
			permReq.id,
			makeDecision({kind: 'permission_deny', reason: 'changed mind'}),
		);
		// If null: mapper correctly rejects (ideal)
		// If non-null: document behavior and decide if guard is needed
		expect(second).toBeNull();
	});

	it('late decision after run boundary is rejected', () => {
		const mapper = createFeedMapper();

		mapper.mapEvent(makeEvent('SessionStart'));
		mapper.mapEvent(makeEvent('UserPromptSubmit'));
		const permReq = makeEvent('PermissionRequest');
		mapper.mapEvent(permReq);

		// End run (correlation indexes clear per CLAUDE.md)
		mapper.mapEvent(makeEvent('Stop'));

		// New run
		mapper.mapEvent(makeEvent('UserPromptSubmit'));

		// Late decision from old run
		const late = mapper.mapDecision(
			permReq.id,
			makeDecision({kind: 'permission_allow'}),
		);
		expect(late).toBeNull();
	});
});
```

**Step 2: Run test**

Run: `npx vitest run source/__sentinels__/double-decision.sentinel.test.ts -v`

**Step 3: If second decision is NOT null, add guard logic to `mapDecision()` in `source/feed/mapper.ts` — remove the request ID from the correlation index after first decision.**

**Step 4: Commit**

```bash
git add source/__sentinels__/double-decision.sentinel.test.ts
git commit -m "test: sentinel — double-decision race and late decision rejection"
```

---

### Task 5: Sentinel 4 — Resume Non-Execution Discipline

**Risk weight: 5** — Implicit execution on resume is catastrophic UX failure.

**Files:**

- Create: `source/__sentinels__/resume-discipline.sentinel.test.ts`

**Step 1: Read the resume/continue flow**

Read these files to understand the boundary:

- `source/app.tsx` — how `--continue` flag propagates
- `source/hooks/useClaudeProcess.ts` — when `spawnClaude()` is called
- `source/utils/spawnClaude.ts` — spawn interface

Map the exact path: CLI entry → app mount → useClaudeProcess → spawnClaude.
Identify the gate: what prevents spawn until user submits a prompt?

**Step 2: Write the test based on findings**

The test must:

1. Mock `spawnClaude` (vi.mock)
2. Create a session store with existing data (simulating a resumed session)
3. Mount the app component with `--continue=<id>` equivalent props
4. Assert `spawnClaude` is NOT called during mount/render
5. Simulate user prompt submission
6. Assert `spawnClaude` IS called after user action

If app-level mounting is too complex, test at the `useClaudeProcess` hook boundary — but document that this is a hook-level test, not a full CLI lifecycle test.

**Step 3: Run test, fix if needed**

**Step 4: Commit**

```bash
git add source/__sentinels__/resume-discipline.sentinel.test.ts
git commit -m "test: sentinel — resume does not auto-trigger execution"
```

---

### Task 6: Sentinel 5 — Resume Does Not Duplicate Events

**Risk weight: 4** — Monotonic seq does not prevent semantic duplication if bootstrap replays into mapper incorrectly.

**Files:**

- Create: `source/__sentinels__/resume-no-duplication.sentinel.test.ts`

**Step 1: Write the failing test**

```typescript
import {describe, it, expect, afterEach} from 'vitest';
import {createSessionStore, type SessionStore} from '../sessions/store.js';
import {createFeedMapper} from '../feed/mapper.js';
import {makeEvent, resetCounter} from './helpers.js';

describe('Sentinel: resume does not duplicate events', () => {
	let store: SessionStore;

	afterEach(() => {
		store?.close();
		resetCounter();
	});

	it('continuation after restore produces no duplicate feed events', () => {
		store = createSessionStore({
			sessionId: 'resume-dup-1',
			projectDir: '/tmp/proj',
			dbPath: ':memory:',
		});

		// Phase 1: Initial session with events
		const mapper1 = createFeedMapper();
		const events1 = [
			makeEvent('SessionStart'),
			makeEvent('UserPromptSubmit'),
			makeEvent('PreToolUse'),
			makeEvent('PostToolUse'),
			makeEvent('Stop'),
		];
		for (const evt of events1) {
			const feed = mapper1.mapEvent(evt);
			store.recordEvent(evt, feed);
		}

		const preRestoreCount = store.restore().feedEvents.length;

		// Phase 2: Bootstrap new mapper (simulating resume)
		const bootstrap = store.toBootstrap();
		const mapper2 = createFeedMapper(bootstrap!);

		// Phase 3: Continue with new events
		const events2 = [
			makeEvent('UserPromptSubmit'),
			makeEvent('PreToolUse'),
			makeEvent('PostToolUse'),
		];
		for (const evt of events2) {
			const feed = mapper2.mapEvent(evt);
			store.recordEvent(evt, feed);
		}

		// Phase 4: Verify no semantic duplication
		// Duplication = same kind + actor + cause + title (not seq — seq will differ naturally)
		const finalRestore = store.restore();

		const semanticKey = (e: FeedEvent) =>
			JSON.stringify({
				kind: e.kind,
				actor: e.actor_id,
				cause: e.cause,
				title: e.title,
			});

		// Events from Phase 1 should appear exactly once
		const preRestoreEvents = store.restore(); // already have this from preRestoreCount
		// Better: compare against the feed events we recorded in Phase 1
		const phase1SeqMax = preRestoreCount; // rough bound
		const phase1Events = finalRestore.feedEvents.filter(
			e => e.seq <= phase1SeqMax,
		);
		const phase2Events = finalRestore.feedEvents.filter(
			e => e.seq > phase1SeqMax,
		);

		// No Phase 1 event should have a semantic twin in Phase 2
		const phase1Keys = new Set(phase1Events.map(semanticKey));
		// Phase 2 events of the same kind are expected (new tool calls etc)
		// but if a Phase 1 SessionStart or its exact cause appears again, that's duplication
		const phase1Unique = phase1Events.filter(e => e.kind === 'session.start');
		const phase2SessionStarts = phase2Events.filter(
			e => e.kind === 'session.start',
		);
		expect(phase2SessionStarts).toHaveLength(0); // No re-emitted session start

		// No duplicate event_ids across entire session
		const allIds = finalRestore.feedEvents.map(e => e.event_id);
		expect(new Set(allIds).size).toBe(allIds.length);

		// No duplicate seq values
		const allSeqs = finalRestore.feedEvents.map(e => e.seq);
		expect(new Set(allSeqs).size).toBe(allSeqs.length);
	});
});
```

**Step 2: Run test**

Run: `npx vitest run source/__sentinels__/resume-no-duplication.sentinel.test.ts -v`

**Step 3: Commit**

```bash
git add source/__sentinels__/resume-no-duplication.sentinel.test.ts
git commit -m "test: sentinel — resume continuation does not duplicate prior feed events"
```

---

### Task 7: Sentinel 6 — Unknown Hook Survival (Full Pipeline)

**Risk weight: 3** — Forward-compat promise broken if unknown hooks vanish during persist/restore.

**Files:**

- Create: `source/__sentinels__/unknown-hook-survival.sentinel.test.ts`

**Step 1: Write the failing test**

```typescript
import {describe, it, expect, afterEach} from 'vitest';
import {createSessionStore, type SessionStore} from '../sessions/store.js';
import {createFeedMapper} from '../feed/mapper.js';
import {makeEvent, resetCounter} from './helpers.js';

describe('Sentinel: unknown hook survives full pipeline', () => {
	let store: SessionStore;

	afterEach(() => {
		store?.close();
		resetCounter();
	});

	it('unknown hook event persists and restores with correct kind', () => {
		store = createSessionStore({
			sessionId: 'unknown-1',
			projectDir: '/tmp/proj',
			dbPath: ':memory:',
		});
		const mapper = createFeedMapper();

		store.recordEvent(
			makeEvent('SessionStart'),
			mapper.mapEvent(makeEvent('SessionStart')),
		);
		// Note: makeEvent increments counter, so calling it twice gives different ids.
		// Fix: capture the event first.
		resetCounter();
		const mapper2 = createFeedMapper();

		const start = makeEvent('SessionStart');
		store.close();
		store = createSessionStore({
			sessionId: 'unknown-2',
			projectDir: '/tmp/proj',
			dbPath: ':memory:',
		});
		store.recordEvent(start, mapper2.mapEvent(start));

		const prompt = makeEvent('UserPromptSubmit');
		store.recordEvent(prompt, mapper2.mapEvent(prompt));

		// Inject unknown hook
		const unknownEvt = makeEvent('FutureHookV99', {
			payload: {some_new_field: 'value', nested: {data: true}},
		});
		const unknownFeed = mapper2.mapEvent(unknownEvt);
		store.recordEvent(unknownEvt, unknownFeed);

		// Mapper produced event (not silently dropped)
		expect(unknownFeed.length).toBeGreaterThan(0);
		const unknownFeedEvent = unknownFeed.find(e => e.kind === 'unknown.hook');
		expect(unknownFeedEvent).toBeDefined();

		// Survives persistence round-trip
		const restored = store.restore();
		const restoredUnknown = restored.feedEvents.find(
			e => e.kind === 'unknown.hook',
		);
		expect(restoredUnknown).toBeDefined();
		expect(restoredUnknown!.title).toContain('FutureHookV99');
		expect(restoredUnknown!.seq).toBe(unknownFeedEvent!.seq);
	});
});
```

**Step 2: Run test**

Run: `npx vitest run source/__sentinels__/unknown-hook-survival.sentinel.test.ts -v`

**Step 3: Commit**

```bash
git add source/__sentinels__/unknown-hook-survival.sentinel.test.ts
git commit -m "test: sentinel — unknown hook survives mapper → store → restore pipeline"
```

---

### Task 8: Sentinel 7 — Degraded Mode Persistence Failure

**Risk weight: 5** — Silent persistence failure means user loses session data without warning.

**Why last in Phase 1:** May require production refactor for deterministic failure injection.

**Files:**

- Create: `source/__sentinels__/degraded-mode.sentinel.test.ts`
- Possibly modify: `source/sessions/store.ts` (add optional `dbFactory` for DI)

**Step 1: Read `source/sessions/store.ts`**

Determine:

- How the internal DB handle is created
- Whether `createSessionStore` accepts dependency injection
- How `markDegraded` is called on write failure
- Whether writes are wrapped in try/catch

**Critical prerequisite:** Before writing the test, answer: Is `isDegraded`/`degradedReason` part of the public contract or incidental? If incidental, formalize them as documented invariants first (add to Non-Negotiable Invariants in CLAUDE.md). Otherwise the sentinel will couple to private internals.

**Step 2: If no DI exists, add minimal production change**

Add optional `dbFactory` parameter to `createSessionStore`:

```typescript
type SessionStoreOptions = {
	sessionId: string;
	projectDir: string;
	dbPath: string;
	label?: string;
	dbFactory?: (path: string) => Database; // NEW: for test injection
};
```

Use it in store construction: `const db = opts.dbFactory?.(opts.dbPath) ?? new Database(opts.dbPath)`.

This is a narrow, safe change that makes failure injection deterministic.

**Step 3: Write the sentinel test**

```typescript
import {describe, it, expect} from 'vitest';
import {createSessionStore} from '../sessions/store.js';
import {createFeedMapper} from '../feed/mapper.js';
import {makeEvent, resetCounter} from './helpers.js';

describe('Sentinel: degraded mode on persistence failure', () => {
	afterEach(() => resetCounter());

	it('DB write failure sets isDegraded with reason', () => {
		// Create a mock DB factory that throws on write operations
		const failingDbFactory = (dbPath: string) => {
			// Implementation depends on store.ts internals.
			// If using better-sqlite3: return a real DB but make it read-only
			// or return a proxy that throws on prepare('INSERT...')
			//
			// Refine after reading store.ts
		};

		const store = createSessionStore({
			sessionId: 'degraded-1',
			projectDir: '/tmp/proj',
			dbPath: ':memory:',
			// dbFactory: failingDbFactory,  // uncomment after implementation
		});

		const mapper = createFeedMapper();

		// Record valid event first
		const start = makeEvent('SessionStart');
		store.recordEvent(start, mapper.mapEvent(start));
		expect(store.isDegraded).toBe(false);

		// Now inject failure (approach depends on store.ts findings)
		// Option A: dbFactory with throwing proxy
		// Option B: close underlying DB then attempt write
		// Option C: monkey-patch internal db.prepare

		// After failure injection:
		// const evt = makeEvent('UserPromptSubmit');
		// store.recordEvent(evt, mapper.mapEvent(evt));
		// expect(store.isDegraded).toBe(true);
		// expect(store.degradedReason).toBeDefined();

		store.close();
	});
});
```

**Step 4: Run test, iterate on injection approach**

Run: `npx vitest run source/__sentinels__/degraded-mode.sentinel.test.ts -v`

**Step 5: Commit (possibly two commits: production DI change + test)**

```bash
git add source/sessions/store.ts source/__sentinels__/degraded-mode.sentinel.test.ts
git commit -m "test: sentinel — degraded mode on persistence failure with DI injection"
```

---

## Phase 2 — Reference Documents (Tasks 9–11)

### Task 9: Write TESTING_PRINCIPLES.md

**Files:**

- Create: `TESTING_PRINCIPLES.md`

**Step 1: Write the file**

Include the 10 principles from the draft PLUS:

- **Risk Weight Scoring (add as section):**
  - 5 → Data corruption, permission corruption, irreversible loss
  - 4 → Incorrect execution or replay state
  - 3 → Incorrect user-visible semantic behavior
  - 2 → Usability degradation
  - 1 → Cosmetic / formatting

- **Replace** the "integration 10% rule" with: "Pipeline architecture codebases must maintain a non-trivial set of cross-layer tests covering all invariants in the Required Invariant Test Matrix."

- **Add principle 11:** "Test proportional to blast radius. A session persistence test is worth more than 40 formatter tests. Allocate test investment where failure consequences are highest."

**Step 2: Commit**

```bash
git add TESTING_PRINCIPLES.md
git commit -m "docs: add testing principles with risk-weight scoring"
```

---

### Task 10: Write TEST_INVENTORY.md

**Files:**

- Create: `TEST_INVENTORY.md`

**Step 1: Run `npx vitest list --dir source --reporter=verbose 2>&1 | tail -5` for current count**

**Step 2: Write the file using draft content with these additions:**

- Add **Risk Weight** column to file inventory table (1–5 per file, using definitions from TESTING_PRINCIPLES.md)
- Add structural observation: "232 boundary import tests (risk 1) vs 5 integration tests (risk 5) represents inverted risk coverage"
- Note new sentinel tests in inventory

**Step 3: Commit**

```bash
git add TEST_INVENTORY.md
git commit -m "docs: add risk-weighted test inventory"
```

---

### Task 11: Write TEST_GAP_ANALYSIS.md

**Files:**

- Create: `TEST_GAP_ANALYSIS.md`

**Step 1: Write the file with all corrections from verification + user feedback:**

1. Reclassify "Behavioral" from 48.2% to ~25-30% (true boundary-crossing behavioral)
2. HookEvent, UnifiedToolCallEvent, Feed mapper clusters: Complementary, keep all
3. useHookServer: HIGH SIGNAL, keep
4. Feed append ordering: Already covered
5. Add structural critique: suite is library-biased, not pipeline-biased
6. True redundancies: only matchRule (8), PostToolResult.**tests** (2), Header (5)
7. Reference sentinel tests as closing the critical gaps
8. Remove hard percentage rules; use principle-based guidance

**Step 2: Commit**

```bash
git add TEST_GAP_ANALYSIS.md
git commit -m "docs: add verified test gap analysis with risk-weighted assessment"
```

---

## Phase 3 — Cleanup (Tasks 12–13)

### Task 12: Remove true redundant tests

**Files:**

- Delete: `source/hooks/matchRule.test.ts`
- Delete: `source/components/__tests__/PostToolResult.test.tsx`
- Delete: `source/components/Header/Header.test.tsx`

**Step 1: Run full suite before deletion**

Run: `npx vitest run source/`

**Step 2: Delete the three files**

**Step 3: Run full suite after deletion**

Run: `npx vitest run source/`

**Step 4: Commit**

```bash
git add -u
git commit -m "test: remove redundant tests (matchRule subset, PostToolResult.__tests__ subset, legacy Header)"
```

---

### Task 13: Final verification — lint + typecheck + full suite

**Step 1: Run lint**

Run: `npm run lint`

**Step 2: Run typecheck**

Run: `npx tsc --noEmit`

**Step 3: Run full test suite**

Run: `npx vitest run source/`

**Step 4: Fix any issues, commit if needed**

---

## Future Work (Not in This Plan)

- **Micro-test compression:** Replace 40-case formatter tests with 3 parameterized cases (risk weight 1 files). Wait until sentinels are stable for one refactor cycle.
- **Integration expansion:** Add 10-15 more integration tests targeting permission round-trip, subagent hierarchy persistence, multi-run session lifecycle.
- **Width degradation contracts:** Strengthen header rendering thresholds as behavioral contracts.
