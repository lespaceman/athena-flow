# Persistent Athena Sessions — Design

## Problem

Athena sessions are entirely ephemeral. Feed events live in React state (max 200), the FeedMapper's correlation state dies on restart, and there is no concept of an athena session identity spanning multiple Claude adapter sessions. Closing the terminal loses all context.

## Requirements

1. One athena session spans multiple adapter (Claude) sessions
2. Persistent storage for raw hook payloads and derived feed events
3. Session layer sits between adapter and feed model
4. Claude-agnostic — no dependency on Claude's session identity
5. Sessions are restorable — feed populates on restore
6. Full replay on restore (all events loaded into feed)

## Session Identity

An **athena session** is a persistent container with its own ID, independent of Claude's `session_id`.

```typescript
type AthenaSession = {
	id: string; // nanoid or UUID
	projectDir: string; // project this session belongs to
	createdAt: number; // epoch ms
	updatedAt: number; // last event timestamp
	label?: string; // user-provided name
	adapterSessionIds: string[]; // Claude session_ids within this athena session
};
```

**Lifecycle:**

- **Create**: `athena` without `--continue` → new session, new SQLite DB
- **Continue**: `athena --continue [id]` → load existing session, replay events, accept new adapter events
- **List**: `athena --sessions` → show athena sessions with metadata
- Sessions never explicitly "end" — always resumable. `updatedAt` tracks staleness.

## Architecture: SessionStore Middleware

The `SessionStore` wraps a `Runtime` and intercepts event/decision flow to persist everything.

```
Recording (live):
  Runtime.onEvent() → SessionStore intercepts:
    1. Write RuntimeEvent to runtime_events table
    2. Track adapter_session_id in adapter_sessions table
    3. Forward event to useFeed's handler
                            ↓
  useFeed calls mapEvent() → FeedEvent[]
    then calls sessionStore.recordFeedEvents(runtimeEventId, feedEvents)
                            ↓
  SessionStore writes FeedEvents to feed_events table

Restore:
  SessionStore.restore()
    → Read all feed_events ORDER BY seq
    → Return StoredSession { session, feedEvents, adapterSessions }
                            ↓
  useFeed hydrates feedEvents state directly (no mapper replay)
    → createFeedMapper(stored) bootstraps internal state
    → Continues accepting new live events normally
```

### SessionStore Interface

```typescript
type SessionStore = {
	// Runtime-compatible (decorates underlying Runtime)
	start(): void;
	stop(): void;
	onEvent(handler: RuntimeEventHandler): () => void;
	sendDecision(eventId: string, decision: RuntimeDecision): void;

	// Session operations
	getAthenaSession(): AthenaSession;
	recordFeedEvents(runtimeEventId: string, feedEvents: FeedEvent[]): void;
	restore(): StoredSession;
};

type StoredSession = {
	session: AthenaSession;
	feedEvents: FeedEvent[];
	adapterSessions: AdapterSessionRecord[];
};
```

### Why SessionStore never calls the mapper

The mapper is stateful (tracks runs, actors, correlation indexes). Splitting mapper invocation across two call sites would create state synchronization issues. `useFeed` remains the single owner of FeedEvent creation; SessionStore only stores what the mapper produces.

## Storage

### Location

`~/.config/athena/sessions/{athena_session_id}/session.db`

Each session gets its own directory (allows co-located artifacts later). Consistent with `~/.config/athena/workflows/` pattern.

### SQLite Schema

```sql
CREATE TABLE session (
  id TEXT PRIMARY KEY,
  project_dir TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  label TEXT
);

CREATE TABLE runtime_events (
  id TEXT PRIMARY KEY,
  seq INTEGER NOT NULL UNIQUE,
  timestamp INTEGER NOT NULL,
  hook_name TEXT NOT NULL,
  adapter_session_id TEXT,
  payload JSON NOT NULL
);

CREATE TABLE feed_events (
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

CREATE TABLE adapter_sessions (
  session_id TEXT PRIMARY KEY,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  model TEXT,
  source TEXT
);

CREATE INDEX idx_feed_kind ON feed_events(kind);
CREATE INDEX idx_feed_run ON feed_events(run_id);
CREATE INDEX idx_runtime_seq ON runtime_events(seq);
```

**Dual storage rationale:**

- `runtime_events` is the immutable log — if FeedEvent schema evolves, re-derive from raw payloads
- `feed_events` enables fast restore without replaying through the mapper
- `runtime_event_id` foreign key maintains traceability

### Library

`better-sqlite3` — synchronous API, fastest performance, widely used in Node CLI tools. WAL mode for fast writes.

## Integration Points

### useFeed

```typescript
// New signature
function useFeed(runtime: Runtime, sessionStore?: SessionStore): UseFeedResult;
```

- **On mount (restore):** If sessionStore has stored events, hydrate feedEvents directly and bootstrap mapper via `createFeedMapper(stored)`
- **On new events (record):** After `mapEvent()`, call `sessionStore.recordFeedEvents(event.id, feedEvents)`
- **Feed cap:** 200-event in-memory cap raised/removed for restored sessions

### createFeedMapper

```typescript
// New signature
function createFeedMapper(stored?: StoredSession): FeedMapper;
```

When `stored` is provided, initializes internal state (currentSession, currentRun, actors, seq counters) from last known values so new live events get correct sequence numbers and actor attribution.

### HookProvider

Creates `SessionStore` alongside `Runtime`:

```typescript
const sessionStore = useMemo(() => {
	if (athenaSessionId) {
		return createSessionStore(athenaSessionId, projectDir);
	}
	return createSessionStore(generateId(), projectDir);
}, [athenaSessionId, projectDir]);
```

### cli.tsx

- `--continue` resolves athena session IDs (not Claude session IDs)
- `--sessions` lists athena sessions from `~/.config/athena/sessions/`
- New session creation generates athena session ID passed to `<App>`

## CLI Surface

| Flag                     | Behavior                                               |
| ------------------------ | ------------------------------------------------------ |
| `athena`                 | Creates a new athena session                           |
| `athena --continue`      | Resumes most recent athena session for current project |
| `athena --continue <id>` | Resumes specific athena session by ID                  |
| `athena --sessions`      | Lists athena sessions with metadata                    |
| `athena --label "name"`  | Sets a label on the current session                    |

## Module Structure

```
source/sessions/
  types.ts          — AthenaSession, StoredSession, AdapterSessionRecord
  store.ts          — createSessionStore() factory, SQLite read/write
  registry.ts       — listSessions, getSessionMeta, removeSession, getMostRecentAthenaSession
  schema.ts         — SQLite table creation, migrations
  index.ts          — barrel re-export
```

### Boundary Rules

- `sessions/store.ts` depends on `feed/types.ts` and `runtime/types.ts`
- `sessions/store.ts` does NOT depend on `feed/mapper.ts`
- Components never import from `sessions/` — access session data through `UseFeedResult`
- `better-sqlite3` isolated inside `sessions/store.ts`

## What Changes

- `useFeed` gains optional `SessionStore` param
- `createFeedMapper` gains optional `StoredSession` param
- `HookProvider` creates `SessionStore`
- `cli.tsx` resolves athena session IDs
- 200-event feed cap raised/removed for restored sessions
- New `better-sqlite3` dependency

## What Doesn't Change

- Runtime adapter interface
- FeedMapper event processing logic
- Hook controller
- Component rendering
- Feed boundary rules
