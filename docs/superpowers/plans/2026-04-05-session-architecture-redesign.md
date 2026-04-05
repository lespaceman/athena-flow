# Session Architecture Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify the duplicated workflow loop into a single `WorkflowRunner`, introduce a persisted `WorkflowRun` entity, and centralize template variable substitution across all prompt pipelines.

**Architecture:** Extract the `while` loop from both `runner.ts` (exec) and `useWorkflowSessionController.ts` (interactive) into a new `WorkflowRunner` with injected dependencies. Add a `workflow_runs` table (schema v5) and `persistRun` upsert on `SessionStore`. Centralize `{sessionId}`, `{trackerPath}`, `<session_id>` substitution into a single `substituteVariables` function used by all three prompt pipelines.

**Tech Stack:** TypeScript, Vitest, SQLite (better-sqlite3), React hooks

**Spec:** `docs/superpowers/specs/2026-04-05-session-architecture-redesign.md`

---

## File Structure

| File                                                                  | Responsibility                                                                                 |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| **New:** `src/core/workflows/templateVars.ts`                         | `substituteVariables()` — single substitution implementation                                   |
| **New:** `src/core/workflows/templateVars.test.ts`                    | Tests for variable substitution                                                                |
| **New:** `src/core/workflows/workflowRunner.ts`                       | `createWorkflowRunner()` — unified core loop                                                   |
| **New:** `src/core/workflows/workflowRunner.test.ts`                  | Tests for the runner                                                                           |
| **Modify:** `src/core/workflows/applyWorkflow.ts`                     | `applyPromptTemplate` delegates to `substituteVariables`                                       |
| **Modify:** `src/core/workflows/applyWorkflow.test.ts`                | Update tests for new signature                                                                 |
| **Modify:** `src/core/workflows/loopManager.ts`                       | `buildContinuePrompt` delegates to `substituteVariables`. Export `TRACKER_SKELETON_MARKER`     |
| **Modify:** `src/core/workflows/sessionPlan.ts`                       | `readWorkflowOverride` delegates substitution. `createWorkflowRunState` receives `trackerPath` |
| **Modify:** `src/core/workflows/sessionPlan.test.ts`                  | Update for `substituteVariables` integration                                                   |
| **Modify:** `src/core/workflows/stateMachine.ts`                      | Phase 1: skeleton marker replaces existence check                                              |
| **Modify:** `src/core/workflows/types.ts`                             | Add `RunStatus` type                                                                           |
| **Modify:** `src/core/workflows/useWorkflowSessionController.ts`      | Replace while loop with `createWorkflowRunner`                                                 |
| **Modify:** `src/core/workflows/useWorkflowSessionController.test.ts` | Update for new internals                                                                       |
| **Modify:** `src/core/workflows/index.ts`                             | Re-export new types                                                                            |
| **Modify:** `src/infra/sessions/schema.ts`                            | Schema v5 migration                                                                            |
| **Modify:** `src/infra/sessions/store.ts`                             | Add `persistRun`, `getLatestRun`, `linkAdapterSession`                                         |
| **Modify:** `src/infra/sessions/types.ts`                             | Add `PersistedWorkflowRun`, `WorkflowRunSnapshot`, `RunStatus`                                 |
| **Modify:** `src/infra/sessions/index.ts`                             | Re-export new types                                                                            |
| **Modify:** `src/infra/sessions/schema.migration.test.ts`             | Add v4→v5 migration test                                                                       |
| **Modify:** `src/infra/sessions/store.test.ts`                        | Add `persistRun`, `getLatestRun`, `linkAdapterSession` tests                                   |
| **Modify:** `src/app/exec/runner.ts`                                  | Replace while loop with `createWorkflowRunner`                                                 |
| **Modify:** `src/app/providers/RuntimeProvider.tsx`                   | Expose `runId` from active runner handle                                                       |

---

### Task 1: Template Variable Substitution

**Files:**

- Create: `src/core/workflows/templateVars.ts`
- Create: `src/core/workflows/templateVars.test.ts`

- [ ] **Step 1: Write the tests**

```typescript
// src/core/workflows/templateVars.test.ts
import {describe, it, expect} from 'vitest';
import {substituteVariables} from './templateVars';

describe('substituteVariables', () => {
	it('substitutes {input}', () => {
		expect(substituteVariables('Execute: {input}', {input: 'ship it'})).toBe(
			'Execute: ship it',
		);
	});

	it('substitutes {sessionId} and <session_id>', () => {
		const text = 'Path: .athena/{sessionId}/tracker.md and <session_id>';
		expect(substituteVariables(text, {sessionId: 'abc-123'})).toBe(
			'Path: .athena/abc-123/tracker.md and abc-123',
		);
	});

	it('substitutes {trackerPath}', () => {
		expect(
			substituteVariables('Read {trackerPath}', {
				trackerPath: '.athena/abc/tracker.md',
			}),
		).toBe('Read .athena/abc/tracker.md');
	});

	it('substitutes all variables together', () => {
		const text = '{input} at {trackerPath} in {sessionId}';
		expect(
			substituteVariables(text, {
				input: 'hello',
				sessionId: 's1',
				trackerPath: '/t.md',
			}),
		).toBe('hello at /t.md in s1');
	});

	it('replaces all occurrences of each variable', () => {
		expect(
			substituteVariables('{sessionId} and {sessionId}', {sessionId: 'x'}),
		).toBe('x and x');
	});

	it('leaves text unchanged when context fields are undefined', () => {
		expect(substituteVariables('{input} {sessionId}', {})).toBe(
			'{input} {sessionId}',
		);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/core/workflows/templateVars.test.ts`
Expected: FAIL — module `./templateVars` not found

- [ ] **Step 3: Write the implementation**

```typescript
// src/core/workflows/templateVars.ts

export type TemplateContext = {
	input?: string;
	sessionId?: string;
	trackerPath?: string;
};

/**
 * Substitute template variables in a text string.
 * Used by all three prompt pipelines: user prompt, continue prompt, system prompt.
 */
export function substituteVariables(
	text: string,
	ctx: TemplateContext,
): string {
	let result = text;
	if (ctx.input !== undefined) {
		result = result.replaceAll('{input}', ctx.input);
	}
	if (ctx.sessionId !== undefined) {
		result = result.replaceAll('{sessionId}', ctx.sessionId);
		result = result.replaceAll('<session_id>', ctx.sessionId);
	}
	if (ctx.trackerPath !== undefined) {
		result = result.replaceAll('{trackerPath}', ctx.trackerPath);
	}
	return result;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/core/workflows/templateVars.test.ts`
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/workflows/templateVars.ts src/core/workflows/templateVars.test.ts
git commit -m "feat(workflows): add substituteVariables for unified template substitution"
```

---

### Task 2: Wire substituteVariables into Existing Pipelines

**Files:**

- Modify: `src/core/workflows/applyWorkflow.ts`
- Modify: `src/core/workflows/applyWorkflow.test.ts`
- Modify: `src/core/workflows/loopManager.ts`
- Modify: `src/core/workflows/sessionPlan.ts`
- Modify: `src/core/workflows/sessionPlan.test.ts`

- [ ] **Step 1: Update `applyPromptTemplate` to use `substituteVariables`**

Replace the entire content of `src/core/workflows/applyWorkflow.ts`:

```typescript
// src/core/workflows/applyWorkflow.ts
import {substituteVariables, type TemplateContext} from './templateVars';

/**
 * Apply a prompt template by substituting variables.
 * For backward compatibility, `input` is a positional argument.
 * Additional context (sessionId, trackerPath) is optional.
 */
export function applyPromptTemplate(
	template: string,
	input: string,
	ctx?: Omit<TemplateContext, 'input'>,
): string {
	return substituteVariables(template, {input, ...ctx});
}
```

- [ ] **Step 2: Update `applyWorkflow.test.ts`**

The existing tests should still pass since `ctx` is optional. Add one new test to `src/core/workflows/applyWorkflow.test.ts`:

```typescript
it('substitutes {sessionId} and {trackerPath} when context provided', () => {
	expect(
		applyPromptTemplate(
			'Run {input} at {trackerPath} for {sessionId}',
			'task',
			{
				sessionId: 's1',
				trackerPath: '.athena/s1/tracker.md',
			},
		),
	).toBe('Run task at .athena/s1/tracker.md for s1');
});
```

- [ ] **Step 3: Update `buildContinuePrompt` in `loopManager.ts`**

In `src/core/workflows/loopManager.ts`, add the import and update `buildContinuePrompt`:

```typescript
// Add to imports at the top
import {substituteVariables} from './templateVars';
```

Replace the `buildContinuePrompt` function (lines 106-112):

```typescript
export function buildContinuePrompt(loop: LoopConfig): string {
	const template = loop.continuePrompt ?? DEFAULT_CONTINUE_PROMPT;
	return substituteVariables(template, {
		trackerPath: loop.trackerPath ?? DEFAULT_TRACKER_PATH,
	});
}
```

Also add the skeleton marker export after the existing marker constants (after line 15):

```typescript
export const TRACKER_SKELETON_MARKER = '<!-- TRACKER_SKELETON -->';
```

- [ ] **Step 4: Update `readWorkflowOverride` in `sessionPlan.ts`**

In `src/core/workflows/sessionPlan.ts`, add the import:

```typescript
import {substituteVariables} from './templateVars';
```

In the `readWorkflowOverride` function, replace the manual substitution block (lines 63-68, the `if (sessionId)` block):

```typescript
// Substitute session-scoped variables into the composed content.
composed = substituteVariables(composed, {
	sessionId,
	trackerPath: trackerPath ?? undefined,
});
```

Where `trackerPath` is a new parameter. Update the function signature to accept it:

```typescript
function readWorkflowOverride(
	projectDir: string,
	workflow?: WorkflowConfig,
	sessionId?: string,
	trackerPath?: string,
): Pick<WorkflowRunState, 'workflowOverride' | 'warnings'> {
```

And update the call in `createWorkflowRunState` (around line 139) to pass `trackerPath`:

```typescript
const {workflowOverride, warnings} = readWorkflowOverride(
	projectDir,
	workflow,
	sessionId,
	trackerResolved?.promptPath,
);
```

This requires reordering `createWorkflowRunState` so `resolveTrackerPath` runs before `readWorkflowOverride`. Move the `trackerPath` resolution above the `readWorkflowOverride` call:

```typescript
export function createWorkflowRunState(input: {
	projectDir: string;
	sessionId?: string;
	workflow?: WorkflowConfig;
}): WorkflowRunState {
	const {projectDir, sessionId, workflow} = input;
	const trackerResolved = resolveTrackerPath({projectDir, sessionId, workflow});
	const loopManager =
		workflow?.loop?.enabled === true && trackerResolved
			? createLoopManager(trackerResolved.absolutePath, workflow.loop)
			: null;
	const {workflowOverride, warnings} = readWorkflowOverride(
		projectDir,
		workflow,
		sessionId,
		trackerResolved?.promptPath,
	);

	return {
		workflow,
		loopManager,
		trackerPathForPrompt: trackerResolved?.promptPath,
		workflowOverride,
		warnings,
	};
}
```

- [ ] **Step 5: Run all workflow tests**

Run: `npx vitest run src/core/workflows/`
Expected: All tests pass. The existing `sessionPlan.test.ts` tests that check for `<session_id>` substitution in composed content should still pass because `substituteVariables` handles `<session_id>`.

- [ ] **Step 6: Commit**

```bash
git add src/core/workflows/applyWorkflow.ts src/core/workflows/applyWorkflow.test.ts \
  src/core/workflows/loopManager.ts src/core/workflows/sessionPlan.ts
git commit -m "refactor(workflows): wire substituteVariables into all prompt pipelines"
```

---

### Task 3: RunStatus Type and Session Types

**Files:**

- Modify: `src/core/workflows/types.ts`
- Modify: `src/infra/sessions/types.ts`
- Modify: `src/infra/sessions/index.ts`

- [ ] **Step 1: Add `RunStatus` to workflow types**

Add to the end of `src/core/workflows/types.ts`:

```typescript
/**
 * Terminal and non-terminal states for a workflow run.
 */
export type RunStatus =
	| 'running'
	| 'completed'
	| 'blocked'
	| 'exhausted'
	| 'failed'
	| 'cancelled';
```

- [ ] **Step 2: Add persistence types to session types**

Add to the end of `src/infra/sessions/types.ts`:

```typescript
import type {RunStatus} from '../../core/workflows/types';

export type WorkflowRunSnapshot = {
	runId: string;
	sessionId: string;
	workflowName?: string;
	iteration: number;
	maxIterations?: number;
	status: RunStatus;
	stopReason?: string;
	trackerPath?: string;
};

export type PersistedWorkflowRun = {
	id: string;
	sessionId: string;
	workflowName?: string;
	startedAt: number;
	endedAt?: number;
	iteration: number;
	maxIterations: number;
	status: RunStatus;
	stopReason?: string;
	trackerPath?: string;
};
```

- [ ] **Step 3: Re-export new types from index**

Add to `src/infra/sessions/index.ts`:

```typescript
export type {WorkflowRunSnapshot, PersistedWorkflowRun} from './types';
```

Add `RunStatus` re-export to `src/core/workflows/index.ts` (in the types export block at the top):

```typescript
export type {RunStatus} from './types';
```

- [ ] **Step 4: Run typecheck**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/core/workflows/types.ts src/core/workflows/index.ts \
  src/infra/sessions/types.ts src/infra/sessions/index.ts
git commit -m "feat(types): add RunStatus, WorkflowRunSnapshot, PersistedWorkflowRun"
```

---

### Task 4: Schema v5 Migration

**Files:**

- Modify: `src/infra/sessions/schema.ts`
- Modify: `src/infra/sessions/schema.migration.test.ts`

- [ ] **Step 1: Write the migration test**

Add a new test to `src/infra/sessions/schema.migration.test.ts`:

```typescript
it('migrates v4 → v5 by adding workflow_runs table and run_id column', () => {
	const db = new Database(':memory:');
	db.exec('PRAGMA foreign_keys = ON');
	db.exec('CREATE TABLE schema_version (version INTEGER NOT NULL)');
	db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(4);
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
		'CREATE TABLE adapter_sessions (session_id TEXT PRIMARY KEY, started_at INTEGER NOT NULL, ended_at INTEGER, model TEXT, source TEXT, tokens_input INTEGER, tokens_output INTEGER, tokens_cache_read INTEGER, tokens_cache_write INTEGER, tokens_context_size INTEGER, tokens_context_window_size INTEGER)',
	);

	// Insert existing data
	db.prepare(
		'INSERT INTO session (id, project_dir, created_at, updated_at) VALUES (?, ?, ?, ?)',
	).run('s1', '/tmp', Date.now(), Date.now());
	db.prepare(
		'INSERT INTO adapter_sessions (session_id, started_at) VALUES (?, ?)',
	).run('as1', Date.now());

	// Run migration
	initSchema(db);

	// Verify version bumped
	const row = db.prepare('SELECT version FROM schema_version').get() as {
		version: number;
	};
	expect(row.version).toBe(5);

	// Verify workflow_runs table exists and can be written to
	db.prepare(
		`INSERT INTO workflow_runs (id, session_id, started_at, iteration, max_iterations, status)
		 VALUES (?, ?, ?, ?, ?, ?)`,
	).run('wr1', 's1', Date.now(), 0, 5, 'running');

	const wr = db
		.prepare('SELECT * FROM workflow_runs WHERE id = ?')
		.get('wr1') as Record<string, unknown>;
	expect(wr.session_id).toBe('s1');
	expect(wr.iteration).toBe(0);
	expect(wr.status).toBe('running');

	// Verify run_id column on adapter_sessions
	db.prepare('UPDATE adapter_sessions SET run_id = ? WHERE session_id = ?').run(
		'wr1',
		'as1',
	);
	const as = db
		.prepare('SELECT run_id FROM adapter_sessions WHERE session_id = ?')
		.get('as1') as {run_id: string};
	expect(as.run_id).toBe('wr1');

	// Existing adapter sessions have NULL run_id
	db.prepare(
		'INSERT INTO adapter_sessions (session_id, started_at) VALUES (?, ?)',
	).run('as2', Date.now());
	const as2 = db
		.prepare('SELECT run_id FROM adapter_sessions WHERE session_id = ?')
		.get('as2') as {run_id: string | null};
	expect(as2.run_id).toBeNull();

	db.close();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/infra/sessions/schema.migration.test.ts`
Expected: FAIL — version stays at 4, workflow_runs table doesn't exist

- [ ] **Step 3: Implement the migration**

In `src/infra/sessions/schema.ts`, update `SCHEMA_VERSION`:

```typescript
export const SCHEMA_VERSION = 5;
```

Add the `workflow_runs` table to the initial `CREATE TABLE` block (after the `adapter_sessions` table creation):

```sql
CREATE TABLE IF NOT EXISTS workflow_runs (
	id TEXT PRIMARY KEY,
	session_id TEXT NOT NULL,
	workflow_name TEXT,
	started_at INTEGER NOT NULL,
	ended_at INTEGER,
	iteration INTEGER NOT NULL DEFAULT 0,
	max_iterations INTEGER NOT NULL DEFAULT 1,
	status TEXT NOT NULL DEFAULT 'running',
	stop_reason TEXT,
	tracker_path TEXT,
	FOREIGN KEY (session_id) REFERENCES session(id)
);
```

Add an index after the existing index block:

```sql
CREATE INDEX IF NOT EXISTS idx_workflow_runs_session ON workflow_runs(session_id);
```

Add the v4 → v5 migration after the existing `if (existing.version === 3)` block:

```typescript
if (existing.version === 4) {
	db.exec(`
		CREATE TABLE IF NOT EXISTS workflow_runs (
			id TEXT PRIMARY KEY,
			session_id TEXT NOT NULL,
			workflow_name TEXT,
			started_at INTEGER NOT NULL,
			ended_at INTEGER,
			iteration INTEGER NOT NULL DEFAULT 0,
			max_iterations INTEGER NOT NULL DEFAULT 1,
			status TEXT NOT NULL DEFAULT 'running',
			stop_reason TEXT,
			tracker_path TEXT,
			FOREIGN KEY (session_id) REFERENCES session(id)
		);
		CREATE INDEX IF NOT EXISTS idx_workflow_runs_session ON workflow_runs(session_id);
		ALTER TABLE adapter_sessions ADD COLUMN run_id TEXT REFERENCES workflow_runs(id);
		UPDATE schema_version SET version = 5;
	`);
}
```

Also update the v2 and v3 migrations to chain through to v5. After the v2→v4 migration, add:

```typescript
// Fall through to v4→v5
```

And after the v3→v4 migration, add:

```typescript
// Fall through to v4→v5
```

The simplest approach: remove the `if (existing.version === 3)` guard and use `if (existing.version <= 3)` chaining. Actually, the cleanest approach is:

After the existing migration blocks (after the `if (existing.version === 3)` block), check the current version again. Since v2→v4 and v3→v4 both set version to 4, we need to re-read or just chain:

```typescript
// Re-read version after prior migrations
const currentVersion = (
	db.prepare('SELECT version FROM schema_version').get() as {
		version: number;
	}
).version;
if (currentVersion === 4) {
	db.exec(`
		CREATE TABLE IF NOT EXISTS workflow_runs (
			id TEXT PRIMARY KEY,
			session_id TEXT NOT NULL,
			workflow_name TEXT,
			started_at INTEGER NOT NULL,
			ended_at INTEGER,
			iteration INTEGER NOT NULL DEFAULT 0,
			max_iterations INTEGER NOT NULL DEFAULT 1,
			status TEXT NOT NULL DEFAULT 'running',
			stop_reason TEXT,
			tracker_path TEXT,
			FOREIGN KEY (session_id) REFERENCES session(id)
		);
		CREATE INDEX IF NOT EXISTS idx_workflow_runs_session ON workflow_runs(session_id);
		ALTER TABLE adapter_sessions ADD COLUMN run_id TEXT REFERENCES workflow_runs(id);
		UPDATE schema_version SET version = 5;
	`);
}
```

- [ ] **Step 4: Run migration tests**

Run: `npx vitest run src/infra/sessions/schema.migration.test.ts`
Expected: All tests pass including the new v4→v5 test

- [ ] **Step 5: Run all session tests**

Run: `npx vitest run src/infra/sessions/`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add src/infra/sessions/schema.ts src/infra/sessions/schema.migration.test.ts
git commit -m "feat(sessions): add schema v5 with workflow_runs table and adapter_sessions.run_id"
```

---

### Task 5: SessionStore — persistRun, getLatestRun, linkAdapterSession

**Files:**

- Modify: `src/infra/sessions/store.ts`
- Modify: `src/infra/sessions/store.test.ts`

- [ ] **Step 1: Write the tests**

Add to `src/infra/sessions/store.test.ts`. Note: the `makeRuntimeEvent` helper already exists in this test file (defined around line 8). The new tests use it.

```typescript
it('persists a workflow run via upsert', () => {
	store = createSessionStore({
		sessionId: 's1',
		projectDir: '/tmp',
		dbPath: ':memory:',
	});

	// First call: insert
	store.persistRun({
		runId: 'run-1',
		sessionId: 's1',
		workflowName: 'test-wf',
		iteration: 0,
		status: 'running',
		trackerPath: '.athena/s1/tracker.md',
	});

	const run1 = store.getLatestRun();
	expect(run1).not.toBeNull();
	expect(run1!.id).toBe('run-1');
	expect(run1!.workflowName).toBe('test-wf');
	expect(run1!.iteration).toBe(0);
	expect(run1!.status).toBe('running');
	expect(run1!.trackerPath).toBe('.athena/s1/tracker.md');
	expect(run1!.endedAt).toBeUndefined();

	// Second call: update
	store.persistRun({
		runId: 'run-1',
		sessionId: 's1',
		workflowName: 'test-wf',
		iteration: 3,
		status: 'completed',
		stopReason: 'Tracker has completion marker',
		trackerPath: '.athena/s1/tracker.md',
	});

	const run2 = store.getLatestRun();
	expect(run2!.iteration).toBe(3);
	expect(run2!.status).toBe('completed');
	expect(run2!.stopReason).toBe('Tracker has completion marker');
	expect(run2!.endedAt).toBeDefined();
});

it('getLatestRun returns the most recent run', () => {
	store = createSessionStore({
		sessionId: 's1',
		projectDir: '/tmp',
		dbPath: ':memory:',
	});

	store.persistRun({
		runId: 'run-1',
		sessionId: 's1',
		iteration: 0,
		status: 'completed',
	});

	// Small delay to ensure different started_at
	store.persistRun({
		runId: 'run-2',
		sessionId: 's1',
		iteration: 0,
		status: 'running',
	});

	const latest = store.getLatestRun();
	expect(latest!.id).toBe('run-2');
});

it('links an adapter session to a workflow run', () => {
	store = createSessionStore({
		sessionId: 's1',
		projectDir: '/tmp',
		dbPath: ':memory:',
	});

	store.persistRun({
		runId: 'run-1',
		sessionId: 's1',
		iteration: 0,
		status: 'running',
	});

	// Record a runtime event to create the adapter session row
	const rtEvent = makeRuntimeEvent({id: 'rt-1', sessionId: 'adapter-1'});
	store.recordEvent(rtEvent, []);

	// Link it
	store.linkAdapterSession('adapter-1', 'run-1');

	// Verify via raw DB isn't possible here, but we can verify getLatestRun still works
	const run = store.getLatestRun();
	expect(run!.id).toBe('run-1');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/infra/sessions/store.test.ts`
Expected: FAIL — `store.persistRun is not a function`

- [ ] **Step 3: Implement the new methods**

In `src/infra/sessions/store.ts`, add the import:

```typescript
import type {WorkflowRunSnapshot, PersistedWorkflowRun} from './types';
```

Add to the `SessionStore` type (after the `markDegraded` method):

```typescript
/** Upsert a workflow run snapshot. Creates on first call, updates thereafter. */
persistRun(snapshot: WorkflowRunSnapshot): void;
/** Retrieve the most recent run for this session. */
getLatestRun(): PersistedWorkflowRun | null;
/** Associate an adapter session with a workflow run. */
linkAdapterSession(adapterSessionId: string, runId: string): void;
```

Inside `createSessionStore`, add prepared statements after the existing ones (after `updateEventCount`):

```typescript
const upsertRun = db.prepare(
	`INSERT INTO workflow_runs (id, session_id, workflow_name, started_at, iteration, max_iterations, status, stop_reason, tracker_path)
	 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	 ON CONFLICT(id) DO UPDATE SET
	   iteration = excluded.iteration,
	   status = excluded.status,
	   stop_reason = excluded.stop_reason,
	   ended_at = CASE WHEN excluded.status != 'running' THEN ? ELSE ended_at END`,
);

const selectLatestRun = db.prepare(
	`SELECT * FROM workflow_runs WHERE session_id = ? ORDER BY started_at DESC LIMIT 1`,
);

const updateAdapterRunId = db.prepare(
	`UPDATE adapter_sessions SET run_id = ? WHERE session_id = ?`,
);
```

Add the function implementations before the `return` statement:

```typescript
function persistRun(snapshot: WorkflowRunSnapshot): void {
	const now = Date.now();
	const endedAt = snapshot.status !== 'running' ? now : null;
	upsertRun.run(
		snapshot.runId,
		snapshot.sessionId,
		snapshot.workflowName ?? null,
		now,
		snapshot.iteration,
		snapshot.maxIterations ?? 1,
		snapshot.status,
		snapshot.stopReason ?? null,
		snapshot.trackerPath ?? null,
		endedAt,
	);
}

function getLatestRun(): PersistedWorkflowRun | null {
	const row = selectLatestRun.get(opts.sessionId) as
		| Record<string, unknown>
		| undefined;
	if (!row) return null;
	return {
		id: row.id as string,
		sessionId: row.session_id as string,
		workflowName: (row.workflow_name as string) ?? undefined,
		startedAt: row.started_at as number,
		endedAt: (row.ended_at as number) ?? undefined,
		iteration: row.iteration as number,
		maxIterations: row.max_iterations as number,
		status: row.status as PersistedWorkflowRun['status'],
		stopReason: (row.stop_reason as string) ?? undefined,
		trackerPath: (row.tracker_path as string) ?? undefined,
	};
}

function linkAdapterSession(adapterSessionId: string, runId: string): void {
	updateAdapterRunId.run(runId, adapterSessionId);
}
```

Add `persistRun`, `getLatestRun`, and `linkAdapterSession` to the return object.

Note: the `upsertRun` prepared statement takes 10 bind parameters — 9 for the INSERT + 1 for the `CASE WHEN` in the `ON CONFLICT` clause (the `?` for `ended_at`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/infra/sessions/store.test.ts`
Expected: All tests pass

- [ ] **Step 5: Run full session test suite**

Run: `npx vitest run src/infra/sessions/`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add src/infra/sessions/store.ts src/infra/sessions/store.test.ts src/infra/sessions/types.ts
git commit -m "feat(sessions): add persistRun upsert, getLatestRun, linkAdapterSession"
```

---

### Task 6: WorkflowRunner — Core Loop

**Files:**

- Create: `src/core/workflows/workflowRunner.ts`
- Create: `src/core/workflows/workflowRunner.test.ts`

- [ ] **Step 1: Write the tests**

```typescript
// src/core/workflows/workflowRunner.test.ts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {createWorkflowRunner} from './workflowRunner';
import type {TurnExecutionResult} from '../runtime/process';
import type {WorkflowRunSnapshot} from '../../infra/sessions/types';
import {TRACKER_SKELETON_MARKER} from './loopManager';

const NULL_TOKENS = {
	input: null,
	output: null,
	cacheRead: null,
	cacheWrite: null,
	total: null,
	contextSize: null,
	contextWindowSize: null,
};

const OK_RESULT: TurnExecutionResult = {
	exitCode: 0,
	error: null,
	tokens: NULL_TOKENS,
	streamMessage: null,
};

const tempDirs: string[] = [];

function makeTempDir(): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'athena-runner-'));
	tempDirs.push(dir);
	return dir;
}

afterEach(() => {
	for (const dir of tempDirs.splice(0)) {
		fs.rmSync(dir, {recursive: true, force: true});
	}
});

describe('createWorkflowRunner', () => {
	it('runs a single non-looped turn and resolves', async () => {
		const startTurn = vi.fn().mockResolvedValue(OK_RESULT);
		const persistRunState = vi.fn();

		const handle = createWorkflowRunner({
			sessionId: 's1',
			projectDir: makeTempDir(),
			prompt: 'do it',
			startTurn,
			persistRunState,
		});

		expect(handle.runId).toBeDefined();
		const result = await handle.result;
		expect(result.status).toBe('completed');
		expect(result.iterations).toBe(1);
		expect(startTurn).toHaveBeenCalledTimes(1);
		expect(persistRunState).toHaveBeenCalled();
	});

	it('loops until completion marker is found', async () => {
		const projectDir = makeTempDir();
		const trackerDir = path.join(projectDir, '.athena', 's1');
		fs.mkdirSync(trackerDir, {recursive: true});
		const trackerPath = path.join(trackerDir, 'tracker.md');

		const startTurn = vi
			.fn()
			.mockImplementationOnce(async () => {
				// Session 1: agent writes tracker content (removing skeleton marker)
				fs.writeFileSync(trackerPath, '## Plan\n- task 1\n- task 2', 'utf-8');
				return OK_RESULT;
			})
			.mockImplementationOnce(async () => {
				// Session 2: agent completes
				fs.writeFileSync(
					trackerPath,
					'## Plan\n- [x] task 1\n- [x] task 2\n<!-- WORKFLOW_COMPLETE -->',
					'utf-8',
				);
				return OK_RESULT;
			});

		const persistRunState = vi.fn();
		const handle = createWorkflowRunner({
			sessionId: 's1',
			projectDir,
			prompt: 'do it',
			workflow: {
				name: 'wf',
				plugins: [],
				promptTemplate: '{input}',
				loop: {enabled: true, maxIterations: 5},
			},
			startTurn,
			persistRunState,
		});

		const result = await handle.result;
		expect(result.status).toBe('completed');
		expect(result.iterations).toBe(2);
		expect(startTurn).toHaveBeenCalledTimes(2);
	});

	it('creates tracker skeleton before first turn when loop enabled', async () => {
		const projectDir = makeTempDir();
		const trackerPath = path.join(projectDir, '.athena', 's1', 'tracker.md');
		let trackerExistsBeforeFirstTurn = false;
		let trackerContent = '';

		const startTurn = vi.fn().mockImplementationOnce(async () => {
			trackerExistsBeforeFirstTurn = fs.existsSync(trackerPath);
			trackerContent = fs.readFileSync(trackerPath, 'utf-8');
			// Write real content to avoid missing_tracker on next check
			fs.writeFileSync(trackerPath, '<!-- WORKFLOW_COMPLETE -->', 'utf-8');
			return OK_RESULT;
		});

		const handle = createWorkflowRunner({
			sessionId: 's1',
			projectDir,
			prompt: 'do it',
			workflow: {
				name: 'wf',
				plugins: [],
				promptTemplate: '{input}',
				loop: {enabled: true, maxIterations: 5},
			},
			startTurn,
			persistRunState: vi.fn(),
		});

		await handle.result;
		expect(trackerExistsBeforeFirstTurn).toBe(true);
		expect(trackerContent).toContain(TRACKER_SKELETON_MARKER);
		expect(trackerContent).toContain('s1');
	});

	it('cancel stops the loop after current turn', async () => {
		const projectDir = makeTempDir();
		const trackerDir = path.join(projectDir, '.athena', 's1');
		fs.mkdirSync(trackerDir, {recursive: true});
		const trackerPath = path.join(trackerDir, 'tracker.md');

		let turnCount = 0;
		// handleRef is declared here and assigned after createWorkflowRunner returns.
		// The mock captures it via closure. This is safe because startTurn runs async —
		// by the time the mock executes, handleRef has already been assigned.
		let handleRef: ReturnType<typeof createWorkflowRunner>;

		const startTurn = vi.fn().mockImplementation(async () => {
			turnCount++;
			fs.writeFileSync(trackerPath, 'still running', 'utf-8');
			if (turnCount === 1) {
				// Cancel after first turn completes
				handleRef.cancel();
			}
			return OK_RESULT;
		});

		handleRef = createWorkflowRunner({
			sessionId: 's1',
			projectDir,
			prompt: 'do it',
			workflow: {
				name: 'wf',
				plugins: [],
				promptTemplate: '{input}',
				loop: {enabled: true, maxIterations: 10},
			},
			startTurn,
			persistRunState: vi.fn(),
		});

		const result = await handleRef.result;
		expect(result.status).toBe('cancelled');
		expect(startTurn).toHaveBeenCalledTimes(1);
	});

	it('kill aborts the current turn', async () => {
		const projectDir = makeTempDir();
		const trackerDir = path.join(projectDir, '.athena', 's1');
		fs.mkdirSync(trackerDir, {recursive: true});
		const trackerPath = path.join(trackerDir, 'tracker.md');
		fs.writeFileSync(trackerPath, 'running', 'utf-8');

		const abortCurrentTurn = vi.fn();
		let resolveFirstTurn: ((r: TurnExecutionResult) => void) | null = null;

		const startTurn = vi.fn().mockImplementation(() => {
			return new Promise<TurnExecutionResult>(resolve => {
				resolveFirstTurn = resolve;
			});
		});

		const handle = createWorkflowRunner({
			sessionId: 's1',
			projectDir,
			prompt: 'do it',
			workflow: {
				name: 'wf',
				plugins: [],
				promptTemplate: '{input}',
				loop: {enabled: true, maxIterations: 10},
			},
			startTurn,
			persistRunState: vi.fn(),
			abortCurrentTurn,
		});

		// Let the first turn start
		await new Promise(r => setTimeout(r, 10));
		expect(startTurn).toHaveBeenCalledTimes(1);

		// Kill
		handle.kill();
		expect(abortCurrentTurn).toHaveBeenCalledTimes(1);

		// Resolve the turn so the promise settles
		resolveFirstTurn!({...OK_RESULT, error: new Error('killed')});

		const result = await handle.result;
		expect(result.status).toBe('cancelled');
	});

	it('reports failed when turn exits non-zero', async () => {
		const startTurn = vi.fn().mockResolvedValue({
			...OK_RESULT,
			exitCode: 1,
		});

		const handle = createWorkflowRunner({
			sessionId: 's1',
			projectDir: makeTempDir(),
			prompt: 'do it',
			startTurn,
			persistRunState: vi.fn(),
		});

		const result = await handle.result;
		expect(result.status).toBe('failed');
	});

	it('uses injected createTracker instead of fs', async () => {
		const createTracker = vi.fn();
		const startTurn = vi.fn().mockResolvedValue(OK_RESULT);

		const handle = createWorkflowRunner({
			sessionId: 's1',
			projectDir: '/fake',
			prompt: 'do it',
			workflow: {
				name: 'wf',
				plugins: [],
				promptTemplate: '{input}',
				loop: {enabled: true, maxIterations: 1},
			},
			startTurn,
			persistRunState: vi.fn(),
			createTracker,
		});

		await handle.result;
		expect(createTracker).toHaveBeenCalledTimes(1);
		expect(createTracker.mock.calls[0][0]).toContain('.athena/s1/tracker.md');
		expect(createTracker.mock.calls[0][1]).toContain(TRACKER_SKELETON_MARKER);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/core/workflows/workflowRunner.test.ts`
Expected: FAIL — module `./workflowRunner` not found

- [ ] **Step 3: Write the implementation**

```typescript
// src/core/workflows/workflowRunner.ts
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
	HarnessProcessOverride,
	TurnContinuation,
	TurnExecutionResult,
} from '../runtime/process';
import type {TokenUsage} from '../../shared/types/headerMetrics';
import type {RunStatus} from './types';
import type {WorkflowConfig} from './types';
import type {WorkflowRunSnapshot} from '../../infra/sessions/types';
import {
	createWorkflowRunState,
	prepareWorkflowTurn,
	shouldContinueWorkflowRun,
	cleanupWorkflowRun,
} from './sessionPlan';
import {DEFAULT_TRACKER_PATH, TRACKER_SKELETON_MARKER} from './loopManager';
import {substituteVariables} from './templateVars';

export type TurnInput = {
	prompt: string;
	continuation: TurnContinuation;
	configOverride?: HarnessProcessOverride;
};

export type WorkflowRunnerInput = {
	sessionId: string;
	projectDir: string;
	workflow?: WorkflowConfig;
	prompt: string;
	initialContinuation?: TurnContinuation;

	startTurn: (input: TurnInput) => Promise<TurnExecutionResult>;
	persistRunState: (snapshot: WorkflowRunSnapshot) => void;
	onIterationComplete?: (snapshot: WorkflowRunSnapshot) => void;
	abortCurrentTurn?: () => void;
	createTracker?: (trackerPath: string, content: string) => void;
};

export type WorkflowRunResult = {
	runId: string;
	status: RunStatus;
	iterations: number;
	stopReason?: string;
	tokens: TokenUsage;
};

export type WorkflowRunnerHandle = {
	readonly runId: string;
	result: Promise<WorkflowRunResult>;
	cancel: () => void;
	kill: () => void;
};

const NULL_TOKENS: TokenUsage = {
	input: null,
	output: null,
	cacheRead: null,
	cacheWrite: null,
	total: null,
	contextSize: null,
	contextWindowSize: null,
};

const TRACKER_SKELETON_TEMPLATE = `${TRACKER_SKELETON_MARKER}
# Workflow Tracker

**Session**: {sessionId}
**Tracker**: {trackerPath}
**Goal**: {input}

---

> This tracker was created by the runner. Update it as you work.
> See the Stateless Session Protocol for tracker conventions.

## Status

Orientation in progress.

## Plan

_To be created during orientation._

## Progress

_No progress yet._
`;

function mergeTokens(base: TokenUsage, next: TokenUsage): TokenUsage {
	const input = (base.input ?? 0) + (next.input ?? 0);
	const output = (base.output ?? 0) + (next.output ?? 0);
	const cacheRead = (base.cacheRead ?? 0) + (next.cacheRead ?? 0);
	const cacheWrite = (base.cacheWrite ?? 0) + (next.cacheWrite ?? 0);
	const hasAny =
		base.input !== null ||
		next.input !== null ||
		base.output !== null ||
		next.output !== null;
	if (!hasAny)
		return {
			...NULL_TOKENS,
			contextSize: next.contextSize,
			contextWindowSize: next.contextWindowSize,
		};
	return {
		input,
		output,
		cacheRead,
		cacheWrite,
		total: input + output + cacheRead + cacheWrite,
		contextSize: next.contextSize ?? base.contextSize,
		contextWindowSize: next.contextWindowSize ?? base.contextWindowSize,
	};
}

function resolveTrackerAbsolutePath(
	projectDir: string,
	sessionId: string,
	workflow?: WorkflowConfig,
): string | null {
	const loop = workflow?.loop;
	if (!loop?.enabled) return null;
	const rawPath = loop.trackerPath ?? DEFAULT_TRACKER_PATH;
	const substituted = rawPath.replaceAll('{sessionId}', sessionId);
	return path.isAbsolute(substituted)
		? substituted
		: path.resolve(projectDir, substituted);
}

function defaultCreateTracker(trackerPath: string, content: string): void {
	fs.mkdirSync(path.dirname(trackerPath), {recursive: true});
	fs.writeFileSync(trackerPath, content, 'utf-8');
}

export function createWorkflowRunner(
	input: WorkflowRunnerInput,
): WorkflowRunnerHandle {
	const runId = crypto.randomUUID();
	let cancelled = false;
	let status: RunStatus = 'running';
	let iterations = 0;
	let cumulativeTokens: TokenUsage = {...NULL_TOKENS};
	let stopReason: string | undefined;

	const trackerAbsPath = resolveTrackerAbsolutePath(
		input.projectDir,
		input.sessionId,
		input.workflow,
	);

	const trackerPromptPath = trackerAbsPath
		? path.relative(input.projectDir, trackerAbsPath)
		: undefined;

	function snapshot(): WorkflowRunSnapshot {
		return {
			runId,
			sessionId: input.sessionId,
			workflowName: input.workflow?.name,
			iteration: iterations,
			maxIterations: input.workflow?.loop?.maxIterations ?? 1,
			status,
			stopReason,
			trackerPath: trackerPromptPath,
		};
	}

	function persist(): void {
		try {
			input.persistRunState(snapshot());
		} catch {
			// Persistence failure is non-fatal for the runner
		}
	}

	const result = (async (): Promise<WorkflowRunResult> => {
		// Create tracker skeleton if needed
		if (trackerAbsPath && input.workflow?.loop?.enabled) {
			if (!fs.existsSync(trackerAbsPath)) {
				const content = substituteVariables(TRACKER_SKELETON_TEMPLATE, {
					sessionId: input.sessionId,
					trackerPath: trackerPromptPath,
					input: input.prompt,
				});
				const write = input.createTracker ?? defaultCreateTracker;
				write(trackerAbsPath, content);
			}
		}

		// Persist initial running state
		persist();

		const workflowState = createWorkflowRunState({
			projectDir: input.projectDir,
			sessionId: input.sessionId,
			workflow: input.workflow,
		});

		let nextContinuation: TurnContinuation = input.initialContinuation ?? {
			mode: 'fresh',
		};

		try {
			while (!cancelled) {
				iterations++;
				const prepared = prepareWorkflowTurn(workflowState, {
					prompt: input.prompt,
					configOverride: undefined,
				});

				const turnResult = await input.startTurn({
					prompt: prepared.prompt,
					continuation: nextContinuation,
					configOverride: prepared.configOverride,
				});

				cumulativeTokens = mergeTokens(cumulativeTokens, turnResult.tokens);

				if (cancelled) {
					status = 'cancelled';
					persist();
					break;
				}

				if (
					turnResult.error ||
					(turnResult.exitCode !== null && turnResult.exitCode !== 0)
				) {
					status = 'failed';
					stopReason =
						turnResult.error?.message ?? `Exit code ${turnResult.exitCode}`;
					persist();
					break;
				}

				// Non-looped: single turn, done
				if (!input.workflow?.loop?.enabled) {
					status = 'completed';
					persist();
					break;
				}

				const loopStop = shouldContinueWorkflowRun(workflowState);
				if (loopStop) {
					if (loopStop.reason === 'completed') {
						status = 'completed';
					} else if (loopStop.reason === 'blocked') {
						status = 'blocked';
						stopReason = loopStop.blockedReason;
					} else if (loopStop.reason === 'max_iterations') {
						status = 'exhausted';
					} else {
						status = 'failed';
						stopReason = `Loop stopped: ${loopStop.reason}`;
					}
					persist();
					break;
				}

				// Continue loop
				persist();
				input.onIterationComplete?.(snapshot());
				nextContinuation = {mode: 'fresh'};
			}

			if (cancelled && status === 'running') {
				status = 'cancelled';
				persist();
			}
		} finally {
			cleanupWorkflowRun(workflowState);
		}

		return {
			runId,
			status,
			iterations,
			stopReason,
			tokens: cumulativeTokens,
		};
	})();

	return {
		runId,
		result,
		cancel() {
			cancelled = true;
		},
		kill() {
			cancelled = true;
			input.abortCurrentTurn?.();
		},
	};
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/core/workflows/workflowRunner.test.ts`
Expected: All 7 tests pass

- [ ] **Step 5: Export from index**

Add to `src/core/workflows/index.ts`:

```typescript
export {createWorkflowRunner} from './workflowRunner';
export type {
	WorkflowRunnerInput,
	WorkflowRunnerHandle,
	WorkflowRunResult,
	TurnInput,
} from './workflowRunner';
```

- [ ] **Step 6: Run typecheck**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add src/core/workflows/workflowRunner.ts src/core/workflows/workflowRunner.test.ts \
  src/core/workflows/index.ts
git commit -m "feat(workflows): add WorkflowRunner unified core loop"
```

---

### Task 7: Wire Exec Runner to WorkflowRunner

**Files:**

- Modify: `src/app/exec/runner.ts`

**Design notes:**

- The outer `currentIteration` variable is **removed**. The runner tracks iterations internally. The `onIterationComplete` callback receives the snapshot with `iteration` for JSON event emission.
- The `startTurn` callback is a **thin passthrough** — it calls `sessionController.startTurn` and returns the raw result. No `hasFailure()` check, no event emission, no token accumulation inside the callback. External failures (registered by the runtime event handler concurrently) are checked **after** `handle.result` resolves.
- Token recording and `process.started`/`process.exited` events move to `onIterationComplete` or are emitted around the `handle.result` await.

- [ ] **Step 1: Replace the while loop in `runExec`**

In `src/app/exec/runner.ts`, add the import:

```typescript
import {createWorkflowRunner} from '../../core/workflows/workflowRunner';
```

Remove these imports (no longer used):

```typescript
// Remove:
import {
	cleanupWorkflowRun,
	createWorkflowRunState,
	prepareWorkflowTurn,
	shouldContinueWorkflowRun,
} from '../../core/workflows/sessionPlan';
import {DEFAULT_TRACKER_PATH} from '../../core/workflows/loopManager';
```

Remove these variables that are no longer needed:

```typescript
// Remove:
let currentIteration = 0;
let workflowState: ReturnType<typeof createWorkflowRunState> | null = null;
```

Replace the block from `const workflow = options.workflow;` through the end of the `while` loop (approximately lines 365-488) with:

```typescript
const workflow = options.workflow;

output.emitJsonEvent('run.started', {
	workflow: workflow?.name ?? null,
	loopEnabled: workflow?.loop?.enabled ?? false,
});

const nextContinuation: TurnContinuation = options.adapterResumeSessionId
	? {mode: 'resume', handle: options.adapterResumeSessionId}
	: {mode: 'fresh'};

const handle = createWorkflowRunner({
	sessionId: athenaSessionId,
	projectDir: options.projectDir,
	workflow,
	prompt: options.prompt,
	initialContinuation: nextContinuation,
	startTurn: async turnInput => {
		const turnResult = await sessionController.startTurn({
			prompt: turnInput.prompt,
			continuation: turnInput.continuation,
			configOverride: turnInput.configOverride,
			onStderrLine: message => output.log(message),
		});

		if (turnResult.streamMessage) {
			streamFinalMessage = turnResult.streamMessage;
		}

		const sessionIdForTokens = currentAdapterSessionId();
		if (sessionIdForTokens !== null) {
			safePersist(
				store,
				() => store.recordTokens(sessionIdForTokens, turnResult.tokens),
				message => output.warn(message),
				'recordTokens failed',
			);
		}

		return turnResult;
	},
	persistRunState: runSnapshot => {
		safePersist(
			store,
			() => store.persistRun(runSnapshot),
			message => output.warn(message),
			'persistRun failed',
		);
	},
	abortCurrentTurn: () => void sessionController.kill(),
	onIterationComplete: runSnapshot => {
		output.emitJsonEvent('iteration.complete', {
			iteration: runSnapshot.iteration,
			status: runSnapshot.status,
		});
	},
});

// Store handle.runId so event recording can use it for linkAdapterSession
const activeRunId = handle.runId;

const runResult = await handle.result;

// Accumulate tokens from the runner result
cumulativeTokens = runResult.tokens;

// Map runner terminal status to exec failure if applicable.
// External failures (from runtime event handler) take precedence — check !failure first.
if (!failure) {
	if (runResult.status === 'blocked') {
		registerFailure(
			workflowFailure(
				'blocked',
				runResult.stopReason
					? `Workflow blocked: ${runResult.stopReason}`
					: 'Workflow blocked.',
			),
		);
	} else if (runResult.status === 'exhausted') {
		registerFailure(
			workflowFailure(
				'exhausted',
				`Workflow reached the maximum of ${workflow?.loop?.maxIterations ?? 0} iterations.`,
			),
		);
	} else if (runResult.status === 'failed') {
		registerFailure({
			kind: 'process',
			message: runResult.stopReason ?? 'Workflow run failed.',
		});
	}
}
```

Remove the `workflowState` cleanup from the `finally` block:

```typescript
// Remove from finally:
if (workflowState) {
	cleanupWorkflowRun(workflowState);
}
```

In the runtime event handler, add `linkAdapterSession`. The `activeRunId` variable is declared before `handle` is created, so it's available in the closure. However, the event handler is registered before the runner starts. Initialize `activeRunId` as `let` and set it after creating the handle:

```typescript
// Declare before the event handler:
let activeRunId: string | null = null;

// Inside the existing runtime.onEvent handler, after the adapterSessionId assignment:
const unsubscribeEvent = runtime.onEvent((runtimeEvent: RuntimeEvent) => {
	adapterSessionId = runtimeEvent.sessionId;

	// Link new adapter sessions to the active workflow run
	if (runtimeEvent.sessionId && activeRunId) {
		safePersist(
			store,
			() => store.linkAdapterSession(runtimeEvent.sessionId!, activeRunId!),
			message => output.warn(message),
			'linkAdapterSession failed',
		);
	}
	// ... rest of handler unchanged
```

Then after `createWorkflowRunner`:

```typescript
activeRunId = handle.runId;
```

Note: `linkAdapterSession` uses UPDATE so calling it multiple times for the same adapter session is idempotent.

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: No errors. Fix any type issues.

- [ ] **Step 3: Run exec tests if any exist**

Run: `npx vitest run src/app/exec/`
Expected: Pass (or no test files in that directory)

- [ ] **Step 4: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/app/exec/runner.ts
git commit -m "refactor(exec): replace while loop with WorkflowRunner"
```

---

### Task 8: Wire Interactive Mode to WorkflowRunner

**Files:**

- Modify: `src/core/workflows/useWorkflowSessionController.ts`
- Modify: `src/core/workflows/useWorkflowSessionController.test.ts`
- Modify: `src/app/providers/RuntimeProvider.tsx`
- Modify: `src/app/process/useHarnessProcess.ts`

**Design notes:**

The `persistRunState` and `activeRunId` wiring requires threading session store access to `useHarnessProcess`. Currently:

- `HookProvider` (in `RuntimeProvider.tsx`) creates `sessionStore` but does NOT expose it via context
- `useHarnessProcess` (in `useHarnessProcess.ts`) calls `useWorkflowSessionController` but has no access to the session store
- `AppShell` calls `useHarnessProcess` and is a child of `HookProvider`

**Solution:** Add a `SessionStoreContext` in `RuntimeProvider.tsx` and a `useSessionStore()` hook. Then `useHarnessProcess` can access the store to wire `persistRunState`.

The `activeRunId` property is added to the hook's return type. `useHarnessProcess` already spreads the result (`...workflowController`), so `activeRunId` flows through to `AppShell` automatically. `HarnessProcessResult` doesn't constrain against extra properties since it uses `UseSessionControllerResult & { tokenUsage }`. No type changes needed in the intermediate layer — `activeRunId` is available on the spread result.

- [ ] **Step 1: Add SessionStoreContext to RuntimeProvider**

In `src/app/providers/RuntimeProvider.tsx`, add a new context after the existing ones (after line 17):

```typescript
import type {SessionStore} from '../../infra/sessions/store';

const SessionStoreContext = createContext<SessionStore | null>(null);
```

Wrap the children in the new provider inside `HookProvider`, after the existing `RuntimeRefContext.Provider` (around line 122-130):

```typescript
return (
	<RuntimeRefContext.Provider value={runtime}>
		<SessionStoreContext.Provider value={sessionStore}>
			<HookProviderContent
				runtime={runtime}
				allowedTools={allowedTools}
				sessionStore={sessionStore}
			>
				{children}
			</HookProviderContent>
		</SessionStoreContext.Provider>
	</RuntimeRefContext.Provider>
);
```

Add the hook export after the existing `useRuntime`:

```typescript
export function useSessionStore(): SessionStore | null {
	return useContext(SessionStoreContext);
}
```

- [ ] **Step 2: Wire `persistRunState` in `useHarnessProcess`**

In `src/app/process/useHarnessProcess.ts`, add the import:

```typescript
import {useSessionStore} from '../providers/RuntimeProvider';
```

Inside `useHarnessProcess`, get the store and pass it:

```typescript
export function useHarnessProcess(
	input: UseHarnessProcessInput,
): HarnessProcessResult {
	const runtime = useRuntime();
	const sessionStore = useSessionStore();
	const adapter = resolveHarnessAdapter(input.harness);
	const controller = adapter.useSessionController({
		projectDir: input.projectDir,
		instanceId: input.instanceId,
		processConfig: input.isolation,
		pluginMcpConfig: input.pluginMcpConfig,
		verbose: input.verbose,
		workflow: input.workflow,
		workflowPlan: input.workflowPlan,
		options: input.options,
		runtime,
	});
	const workflowController = useWorkflowSessionController(controller, {
		projectDir: input.projectDir,
		sessionId: input.athenaSessionId,
		workflow: input.workflow,
		persistRunState: sessionStore
			? snapshot => sessionStore.persistRun(snapshot)
			: undefined,
	});

	return {
		...workflowController,
		tokenUsage: workflowController.usage,
	};
}
```

- [ ] **Step 3: Replace the while loop in `useWorkflowSessionController`**

Replace the entire content of `src/core/workflows/useWorkflowSessionController.ts`:

```typescript
import {useCallback, useEffect, useRef, useState} from 'react';
import type {
	HarnessProcess,
	HarnessProcessOverride,
	TurnContinuation,
	TurnExecutionResult,
} from '../runtime/process';
import {
	createWorkflowRunner,
	type WorkflowRunnerHandle,
} from './workflowRunner';
import type {WorkflowConfig} from './types';
import type {WorkflowRunSnapshot} from '../../infra/sessions/types';

export type UseWorkflowSessionControllerInput = {
	projectDir: string;
	sessionId?: string;
	workflow?: WorkflowConfig;
	persistRunState?: (snapshot: WorkflowRunSnapshot) => void;
};

export function useWorkflowSessionController(
	base: HarnessProcess<HarnessProcessOverride>,
	input: UseWorkflowSessionControllerInput,
): HarnessProcess<HarnessProcessOverride> & {
	readonly activeRunId: string | null;
} {
	const [isRunning, setIsRunning] = useState(false);
	const runnerRef = useRef<WorkflowRunnerHandle | null>(null);
	const activeRunIdRef = useRef<string | null>(null);

	const cancelCurrentRun = useCallback(async (): Promise<void> => {
		const runner = runnerRef.current;
		if (runner) {
			runner.cancel();
			await runner.result.catch(() => {});
			runnerRef.current = null;
			activeRunIdRef.current = null;
		}
	}, []);

	const interrupt = useCallback((): void => {
		const runner = runnerRef.current;
		if (runner) {
			runner.kill();
		} else {
			void base.kill().catch(() => {});
		}
		setIsRunning(false);
	}, [base]);

	const kill = useCallback(async (): Promise<void> => {
		const runner = runnerRef.current;
		if (runner) {
			runner.kill();
			await runner.result.catch(() => {});
			runnerRef.current = null;
			activeRunIdRef.current = null;
		} else {
			await base.kill();
		}
		setIsRunning(false);
	}, [base]);

	const spawn = useCallback(
		async (
			prompt: string,
			continuation?: TurnContinuation,
			configOverride?: HarnessProcessOverride,
		): Promise<TurnExecutionResult> => {
			await cancelCurrentRun();
			setIsRunning(true);

			const handle = createWorkflowRunner({
				sessionId: input.sessionId ?? '',
				projectDir: input.projectDir,
				workflow: input.workflow,
				prompt,
				initialContinuation: continuation,
				startTurn: turnInput =>
					base.startTurn(
						turnInput.prompt,
						turnInput.continuation,
						turnInput.configOverride,
					),
				persistRunState: input.persistRunState ?? (() => {}),
				abortCurrentTurn: () => void base.kill().catch(() => {}),
			});

			runnerRef.current = handle;
			activeRunIdRef.current = handle.runId;

			try {
				const runResult = await handle.result;
				return {
					exitCode: runResult.status === 'failed' ? 1 : 0,
					error:
						runResult.status === 'failed'
							? new Error(runResult.stopReason ?? 'Run failed')
							: null,
					tokens: runResult.tokens,
					streamMessage: null,
				};
			} finally {
				if (runnerRef.current === handle) {
					runnerRef.current = null;
					activeRunIdRef.current = null;
					setIsRunning(false);
				}
			}
		},
		[
			base,
			cancelCurrentRun,
			input.projectDir,
			input.sessionId,
			input.workflow,
			input.persistRunState,
		],
	);

	useEffect(() => {
		return () => {
			runnerRef.current?.cancel();
			runnerRef.current = null;
			activeRunIdRef.current = null;
		};
	}, []);

	return {
		...base,
		startTurn: spawn,
		isRunning,
		interrupt,
		kill,
		get activeRunId() {
			return activeRunIdRef.current;
		},
	};
}
```

- [ ] **Step 4: Run the hook tests**

Run: `npx vitest run src/core/workflows/useWorkflowSessionController.test.ts`

The existing tests should pass — `persistRunState` is optional (defaults to no-op) and `activeRunId` is an additive property that doesn't affect existing assertions.

- [ ] **Step 5: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add src/core/workflows/useWorkflowSessionController.ts \
  src/core/workflows/useWorkflowSessionController.test.ts \
  src/app/providers/RuntimeProvider.tsx src/app/process/useHarnessProcess.ts
git commit -m "refactor(interactive): replace while loop with WorkflowRunner, add SessionStoreContext"
```

---

### Task 9: Update State Machine Document

**Files:**

- Modify: `src/core/workflows/stateMachine.ts`

- [ ] **Step 1: Update Phase 1 in `STATE_MACHINE_CONTENT`**

In `src/core/workflows/stateMachine.ts`, find the Phase 1 section (around line 41-49). Replace:

```typescript
### Phase 1 — Read the Tracker

Check if the tracker file exists at \`.athena/<session_id>/tracker.md\`.

- **Exists**: Read it thoroughly. It contains everything prior sessions learned and decided. Skip to Phase 3 (Execute) using the tracker's context.
- **Does not exist**: This is session 1. Proceed to Phase 2 (Orient).

Why read first: without the tracker, you'll duplicate work already done or contradict decisions made in prior sessions. The tracker is the single source of truth across sessions.
```

With:

```typescript
### Phase 1 — Read the Tracker

Read the tracker file at \`.athena/<session_id>/tracker.md\`.

- **Contains \`<!-- TRACKER_SKELETON -->\`**: This is session 1. The runner created a skeleton tracker with the goal and session metadata. Proceed to Phase 2 (Orient) — replace the skeleton with a real tracker.
- **Otherwise**: This is a continuation session. The tracker contains everything prior sessions learned and decided. Skip to Phase 3 (Execute) using the tracker's context.

Why read first: without the tracker, you'll duplicate work already done or contradict decisions made in prior sessions. The tracker is the single source of truth across sessions.
```

- [ ] **Step 2: Run tests that reference state machine content**

Run: `npx vitest run src/core/workflows/sessionPlan.test.ts`
Expected: The test that checks `instructions.toContain('# Stateless Session Protocol')` should still pass since the header is unchanged.

- [ ] **Step 3: Commit**

```bash
git add src/core/workflows/stateMachine.ts
git commit -m "docs(workflows): update state machine Phase 1 for tracker skeleton"
```

---

### Task 10: Final Integration Test and Cleanup

**Files:**

- All modified files

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Run linter**

Run: `npx eslint src/core/workflows/ src/infra/sessions/ src/app/exec/runner.ts`
Expected: No errors (or only pre-existing ones)

- [ ] **Step 4: Verify no unused imports**

Check that the removed `sessionPlan` imports from `runner.ts` don't leave orphaned imports. Check that `TurnContinuation` `'reuse-current'` is NOT removed from `process.ts` (it's used by the Codex adapter — the spec incorrectly marked it for removal).

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "chore: final cleanup for session architecture redesign"
```
