# Feed Model Design

> Date: 2026-02-18
> Status: Approved
> Replaces: `HookEventDisplay`, `mapToDisplay`, `useContentOrdering`

## Overview

The feed model introduces a semantic event layer between the runtime boundary (`RuntimeEvent`) and the UI. Every hook event, decision, and lifecycle transition becomes a typed `FeedEvent` in an append-only trace. The UI renders `FeedEvent` objects directly — no more casting `payload as Record<string, unknown>`.

## Design Principles

1. **Append-only semantic trace** — `FeedEvent[]` is never mutated. Decisions are separate events, not patches.
2. **Provenance and causality** — every event has `actor_id` (who) and `cause` (what triggered it).
3. **"No opinion" is first-class** — `decision_type: 'no_opinion'` for timeouts and skips.
4. **Forward-compatible** — unknown hook events → `unknown.hook` kind, never dropped.

## Decisions

| Question | Decision |
|----------|----------|
| Where does Run state live? | Feed layer owns it (stateful mapper) |
| Decisions: separate events or patches? | Separate events (append-only) |
| Todo events (todo.add/update/done)? | Defer to phase 2; types defined, mapper not implemented |
| Integration approach? | Full replacement (Approach A) — FeedEvent replaces HookEventDisplay |

---

## 1. Core Types

### FeedEventBase

```ts
type FeedEventBase = {
  event_id: string;        // `${run_id}:E${seq}`
  seq: number;             // monotonic per run
  ts: number;              // ms (from envelope)

  session_id: string;
  run_id: string;

  kind: FeedEventKind;
  level: 'debug' | 'info' | 'warn' | 'error';
  actor_id: string;

  cause?: {
    parent_event_id?: string;
    hook_request_id?: string;
    tool_use_id?: string;
    transcript_path?: string;
  };

  title: string;
  body?: string;
  ui?: {
    collapsed_default?: boolean;
    pin?: boolean;
    badge?: string;
  };

  raw?: unknown;
};
```

### FeedEventKind

```ts
type FeedEventKind =
  | 'session.start' | 'session.end'
  | 'run.start' | 'run.end'
  | 'user.prompt'
  | 'tool.pre' | 'tool.post' | 'tool.failure'
  | 'permission.request' | 'permission.decision'
  | 'stop.request' | 'stop.decision'
  | 'subagent.start' | 'subagent.stop'
  | 'notification' | 'compact.pre' | 'setup'
  | 'unknown.hook'
  | 'todo.add' | 'todo.update' | 'todo.done';  // phase 2
```

### FeedEvent (discriminated union)

```ts
type FeedEvent =
  | (FeedEventBase & { kind: 'session.start'; data: SessionStartData })
  | (FeedEventBase & { kind: 'session.end'; data: SessionEndData })
  | (FeedEventBase & { kind: 'run.start'; data: RunStartData })
  | (FeedEventBase & { kind: 'run.end'; data: RunEndData })
  | (FeedEventBase & { kind: 'user.prompt'; data: UserPromptData })
  | (FeedEventBase & { kind: 'tool.pre'; data: ToolPreData })
  | (FeedEventBase & { kind: 'tool.post'; data: ToolPostData })
  | (FeedEventBase & { kind: 'tool.failure'; data: ToolFailureData })
  | (FeedEventBase & { kind: 'permission.request'; data: PermissionRequestData })
  | (FeedEventBase & { kind: 'permission.decision'; data: PermissionDecisionData })
  | (FeedEventBase & { kind: 'stop.request'; data: StopRequestData })
  | (FeedEventBase & { kind: 'stop.decision'; data: StopDecisionData })
  | (FeedEventBase & { kind: 'subagent.start'; data: SubagentStartData })
  | (FeedEventBase & { kind: 'subagent.stop'; data: SubagentStopData })
  | (FeedEventBase & { kind: 'notification'; data: NotificationData })
  | (FeedEventBase & { kind: 'compact.pre'; data: PreCompactData })
  | (FeedEventBase & { kind: 'setup'; data: SetupData })
  | (FeedEventBase & { kind: 'unknown.hook'; data: UnknownHookData })
  | (FeedEventBase & { kind: 'todo.add'; data: TodoAddData })
  | (FeedEventBase & { kind: 'todo.update'; data: TodoUpdateData })
  | (FeedEventBase & { kind: 'todo.done'; data: TodoDoneData });
```

---

## 2. Kind-Specific Data Types

### Session lifecycle

```ts
type SessionStartData = {
  source: 'startup' | 'resume' | 'clear' | 'compact';
  model?: string;
  agent_type?: string;
};

type SessionEndData = {
  reason: 'clear' | 'logout' | 'prompt_input_exit'
    | 'bypass_permissions_disabled' | 'other' | string;
};
```

### Run lifecycle

```ts
type RunStartData = {
  trigger: {
    type: 'user_prompt_submit' | 'resume' | 'other';
    prompt_preview?: string;
  };
};

type RunEndData = {
  status: 'completed' | 'failed' | 'aborted';
  counters: {
    tool_uses: number;
    tool_failures: number;
    permission_requests: number;
    blocks: number;
  };
};
```

### User

```ts
type UserPromptData = {
  prompt: string;
  cwd: string;
  permission_mode?: string;
};
```

### Tools

```ts
type ToolPreData = {
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_use_id?: string;
};

type ToolPostData = {
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_use_id?: string;
  tool_response: unknown;
};

type ToolFailureData = {
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_use_id?: string;
  error: string;
  is_interrupt?: boolean;
};
```

### Permissions

```ts
type PermissionRequestData = {
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_use_id?: string;
  permission_suggestions?: Array<{ type: string; tool: string }>;
};

type PermissionDecisionData =
  | { decision_type: 'no_opinion'; reason?: string }
  | { decision_type: 'allow'; updated_input?: Record<string, unknown>;
      updated_permissions?: unknown; reason?: string }
  | { decision_type: 'deny'; message: string; interrupt?: boolean; reason?: string }
  | { decision_type: 'ask'; reason?: string };
```

### Stop / gating

```ts
type StopRequestData = {
  stop_hook_active: boolean;
  scope: 'root' | 'subagent';
  agent_id?: string;
  agent_type?: string;
};

type StopDecisionData =
  | { decision_type: 'no_opinion'; reason?: string }
  | { decision_type: 'block'; reason: string }
  | { decision_type: 'allow'; reason?: string };
```

### Subagents

```ts
type SubagentStartData = { agent_id: string; agent_type: string; };
type SubagentStopData = {
  agent_id: string; agent_type: string;
  stop_hook_active: boolean; agent_transcript_path?: string;
};
```

### Notifications & maintenance

```ts
type NotificationData = {
  message: string; title?: string; notification_type?: string;
};
type PreCompactData = { trigger: 'manual' | 'auto'; custom_instructions?: string; };
type SetupData = { trigger: 'init' | 'maintenance'; };
type UnknownHookData = { hook_event_name: string; payload: unknown; };
```

### Todo (phase 2 — types only)

```ts
type TodoPriority = 'p0' | 'p1' | 'p2';
type TodoFeedStatus = 'open' | 'doing' | 'blocked' | 'done';

type TodoAddData = {
  todo_id: string; text: string; details?: string;
  priority?: TodoPriority; linked_event_id?: string;
  assigned_actor_id?: string; tags?: string[];
};
type TodoUpdateData = {
  todo_id: string;
  patch: Partial<{
    text: string; details: string; priority: TodoPriority;
    status: TodoFeedStatus; assigned_actor_id: string; tags: string[];
  }>;
};
type TodoDoneData = { todo_id: string; reason?: string; };
```

---

## 3. Entities

### Session

```ts
type Session = {
  session_id: string;
  started_at: number;
  ended_at?: number;
  source?: 'startup' | 'resume' | 'clear' | 'compact';
  model?: string;
  agent_type?: string;
};
```

### Run

```ts
type Run = {
  run_id: string;            // `${session_id}:R${seq}`
  session_id: string;
  started_at: number;
  ended_at?: number;
  trigger: {
    type: 'user_prompt_submit' | 'resume' | 'other';
    request_id?: string;
    prompt_preview?: string;
  };
  status: 'running' | 'blocked' | 'completed' | 'failed' | 'aborted';
  actors: { root_agent_id: string; subagent_ids: string[]; };
  counters: {
    tool_uses: number; tool_failures: number;
    permission_requests: number; blocks: number;
  };
};
```

Run lifecycle:
- **Opened by:** `UserPromptSubmit` (type=user_prompt_submit), `SessionStart` with source=resume (type=resume), or any event arriving with no active run (type=other)
- **Closed by:** `Stop` (scope root), `SessionEnd`, or new `UserPromptSubmit` (closes previous, opens new)

### Actor

```ts
type ActorKind = 'user' | 'agent' | 'subagent' | 'system';

type Actor = {
  actor_id: string;           // 'user', 'agent:root', 'subagent:<agent_id>'
  kind: ActorKind;
  display_name: string;
  agent_type?: string;
  parent_actor_id?: string;
};
```

Pre-registered: `user` (kind=user), `agent:root` (kind=agent).
Auto-registered on `SubagentStart`: `subagent:<agent_id>` (kind=subagent, parent=agent:root).

---

## 4. Feed Mapper

### Interface

```ts
type FeedMapper = {
  mapEvent(event: RuntimeEvent): FeedEvent[];
  mapDecision(eventId: string, decision: RuntimeDecision): FeedEvent | null;
  getSession(): Session | null;
  getCurrentRun(): Run | null;
  getActors(): Actor[];
};

function createFeedMapper(): FeedMapper;
```

### Internal state

```ts
type FeedMapperState = {
  currentSession: Session | null;
  currentRun: Run | null;
  actors: Map<string, Actor>;
  seq: number;                    // monotonic per run
  runSeq: number;                 // for generating run_id
  toolPreIndex: Map<string, string>;  // tool_use_id → event_id
  eventIdByRequestId: Map<string, string>;  // hook request_id → event_id (for decisions)
};
```

### Hook → kind mapping table

| hook_event_name | FeedEventKind | Actor |
|-----------------|---------------|-------|
| SessionStart | session.start | system |
| SessionEnd | session.end | system |
| UserPromptSubmit | run.start + user.prompt | user |
| PreToolUse | tool.pre | agent:root or subagent |
| PostToolUse | tool.post | agent:root or subagent |
| PostToolUseFailure | tool.failure | agent:root or subagent |
| PermissionRequest | permission.request | system |
| Stop | stop.request (scope=root) | system |
| SubagentStart | subagent.start | agent:root |
| SubagentStop | subagent.stop | subagent |
| Notification | notification | system |
| PreCompact | compact.pre | system |
| Setup | setup | system |
| (unknown) | unknown.hook | system |

### One-to-many mapping

- `UserPromptSubmit` → `[run.start, user.prompt]`
- `SessionEnd` → `[session.end]` + `[run.end]` if run active
- `SubagentStart` → registers actor + `[subagent.start]`

### Correlation

- Always: `cause.hook_request_id = RuntimeEvent.id`
- Tool events: `cause.tool_use_id = RuntimeEvent.toolUseId`
- `tool.post`/`tool.failure`: `cause.parent_event_id = toolPreIndex[tool_use_id]`
- `permission.decision`: `cause.parent_event_id = eventIdByRequestId[original_request_id]`

### Title generation

Pure function: `(kind, data) → string`. Examples:
- `tool.pre` → `"● Read(file_path)"`
- `tool.post` → `"⎿ Read result"`
- `permission.request` → `"⚠ Permission: Bash"`
- `permission.decision` → `"✓ Allowed"` or `"✗ Denied: reason"`
- `notification` → message text (truncated)
- `unknown.hook` → `"? <hook_event_name>"`

---

## 5. useFeed Hook

Replaces `useRuntime` + `useContentOrdering`.

### Interface

```ts
type FeedItem =
  | { type: 'message'; data: Message }
  | { type: 'feed'; data: FeedEvent };

type UseFeedResult = {
  items: FeedItem[];
  tasks: TodoItem[];
  session: Session | null;
  currentRun: Run | null;
  actors: Actor[];
  isServerRunning: boolean;

  currentPermissionRequest: FeedEvent | null;
  permissionQueueCount: number;
  resolvePermission: (eventId: string, decision: PermissionDecision) => void;

  currentQuestionRequest: FeedEvent | null;
  questionQueueCount: number;
  resolveQuestion: (eventId: string, answers: Record<string, string>) => void;

  resetSession: () => void;
  clearEvents: () => void;
  rules: HookRule[];
  addRule: (rule: Omit<HookRule, 'id'>) => void;
  removeRule: (id: string) => void;
  clearRules: () => void;
  printTaskSnapshot: () => void;
};
```

### Behavior

1. Creates `FeedMapper` instance (stable, via `useRef`)
2. Subscribes `runtime.onEvent` → `mapper.mapEvent()` → append to feed state
3. Subscribes `runtime.onDecision` → `mapper.mapDecision()` → append to feed state
4. Runs `hookController.handleEvent()` on each `RuntimeEvent` for rule matching / queue management
5. Sorts feed + messages by `ts`, filters excluded kinds
6. Task extraction: current snapshot approach (phase 1), reads from `tool.pre` events with `tool_name=TodoWrite`

---

## 6. Component Migration

### FeedEventRenderer (replaces HookEvent)

Routes by `event.kind` discriminant instead of `hookName` string matching.

Components receive typed `FeedEvent` with structured `data` field:
- `event.data.tool_name` instead of `(event.payload as Record<string, unknown>).tool_name`

### Rendering defaults

| Kind | collapsed_default | badge |
|------|-------------------|-------|
| tool.pre | true | TOOL |
| tool.post | true | — |
| tool.failure | false | FAIL |
| permission.request | false | PERM |
| permission.decision | (no body) | — |
| stop.request | false | STOP |
| notification | (no body) | — |
| unknown.hook | true | ? |

---

## 7. File Layout

```
source/feed/
  types.ts          # FeedEventBase, FeedEventKind, FeedEvent, all data types
  entities.ts       # Session, Run, Actor, ActorRegistry
  mapper.ts         # Stateful FeedMapper: RuntimeEvent → FeedEvent[]
  titleGen.ts       # Pure: (kind, data) → title
  filter.ts         # Pure: shouldExclude(FeedEvent) → boolean
  __tests__/
    mapper.test.ts
    titleGen.test.ts
    filter.test.ts
```

### Boundary enforcement

- `source/feed/` added to ESLint `no-restricted-imports` and vitest boundary test
- `source/feed/` may import `source/runtime/types.ts` (RuntimeEvent, RuntimeDecision)
- `source/feed/` must NOT import protocol types
- Components may import `source/feed/types.ts` only (not mapper.ts)

### Files deleted

- `source/types/hooks/display.ts` (HookEventDisplay → FeedEvent)
- `source/hooks/mapToDisplay.ts` + test
- `source/hooks/useRuntime.ts`
- `source/hooks/useContentOrdering.ts` + test
- `source/types/server.ts` (PermissionDecision moves to feed or stays minimal)
