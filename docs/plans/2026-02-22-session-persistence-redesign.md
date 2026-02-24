# Session Persistence Redesign

**Date**: 2026-02-22
**Status**: Approved

## Problem

The persistent session system has two user-facing symptoms: (1) every resume submits an empty prompt and (2) many feed events are missing after continuing a session. Investigation traced these to three root causes, not ten independent bugs.

## Root Causes

### 1. Premature Claude Spawn

`app.tsx:170` auto-spawns Claude on mount with `spawnClaude('', initialSessionId)`. This confuses session identity (durable) with process existence (ephemeral). The correct causal order is:

```
User intent → spawn adapter → runtime events → mapper → persistence
```

Not: mount → spawn with empty prompt → hope it works.

### 2. Enrichment and Decisions Bypass Persistence

Three partial persistence pipelines existed:

1. Runtime → mapper → persist (correct)
2. Runtime → persist → enrichStopEvent() → UI only (agent.message lost)
3. Decision → mapper → UI only (decisions lost)

The invariant must be: **every FeedEvent shown in the UI came from mapper, and every FeedEvent from mapper goes through recordEvent atomically.** No exceptions.

### 3. Dual Registry Session Identity

`--continue=<id>` treats the value as both adapter and athena ID. Bare `--continue` resolves from two unrelated registries independently (Claude's index at `~/.claude/projects/` and Athena's DB at `~/.config/athena/sessions/`). Two registries is architectural schizophrenia.

## Design

### Ownership Boundaries

| Layer               | Owns                                                                                | Does NOT do                                                               |
| ------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| **Mapper**          | Semantic event generation. All `FeedEvent` creation. Pure: `mapX()` → `FeedEvent[]` | Persistence. Side effects.                                                |
| **SessionStore**    | Durability. Atomic writes. Schema.                                                  | Event semantics. Mapping logic.                                           |
| **useFeed**         | Coordination. Subscribes to runtime, calls mapper, calls store, updates state.      | Event creation (delegates to mapper). Storage logic (delegates to store). |
| **Athena Registry** | Session identity. Athena session → adapter session mapping.                         | Process management. Event handling.                                       |
| **Runtime**         | Event source. Transport.                                                            | Interpretation. Persistence.                                              |

### Fix 1: Deferred Spawn

**Remove** the auto-spawn `useEffect` in `app.tsx:167-172`.

**Hold** `initialSessionId` as a ref in `AppContent`. On first prompt submission in `submitPromptOrSlashCommand`, pass it to `spawnClaude()`:

```typescript
const initialSessionRef = useRef(initialSessionId);

// In submitPromptOrSlashCommand:
const sessionToResume = currentSessionId ?? initialSessionRef.current;
spawnClaude(result.text, sessionToResume);
// Clear intent after first use
initialSessionRef.current = undefined;
```

**UX note**: The header will show idle state until first prompt. This is semantically correct — no adapter session is running. Status indicators should reflect "session loaded, awaiting prompt" rather than "active."

### Fix 2: Unified Persistence Pipeline

#### 2a. Move enrichment into mapper

In `mapper.ts`, the `Stop` and `SubagentStop` cases generate `agent.message` events inline:

```typescript
case 'Stop': {
    // ... existing stop.request event ...
    const msg = p.last_assistant_message as string | undefined;
    if (msg) {
        results.push(makeEvent('agent.message', 'info', 'agent:root',
            { message: msg, source: 'hook', scope: 'root' }, event,
            { parent_event_id: stopEvt.event_id }));
    }
    break;
}
```

Same pattern for `SubagentStop` with `scope: 'subagent'` and the subagent's actor_id.

`enrichStopEvent()` is deleted from `useFeed.ts`. Its test file migrates to mapper tests.

#### 2b. Persist decisions via unified path

Add `recordFeedEvents(feedEvents: FeedEvent[])` to SessionStore for feed-only events (no corresponding RuntimeEvent). The FK on `runtime_event_id` is already nullable.

In useFeed's `onDecision` callback:

```typescript
const feedEvent = mapper.mapDecision(eventId, decision);
if (feedEvent) {
	store.recordFeedEvents([feedEvent]);
	setFeedEvents(prev => [...prev, feedEvent]);
}
```

#### 2c. The unified pipeline

After this change, useFeed has exactly one pattern for all event types:

```
events = mapper.mapX(...)
store.recordX(events)
setState(events)
```

Three layers. One path. No synthetic side-channels.

### Fix 3: Athena-Only Session Identity

All session resolution goes through Athena registry. The old Claude session index (`getMostRecentSession()` from `sessionIndex.ts`) is no longer used for `--continue`.

#### `--continue=<id>`

Treat `<id>` as an Athena session ID. Look up the adapter session from its DB:

```typescript
if (cli.flags.continue) {
	athenaSessionId = cli.flags.continue;
	const meta = getSessionMeta(athenaSessionId);
	if (meta) {
		initialSessionId = meta.adapterSessionIds.at(-1);
	} else {
		// Backwards compat: maybe user passed an adapter ID
		const owner = findSessionByAdapterId(cli.flags.continue, projectDir);
		if (owner) {
			athenaSessionId = owner.id;
			initialSessionId = cli.flags.continue;
		} else {
			console.error('Session not found:', cli.flags.continue);
		}
	}
}
```

#### `--continue` (bare)

```typescript
} else if (hasContinueFlag) {
    const recent = getMostRecentAthenaSession(projectDir);
    if (recent) {
        athenaSessionId = recent.id;
        initialSessionId = recent.adapterSessionIds.at(-1);
    } else {
        console.error('No previous sessions found.');
        athenaSessionId = crypto.randomUUID();
    }
}
```

#### New registry function

```typescript
export function findSessionByAdapterId(
	adapterId: string,
	projectDir: string,
): AthenaSession | null {
	const sessions = listSessions(projectDir);
	return sessions.find(s => s.adapterSessionIds.includes(adapterId)) ?? null;
}
```

This is transitional for backwards compatibility. The primary abstraction is Athena session IDs.

### Fix 4: Rebuild currentRun on Restore

In mapper bootstrap, scan stored events for the last open run:

```typescript
if (stored && stored.feedEvents.length > 0) {
	// ... existing seq/session/actor restoration ...

	// Rebuild currentRun from last open run
	let lastRunStart: FeedEvent | undefined;
	let lastRunEnd: FeedEvent | undefined;
	for (const e of stored.feedEvents) {
		if (e.kind === 'run.start') lastRunStart = e;
		if (e.kind === 'run.end') lastRunEnd = e;
	}
	if (lastRunStart && (!lastRunEnd || lastRunEnd.seq < lastRunStart.seq)) {
		currentRun = {
			run_id: lastRunStart.run_id,
			session_id: lastRunStart.session_id,
			started_at: lastRunStart.ts,
			trigger: lastRunStart.data.trigger,
			status: 'running',
			actors: {root_agent_id: 'agent:root', subagent_ids: []},
			counters: {
				tool_uses: 0,
				tool_failures: 0,
				permission_requests: 0,
				blocks: 0,
			},
		};
		// Rebuild counters
		for (const e of stored.feedEvents) {
			if (e.run_id !== currentRun.run_id) continue;
			if (e.kind === 'tool.pre') currentRun.counters.tool_uses++;
			if (e.kind === 'tool.failure') currentRun.counters.tool_failures++;
			if (e.kind === 'permission.request')
				currentRun.counters.permission_requests++;
		}
	}
}
```

Long-term, explicit session_state checkpointing would be cleaner than reverse-parsing feed events. This is acceptable for v1.

### Fix 5: Correlation Index Comment

Correlation indexes (`toolPreIndex`, `eventIdByRequestId`, `eventKindByRequestId`) are empty after restore. This is benign: a new run clears them anyway (via `ensureRunArray`), and old adapter session request IDs won't recur. Add a code comment documenting this as a known limitation.

### Fix 6: SessionStore Cleanup

Add `useEffect` cleanup in `HookContext.tsx`:

```typescript
useEffect(() => {
	return () => {
		sessionStore.close();
	};
}, [sessionStore]);
```

### Fix 7: Event Count Column

Add `event_count INTEGER DEFAULT 0` to the `session` table. This counts **feed events** (not runtime events) — the picker cares about semantic events the user sees.

Increment atomically in the same transaction as event insert:

```typescript
const recordEventAtomic = db.transaction((event, feedEvents) => {
    recordRuntimeEvent(event);
    for (const fe of feedEvents) { insertFeedEvent.run(...); }
    db.prepare('UPDATE session SET event_count = event_count + ? WHERE id = ?')
      .run(feedEvents.length, opts.sessionId);
});
```

Same for `recordFeedEvents()` (decision events).

Add `eventCount` field to `AthenaSession` type. Use in `app.tsx` picker mapping instead of `adapterSessionIds.length`.

## Schema Changes

```sql
-- Migration: add event_count to session table
ALTER TABLE session ADD COLUMN event_count INTEGER DEFAULT 0;
```

Applied in `initSchema()` via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` pattern (or try/catch for SQLite which doesn't support IF NOT EXISTS on ALTER).

## Files Changed

| File                                               | Change                                                                                                            |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `source/feed/mapper.ts`                            | Add agent.message generation in Stop/SubagentStop. Rebuild currentRun in bootstrap.                               |
| `source/hooks/useFeed.ts`                          | Remove `enrichStopEvent()`. Add decision persistence in `onDecision`. Simplify `onEvent` enrichment loop.         |
| `source/hooks/__tests__/useFeedEnrichStop.test.ts` | Delete (tests migrate to mapper).                                                                                 |
| `source/feed/__tests__/mapper.test.ts`             | Add tests for agent.message generation, currentRun rebuild.                                                       |
| `source/sessions/store.ts`                         | Add `recordFeedEvents()`. Add event_count increment.                                                              |
| `source/sessions/schema.ts`                        | Add event_count column migration.                                                                                 |
| `source/sessions/types.ts`                         | Add `eventCount` to `AthenaSession`.                                                                              |
| `source/sessions/registry.ts`                      | Add `findSessionByAdapterId()`. Read event_count in registry functions.                                           |
| `source/app.tsx`                                   | Remove auto-spawn useEffect. Hold initialSessionId as ref. Pass to first prompt. Fix session picker messageCount. |
| `source/cli.tsx`                                   | Rewrite --continue resolution to use Athena registry only.                                                        |
| `source/context/HookContext.tsx`                   | Add useEffect cleanup for SessionStore.                                                                           |

## Implementation Order

1. **Mapper enrichment** (Fix 2a) — move agent.message into mapper, write failing tests first
2. **Store: recordFeedEvents** (Fix 2b) — add method, persist decisions in useFeed
3. **Remove enrichStopEvent** — delete from useFeed, delete old test file
4. **Session identity** (Fix 3) — rewrite cli.tsx, add findSessionByAdapterId
5. **Deferred spawn** (Fix 1) — remove auto-spawn, hold as intent ref
6. **Rebuild currentRun** (Fix 4) — mapper bootstrap, write failing tests first
7. **SessionStore cleanup** (Fix 6) — useEffect in HookContext
8. **Event count** (Fix 7) — schema migration, atomic increment, picker update
9. **Correlation comment** (Fix 5) — code comment only

## Testing

- mapper.test.ts: agent.message from Stop/SubagentStop, currentRun rebuild from stored
- store.test.ts: recordFeedEvents persists with null runtime_event_id, event_count increments
- registry.test.ts: findSessionByAdapterId
- Lint + typecheck + full test suite pass
- Manual: start session, submit prompt, quit, resume with --continue, verify feed events restored
