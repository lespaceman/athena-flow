# Session Persistence Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix session persistence so feed events survive across resumes, decisions are durable, and session identity is coherent.

**Architecture:** Three root causes → three structural fixes. Mapper becomes the sole event factory (pure). SessionStore becomes the sole durability boundary. useFeed coordinates without creating or persisting events itself. Athena registry becomes the sole session identity authority.

**Tech Stack:** TypeScript, Ink/React, vitest, better-sqlite3

**Design doc:** `docs/plans/2026-02-22-session-persistence-redesign.md`

---

### Task 1: Mapper — agent.message generation from Stop (TDD)

**Files:**
- Modify: `source/feed/mapper.ts:389-406` (Stop case)
- Test: `source/feed/__tests__/mapper.test.ts`

**Step 1: Write the failing test**

Add to the `describe('agent.message enrichment')` section (create the describe block before `describe('seq numbering')`):

```typescript
describe('agent.message enrichment', () => {
	it('generates agent.message from Stop with last_assistant_message', () => {
		const mapper = createFeedMapper();
		mapper.mapEvent(
			makeRuntimeEvent('UserPromptSubmit', {
				payload: {
					hook_event_name: 'UserPromptSubmit',
					session_id: 'sess-1',
					transcript_path: '/tmp/t.jsonl',
					cwd: '/project',
					prompt: 'do stuff',
				},
			}),
		);
		const results = mapper.mapEvent(
			makeRuntimeEvent('Stop', {
				payload: {
					hook_event_name: 'Stop',
					session_id: 'sess-1',
					transcript_path: '/tmp/t.jsonl',
					cwd: '/project',
					stop_hook_active: false,
					last_assistant_message: 'Here is the final answer.',
				},
			}),
		);
		const agentMsg = results.find(r => r.kind === 'agent.message');
		expect(agentMsg).toBeDefined();
		expect(agentMsg!.data.message).toBe('Here is the final answer.');
		expect(agentMsg!.data.source).toBe('hook');
		expect(agentMsg!.data.scope).toBe('root');
		expect(agentMsg!.actor_id).toBe('agent:root');
		expect(Number.isInteger(agentMsg!.seq)).toBe(true);
		// Parent should be the stop.request event
		const stopEvt = results.find(r => r.kind === 'stop.request');
		expect(agentMsg!.cause?.parent_event_id).toBe(stopEvt!.event_id);
	});

	it('does NOT generate agent.message when no last_assistant_message', () => {
		const mapper = createFeedMapper();
		mapper.mapEvent(
			makeRuntimeEvent('UserPromptSubmit', {
				payload: {
					hook_event_name: 'UserPromptSubmit',
					session_id: 'sess-1',
					transcript_path: '/tmp/t.jsonl',
					cwd: '/project',
					prompt: 'do stuff',
				},
			}),
		);
		const results = mapper.mapEvent(
			makeRuntimeEvent('Stop', {
				payload: {
					hook_event_name: 'Stop',
					session_id: 'sess-1',
					transcript_path: '/tmp/t.jsonl',
					cwd: '/project',
					stop_hook_active: false,
				},
			}),
		);
		expect(results.find(r => r.kind === 'agent.message')).toBeUndefined();
	});
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/feed/__tests__/mapper.test.ts`
Expected: FAIL — `agent.message` not found in results.

**Step 3: Implement — add agent.message generation in Stop case**

In `source/feed/mapper.ts`, replace the `case 'Stop'` block (lines 389-406) with:

```typescript
case 'Stop': {
	results.push(...ensureRunArray(event));
	const stopEvt = makeEvent(
		'stop.request',
		'info',
		'agent:root',
		{
			stop_hook_active: (p.stop_hook_active as boolean) ?? false,
			last_assistant_message: p.last_assistant_message as
				| string
				| undefined,
		} satisfies import('./types.js').StopRequestData,
		event,
	);
	results.push(stopEvt);

	// Enrich: synthesize agent.message from last_assistant_message
	const stopMsg = p.last_assistant_message as string | undefined;
	if (stopMsg) {
		results.push(
			makeEvent(
				'agent.message',
				'info',
				'agent:root',
				{
					message: stopMsg,
					source: 'hook',
					scope: 'root',
				} satisfies import('./types.js').AgentMessageData,
				event,
				{parent_event_id: stopEvt.event_id},
			),
		);
	}
	break;
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run source/feed/__tests__/mapper.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add source/feed/mapper.ts source/feed/__tests__/mapper.test.ts
git commit -m "feat(mapper): generate agent.message from Stop events"
```

---

### Task 2: Mapper — agent.message generation from SubagentStop (TDD)

**Files:**
- Modify: `source/feed/mapper.ts:433-461` (SubagentStop case)
- Test: `source/feed/__tests__/mapper.test.ts`

**Step 1: Write the failing test**

Add to the `agent.message enrichment` describe block:

```typescript
it('generates agent.message from SubagentStop with last_assistant_message', () => {
	const mapper = createFeedMapper();
	mapper.mapEvent(
		makeRuntimeEvent('UserPromptSubmit', {
			payload: {
				hook_event_name: 'UserPromptSubmit',
				session_id: 'sess-1',
				transcript_path: '/tmp/t.jsonl',
				cwd: '/project',
				prompt: 'do stuff',
			},
		}),
	);
	mapper.mapEvent(
		makeRuntimeEvent('SubagentStart', {
			agentId: 'sa-1',
			agentType: 'task',
			payload: {
				hook_event_name: 'SubagentStart',
				agent_id: 'sa-1',
				agent_type: 'task',
				session_id: 'sess-1',
				transcript_path: '/tmp/t.jsonl',
				cwd: '/project',
			},
		}),
	);
	const results = mapper.mapEvent(
		makeRuntimeEvent('SubagentStop', {
			agentId: 'sa-1',
			agentType: 'task',
			payload: {
				hook_event_name: 'SubagentStop',
				session_id: 'sess-1',
				transcript_path: '/tmp/t.jsonl',
				cwd: '/project',
				agent_id: 'sa-1',
				agent_type: 'task',
				stop_hook_active: false,
				last_assistant_message: 'Subagent result text',
			},
		}),
	);
	const agentMsg = results.find(r => r.kind === 'agent.message');
	expect(agentMsg).toBeDefined();
	expect(agentMsg!.data.message).toBe('Subagent result text');
	expect(agentMsg!.data.scope).toBe('subagent');
	expect(agentMsg!.actor_id).toBe('subagent:sa-1');
	expect(Number.isInteger(agentMsg!.seq)).toBe(true);
	const subStopEvt = results.find(r => r.kind === 'subagent.stop');
	expect(agentMsg!.cause?.parent_event_id).toBe(subStopEvt!.event_id);
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/feed/__tests__/mapper.test.ts`
Expected: FAIL

**Step 3: Implement — add agent.message generation in SubagentStop case**

In `source/feed/mapper.ts`, replace the `case 'SubagentStop'` block (lines 433-461) with:

```typescript
case 'SubagentStop': {
	results.push(...ensureRunArray(event));
	const agentId = event.agentId ?? (p.agent_id as string | undefined);
	if (agentId) {
		const actorId = `subagent:${agentId}`;
		const idx = activeSubagentStack.lastIndexOf(actorId);
		if (idx !== -1) activeSubagentStack.splice(idx, 1);
	}
	const subStopActorId = `subagent:${agentId ?? 'unknown'}`;
	const subStopEvt = makeEvent(
		'subagent.stop',
		'info',
		subStopActorId,
		{
			agent_id: agentId ?? '',
			agent_type: event.agentType ?? (p.agent_type as string) ?? '',
			stop_hook_active: (p.stop_hook_active as boolean) ?? false,
			agent_transcript_path: p.agent_transcript_path as
				| string
				| undefined,
			last_assistant_message: p.last_assistant_message as
				| string
				| undefined,
		} satisfies import('./types.js').SubagentStopData,
		event,
	);
	results.push(subStopEvt);

	// Enrich: synthesize agent.message from last_assistant_message
	const subMsg = p.last_assistant_message as string | undefined;
	if (subMsg) {
		results.push(
			makeEvent(
				'agent.message',
				'info',
				subStopActorId,
				{
					message: subMsg,
					source: 'hook',
					scope: 'subagent',
				} satisfies import('./types.js').AgentMessageData,
				event,
				{parent_event_id: subStopEvt.event_id},
			),
		);
	}
	break;
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run source/feed/__tests__/mapper.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add source/feed/mapper.ts source/feed/__tests__/mapper.test.ts
git commit -m "feat(mapper): generate agent.message from SubagentStop events"
```

---

### Task 3: Store — add recordFeedEvents method (TDD)

**Files:**
- Modify: `source/sessions/store.ts`
- Create: `source/sessions/__tests__/store.test.ts`

**Step 1: Write the failing test**

Create `source/sessions/__tests__/store.test.ts`:

```typescript
import {describe, it, expect} from 'vitest';
import {createSessionStore} from '../store.js';
import type {FeedEvent} from '../../feed/types.js';

function makeFeedEvent(overrides: Partial<FeedEvent> = {}): FeedEvent {
	return {
		event_id: `evt-${Date.now()}-${Math.random().toString(36).slice(2)}`,
		seq: 1,
		ts: Date.now(),
		session_id: 'sess-1',
		run_id: 'run-1',
		kind: 'permission.decision',
		level: 'info',
		actor_id: 'user',
		title: 'Decision',
		data: {decision_type: 'allow'},
		...overrides,
	} as FeedEvent;
}

describe('SessionStore', () => {
	it('recordFeedEvents persists feed-only events with null runtime_event_id', () => {
		const store = createSessionStore({
			sessionId: 'test-session',
			projectDir: '/tmp/test',
			dbPath: ':memory:',
		});

		const fe = makeFeedEvent({event_id: 'decision-1', kind: 'permission.decision'});
		store.recordFeedEvents([fe]);

		const restored = store.restore();
		const found = restored.feedEvents.find(e => e.event_id === 'decision-1');
		expect(found).toBeDefined();
		expect(found!.kind).toBe('permission.decision');

		store.close();
	});

	it('recordFeedEvents increments event_count atomically', () => {
		const store = createSessionStore({
			sessionId: 'test-session',
			projectDir: '/tmp/test',
			dbPath: ':memory:',
		});

		store.recordFeedEvents([makeFeedEvent(), makeFeedEvent()]);
		const session = store.getAthenaSession();
		expect(session.eventCount).toBe(2);

		store.recordFeedEvents([makeFeedEvent()]);
		const session2 = store.getAthenaSession();
		expect(session2.eventCount).toBe(3);

		store.close();
	});
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/sessions/__tests__/store.test.ts`
Expected: FAIL — `recordFeedEvents` is not a function, `eventCount` not on AthenaSession.

**Step 3: Implement recordFeedEvents and event_count**

**3a. Schema migration** — in `source/sessions/schema.ts`, after the indexes block add:

```typescript
// Migration: add event_count column (idempotent via try/catch since
// SQLite doesn't support ALTER TABLE ... ADD COLUMN IF NOT EXISTS)
try {
	db.exec('ALTER TABLE session ADD COLUMN event_count INTEGER DEFAULT 0');
} catch {
	// Column already exists — ignore
}
```

**3b. Types** — in `source/sessions/types.ts`, add `eventCount` to `AthenaSession`:

```typescript
export type AthenaSession = {
	id: string;
	projectDir: string;
	createdAt: number;
	updatedAt: number;
	label?: string;
	eventCount?: number;
	adapterSessionIds: string[];
};
```

**3c. Store** — in `source/sessions/store.ts`:

Add to the `SessionStore` type:

```typescript
export type SessionStore = {
	recordEvent(event: RuntimeEvent, feedEvents: FeedEvent[]): void;
	recordFeedEvents(feedEvents: FeedEvent[]): void;  // NEW
	restore(): StoredSession;
	getAthenaSession(): AthenaSession;
	updateLabel(label: string): void;
	close(): void;
};
```

Add a prepared statement for event_count update (near line 83):

```typescript
const updateEventCount = db.prepare(
	'UPDATE session SET event_count = event_count + ? WHERE id = ?',
);
```

In `recordEventAtomic`, add the event_count increment at the end of the transaction:

```typescript
const recordEventAtomic = db.transaction(
	(event: RuntimeEvent, feedEvents: FeedEvent[]) => {
		recordRuntimeEvent(event);
		for (const fe of feedEvents) {
			insertFeedEvent.run(
				fe.event_id, event.id, fe.seq, fe.kind,
				fe.run_id, fe.actor_id, fe.ts, JSON.stringify(fe),
			);
		}
		updateEventCount.run(feedEvents.length, opts.sessionId);
	},
);
```

Add the new `recordFeedEvents` transaction:

```typescript
const recordFeedEventsAtomic = db.transaction(
	(feedEvents: FeedEvent[]) => {
		for (const fe of feedEvents) {
			insertFeedEvent.run(
				fe.event_id, null, fe.seq, fe.kind,
				fe.run_id, fe.actor_id, fe.ts, JSON.stringify(fe),
			);
		}
		updateEventCount.run(feedEvents.length, opts.sessionId);
		updateSessionTimestamp.run(Date.now(), opts.sessionId);
	},
);

function recordFeedEvents(feedEvents: FeedEvent[]): void {
	recordFeedEventsAtomic(feedEvents);
}
```

In `getAthenaSession()`, read event_count from the row:

```typescript
// In the sessionRow type cast, add event_count: number | null
// In the return, add: eventCount: sessionRow.event_count ?? 0
```

Return `recordFeedEvents` from the factory function.

**Step 4: Run test to verify it passes**

Run: `npx vitest run source/sessions/__tests__/store.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add source/sessions/store.ts source/sessions/schema.ts source/sessions/types.ts source/sessions/__tests__/store.test.ts
git commit -m "feat(store): add recordFeedEvents and event_count tracking"
```

---

### Task 4: useFeed — remove enrichStopEvent, persist decisions

**Files:**
- Modify: `source/hooks/useFeed.ts`
- Delete: `source/hooks/__tests__/useFeedEnrichStop.test.ts`

**Step 1: Remove enrichStopEvent function**

In `source/hooks/useFeed.ts`, delete the `enrichStopEvent` function (lines 59-96) and its imports (`AgentMessageData`, `StopRequestData`, `SubagentStopData`).

**Step 2: Remove enrichment loop from onEvent callback**

In the `onEvent` callback (around lines 340-348), delete the enrichment block:

```typescript
// DELETE these lines:
// Sync enrichment: extract agent final message on stop/subagent.stop
const enriched: FeedEvent[] = [];
for (const fe of newFeedEvents) {
	if (fe.kind === 'stop.request' || fe.kind === 'subagent.stop') {
		const msgEvent = enrichStopEvent(fe);
		if (msgEvent) enriched.push(msgEvent);
	}
}
newFeedEvents.push(...enriched);
```

**Step 3: Add decision persistence in onDecision callback**

Replace the `onDecision` handler (lines 368-384) with:

```typescript
const unsubDecision = runtime.onDecision(
	(eventId: string, decision: RuntimeDecision) => {
		if (abortRef.current.signal.aborted) return;
		const feedEvent = mapperRef.current.mapDecision(eventId, decision);
		if (feedEvent) {
			// Persist decision event
			if (sessionStoreRef.current) {
				sessionStoreRef.current.recordFeedEvents([feedEvent]);
			}

			setFeedEvents(prev => [...prev, feedEvent]);

			// Auto-dequeue permissions/questions when decision arrives
			if (
				feedEvent.kind === 'permission.decision' &&
				feedEvent.cause?.hook_request_id
			) {
				dequeuePermission(feedEvent.cause.hook_request_id);
			}
		}
	},
);
```

**Step 4: Delete the old enrichment test file**

```bash
rm source/hooks/__tests__/useFeedEnrichStop.test.ts
```

**Step 5: Run tests to verify nothing breaks**

Run: `npx vitest run source/`
Expected: All tests PASS (the deleted test file is gone, mapper tests cover enrichment now).

**Step 6: Commit**

```bash
git add source/hooks/useFeed.ts
git rm source/hooks/__tests__/useFeedEnrichStop.test.ts
git commit -m "refactor(useFeed): unify persistence pipeline, remove enrichStopEvent"
```

---

### Task 5: Registry — add findSessionByAdapterId (TDD)

**Files:**
- Modify: `source/sessions/registry.ts`
- Create: `source/sessions/__tests__/registry.test.ts`

**Step 1: Write the failing test**

Create `source/sessions/__tests__/registry.test.ts`:

```typescript
import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createSessionStore} from '../store.js';
import {findSessionByAdapterId} from '../registry.js';
import type {RuntimeEvent} from '../../runtime/types.js';

describe('findSessionByAdapterId', () => {
	let tmpDir: string;
	const projectDir = '/test/project';

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'athena-reg-test-'));
	});

	afterEach(() => {
		fs.rmSync(tmpDir, {recursive: true, force: true});
	});

	it('finds athena session that owns a given adapter session ID', () => {
		// Create an athena session with a known adapter session
		const sessionId = 'athena-session-1';
		const dbPath = path.join(tmpDir, sessionId, 'session.db');
		const store = createSessionStore({sessionId, projectDir, dbPath});

		const runtimeEvent: RuntimeEvent = {
			id: 'req-1',
			timestamp: Date.now(),
			hookName: 'SessionStart',
			sessionId: 'claude-adapter-abc',
			context: {cwd: '/project', transcriptPath: '/tmp/t.jsonl'},
			interaction: {expectsDecision: false},
			payload: {hook_event_name: 'SessionStart', session_id: 'claude-adapter-abc'},
		};
		store.recordEvent(runtimeEvent, []);
		store.close();

		// findSessionByAdapterId should find it
		const result = findSessionByAdapterId('claude-adapter-abc', projectDir, tmpDir);
		expect(result).not.toBeNull();
		expect(result!.id).toBe(sessionId);
	});

	it('returns null when adapter ID not found', () => {
		const result = findSessionByAdapterId('nonexistent', projectDir, tmpDir);
		expect(result).toBeNull();
	});
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/sessions/__tests__/registry.test.ts`
Expected: FAIL — `findSessionByAdapterId` is not exported.

**Step 3: Implement findSessionByAdapterId**

In `source/sessions/registry.ts`, add:

```typescript
export function findSessionByAdapterId(
	adapterId: string,
	projectDir: string,
	baseDir?: string,
): AthenaSession | null {
	const dir = baseDir ?? sessionsDir();
	if (!fs.existsSync(dir)) return null;

	const entries = fs.readdirSync(dir, {withFileTypes: true});
	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		const dbPath = path.join(dir, entry.name, 'session.db');
		const session = readSessionFromDb(dbPath);
		if (
			session &&
			(!projectDir || session.projectDir === projectDir) &&
			session.adapterSessionIds.includes(adapterId)
		) {
			return session;
		}
	}
	return null;
}
```

Note: the `baseDir` parameter allows tests to point at a temp directory instead of `~/.config/athena/sessions`.

**Step 4: Run test to verify it passes**

Run: `npx vitest run source/sessions/__tests__/registry.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add source/sessions/registry.ts source/sessions/__tests__/registry.test.ts
git commit -m "feat(registry): add findSessionByAdapterId for session identity lookup"
```

---

### Task 6: CLI — rewrite --continue resolution to Athena-only

**Files:**
- Modify: `source/cli.tsx:220-242`

**Step 1: Rewrite the --continue block**

Replace lines 220-242 of `source/cli.tsx` with:

```typescript
// Resolve --continue flag: Athena session registry is the sole identity authority.
// meow parses --continue (no value) as undefined for type: 'string', so check process.argv
const hasContinueFlag = process.argv.includes('--continue');
const showSessionPicker = cli.flags.sessions;

let initialSessionId: string | undefined;
let athenaSessionId: string;

if (cli.flags.continue) {
	// --continue=<id> — treat as Athena session ID first
	const meta = getSessionMeta(cli.flags.continue);
	if (meta) {
		athenaSessionId = meta.id;
		initialSessionId = meta.adapterSessionIds.at(-1);
	} else {
		// Backwards compat: maybe user passed a Claude adapter session ID
		const owner = findSessionByAdapterId(cli.flags.continue, cli.flags.projectDir);
		if (owner) {
			athenaSessionId = owner.id;
			initialSessionId = cli.flags.continue;
		} else {
			console.error(`Session not found: ${cli.flags.continue}. Starting new session.`);
			athenaSessionId = crypto.randomUUID();
		}
	}
} else if (hasContinueFlag) {
	// --continue (bare) — resume most recent Athena session
	const recent = getMostRecentAthenaSession(cli.flags.projectDir);
	if (recent) {
		athenaSessionId = recent.id;
		initialSessionId = recent.adapterSessionIds.at(-1);
	} else {
		console.error('No previous sessions found. Starting new session.');
		athenaSessionId = crypto.randomUUID();
	}
} else {
	athenaSessionId = crypto.randomUUID();
}
```

**Step 2: Update imports**

Add `findSessionByAdapterId` to the import from `'./sessions/registry.js'`:

```typescript
import {listSessions, getSessionMeta, getMostRecentAthenaSession, findSessionByAdapterId} from './sessions/registry.js';
```

Remove the `getMostRecentSession` import from `'./utils/sessionIndex.js'`:

```typescript
// REMOVE: import {getMostRecentSession} from './utils/sessionIndex.js';
```

Keep the `SessionEntry` type import since it's still used by the session picker in `app.tsx`.

**Step 3: Run lint + typecheck**

Run: `npm run lint && npx tsc --noEmit`
Expected: PASS

**Step 4: Commit**

```bash
git add source/cli.tsx
git commit -m "fix(cli): resolve --continue via Athena registry only"
```

---

### Task 7: App — deferred spawn (remove auto-spawn on mount)

**Files:**
- Modify: `source/app.tsx`

**Step 1: Remove the auto-spawn useEffect**

Delete lines 165-172 in `source/app.tsx`:

```typescript
// DELETE:
// Auto-spawn Claude when resuming a session.
const autoSpawnedRef = useRef(false);
useEffect(() => {
	if (initialSessionId && !autoSpawnedRef.current) {
		autoSpawnedRef.current = true;
		spawnClaude('', initialSessionId);
	}
}, [initialSessionId, spawnClaude]);
```

**Step 2: Hold initialSessionId as intent ref**

Replace deleted block with:

```typescript
// Hold initialSessionId as intent — consumed on first user prompt submission.
// Deferred spawn: no Claude process runs until user provides real input.
const initialSessionRef = useRef(initialSessionId);
```

**Step 3: Update submitPromptOrSlashCommand to use intent ref**

At line 305 (inside `submitPromptOrSlashCommand`), change:

```typescript
// BEFORE:
spawnClaude(result.text, currentSessionId ?? undefined);

// AFTER:
const sessionToResume = currentSessionId ?? initialSessionRef.current;
spawnClaude(result.text, sessionToResume ?? undefined);
// Clear intent after first use — subsequent prompts use currentSessionId from mapper
if (initialSessionRef.current) {
	initialSessionRef.current = undefined;
}
```

Also update the spawn in `executeCommand`'s `prompt` context (line 336):

```typescript
// The prompt.spawn already passes currentSessionId.
// No change needed here — it's called after first prompt resolves currentSessionId.
```

**Step 4: Run lint + typecheck**

Run: `npm run lint && npx tsc --noEmit`
Expected: PASS

**Step 5: Commit**

```bash
git add source/app.tsx
git commit -m "fix(app): defer Claude spawn until first user prompt"
```

---

### Task 8: Mapper — rebuild currentRun on restore (TDD)

**Files:**
- Modify: `source/feed/mapper.ts:36-71` (bootstrap block)
- Test: `source/feed/__tests__/mapper.test.ts`

**Step 1: Write the failing test**

Add a new describe block to mapper.test.ts:

```typescript
describe('bootstrap from stored session', () => {
	it('rebuilds currentRun from stored events with open run', () => {
		// Create a stored session with a run.start but no run.end
		const stored: import('../../sessions/types.js').StoredSession = {
			session: {
				id: 'athena-1',
				projectDir: '/project',
				createdAt: 1000,
				updatedAt: 2000,
				adapterSessionIds: ['sess-1'],
			},
			feedEvents: [
				{
					event_id: 'sess-1:R1:E1',
					seq: 1,
					ts: 1000,
					session_id: 'sess-1',
					run_id: 'sess-1:R1',
					kind: 'run.start',
					level: 'info',
					actor_id: 'system',
					title: 'Run started',
					data: {trigger: {type: 'user_prompt_submit', prompt_preview: 'fix bug'}},
				},
				{
					event_id: 'sess-1:R1:E2',
					seq: 2,
					ts: 1100,
					session_id: 'sess-1',
					run_id: 'sess-1:R1',
					kind: 'tool.pre',
					level: 'info',
					actor_id: 'agent:root',
					title: 'Read',
					data: {tool_name: 'Read', tool_input: {file_path: '/a.ts'}},
				},
				{
					event_id: 'sess-1:R1:E3',
					seq: 3,
					ts: 1200,
					session_id: 'sess-1',
					run_id: 'sess-1:R1',
					kind: 'tool.pre',
					level: 'info',
					actor_id: 'agent:root',
					title: 'Bash',
					data: {tool_name: 'Bash', tool_input: {command: 'ls'}},
				},
				{
					event_id: 'sess-1:R1:E4',
					seq: 4,
					ts: 1300,
					session_id: 'sess-1',
					run_id: 'sess-1:R1',
					kind: 'permission.request',
					level: 'info',
					actor_id: 'system',
					title: 'Permission',
					data: {tool_name: 'Bash', tool_input: {}},
				},
			] as FeedEvent[],
			adapterSessions: [{sessionId: 'sess-1', startedAt: 1000}],
		};

		const mapper = createFeedMapper(stored);
		const run = mapper.getCurrentRun();
		expect(run).not.toBeNull();
		expect(run!.run_id).toBe('sess-1:R1');
		expect(run!.status).toBe('running');
		expect(run!.counters.tool_uses).toBe(2);
		expect(run!.counters.permission_requests).toBe(1);
		expect(run!.trigger.type).toBe('user_prompt_submit');
	});

	it('does NOT rebuild currentRun when last run is closed', () => {
		const stored: import('../../sessions/types.js').StoredSession = {
			session: {
				id: 'athena-1',
				projectDir: '/project',
				createdAt: 1000,
				updatedAt: 2000,
				adapterSessionIds: ['sess-1'],
			},
			feedEvents: [
				{
					event_id: 'sess-1:R1:E1',
					seq: 1,
					ts: 1000,
					session_id: 'sess-1',
					run_id: 'sess-1:R1',
					kind: 'run.start',
					level: 'info',
					actor_id: 'system',
					title: 'Run started',
					data: {trigger: {type: 'user_prompt_submit'}},
				},
				{
					event_id: 'sess-1:R1:E2',
					seq: 2,
					ts: 2000,
					session_id: 'sess-1',
					run_id: 'sess-1:R1',
					kind: 'run.end',
					level: 'info',
					actor_id: 'system',
					title: 'Run ended',
					data: {status: 'completed', counters: {}},
				},
			] as FeedEvent[],
			adapterSessions: [{sessionId: 'sess-1', startedAt: 1000}],
		};

		const mapper = createFeedMapper(stored);
		expect(mapper.getCurrentRun()).toBeNull();
	});
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/feed/__tests__/mapper.test.ts`
Expected: FAIL — `getCurrentRun()` returns null for the open run case.

**Step 3: Implement currentRun rebuild in mapper bootstrap**

In `source/feed/mapper.ts`, after the actor reconstruction block (around line 70), add:

```typescript
// Rebuild currentRun from last open run
let lastRunStart: FeedEvent | undefined;
let lastRunEnd: FeedEvent | undefined;
for (const e of stored.feedEvents) {
	if (e.kind === 'run.start') lastRunStart = e;
	if (e.kind === 'run.end') lastRunEnd = e;
}
if (lastRunStart && (!lastRunEnd || lastRunEnd.seq < lastRunStart.seq)) {
	const triggerData = lastRunStart.data as {
		trigger: {type: string; prompt_preview?: string};
	};
	currentRun = {
		run_id: lastRunStart.run_id,
		session_id: lastRunStart.session_id,
		started_at: lastRunStart.ts,
		trigger: triggerData.trigger as Run['trigger'],
		status: 'running',
		actors: {root_agent_id: 'agent:root', subagent_ids: []},
		counters: {
			tool_uses: 0,
			tool_failures: 0,
			permission_requests: 0,
			blocks: 0,
		},
	};
	// Rebuild counters from events in this run
	for (const e of stored.feedEvents) {
		if (e.run_id !== currentRun.run_id) continue;
		if (e.kind === 'tool.pre') currentRun.counters.tool_uses++;
		if (e.kind === 'tool.failure') currentRun.counters.tool_failures++;
		if (e.kind === 'permission.request')
			currentRun.counters.permission_requests++;
	}
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run source/feed/__tests__/mapper.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add source/feed/mapper.ts source/feed/__tests__/mapper.test.ts
git commit -m "feat(mapper): rebuild currentRun from stored events on bootstrap"
```

---

### Task 9: HookContext — close SessionStore on unmount

**Files:**
- Modify: `source/context/HookContext.tsx`

**Step 1: Add useEffect cleanup**

In `source/context/HookContext.tsx`, after the `sessionStore` useMemo (line 35), add:

```typescript
useEffect(() => {
	return () => {
		sessionStore.close();
	};
}, [sessionStore]);
```

Add `useEffect` to the React import if not already there.

**Step 2: Run lint + typecheck**

Run: `npm run lint && npx tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
git add source/context/HookContext.tsx
git commit -m "fix(HookContext): close SessionStore on unmount to prevent DB leaks"
```

---

### Task 10: Session picker — use eventCount instead of adapter count

**Files:**
- Modify: `source/app.tsx:770`
- Modify: `source/sessions/registry.ts` (readSessionFromDb to read event_count)

**Step 1: Update registry to read event_count**

In `source/sessions/registry.ts`, in the `readSessionFromDb` function, update the row type to include `event_count`:

```typescript
const row = db.prepare('SELECT * FROM session LIMIT 1').get() as
	| {
			id: string;
			project_dir: string;
			created_at: number;
			updated_at: number;
			label: string | null;
			event_count: number | null;
	  }
	| undefined;
```

And in the return object, add: `eventCount: row.event_count ?? 0`

**Step 2: Update the session picker mapping in app.tsx**

At line 770, change:

```typescript
// BEFORE:
messageCount: s.adapterSessionIds.length,

// AFTER:
messageCount: s.eventCount ?? s.adapterSessionIds.length,
```

**Step 3: Run lint + typecheck**

Run: `npm run lint && npx tsc --noEmit`
Expected: PASS

**Step 4: Commit**

```bash
git add source/app.tsx source/sessions/registry.ts
git commit -m "fix(picker): show feed event count instead of adapter session count"
```

---

### Task 11: Mapper — add correlation index comment

**Files:**
- Modify: `source/feed/mapper.ts:30-34`

**Step 1: Add comment**

Replace the existing comment at lines 30-31 with:

```typescript
// Correlation indexes — keyed on undocumented request_id (best-effort).
// mapDecision() returns null when requestId is missing from the index.
//
// NOTE: These indexes are NOT rebuilt from stored session data on restore.
// This is intentional: a new run (triggered by SessionStart or UserPromptSubmit)
// clears all indexes via ensureRunArray(), and old adapter session request IDs
// won't recur in the new adapter session. The brief window between restore and
// first new event has empty indexes, which is benign — no decisions can arrive
// for events from the old adapter session.
```

**Step 2: Commit**

```bash
git add source/feed/mapper.ts
git commit -m "docs(mapper): document correlation index restore limitation"
```

---

### Task 12: Final verification

**Step 1: Run full test suite**

```bash
npx vitest run source/
```

Expected: All tests PASS.

**Step 2: Run lint**

```bash
npm run lint
```

Expected: No errors.

**Step 3: Run build**

```bash
npm run build
```

Expected: Compiles cleanly.

**Step 4: Run typecheck**

```bash
npx tsc --noEmit
```

Expected: No type errors.

**Step 5: Commit any formatting fixes**

```bash
npm run format
git add -A
git commit -m "chore: format after session persistence redesign"
```
