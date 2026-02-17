# Runtime Boundary Extraction — Design Document

> **Date**: 2026-02-17
> **Goal**: Move all Claude Code hook protocol handling behind a runtime boundary so UI never imports Claude transport/protocol types.

---

## 1. Problem

The Ink UI currently imports `HookEventEnvelope`, `HookResultPayload`, `ClaudeHookEvent`, and Claude-specific type guards directly. This couples the UI to a single agent harness's wire protocol. The goal is to extract all protocol handling into a runtime adapter so:

- UI imports only stable runtime boundary types
- Protocol knowledge lives in one adapter folder
- UI is testable without Claude Code (via mock adapter)
- The boundary is enforced and doesn't regress

**No UI behavior changes** — same screens, same flows, just relocation.

---

## 2. Runtime Boundary Types

### `source/runtime/types.ts`

```typescript
// ── Runtime Event (adapter → UI) ─────────────────────────

export type RuntimeEvent = {
  id: string;                // opaque correlation ID (= request_id internally)
  timestamp: number;         // unix ms
  hookName: string;          // hook_event_name as-is (open string, forward compatible)
  sessionId: string;

  // Cross-event derived fields (never tool-specific)
  toolName?: string;
  toolUseId?: string;
  agentId?: string;
  agentType?: string;

  // Base context present on all hook events
  context: {
    cwd: string;
    transcriptPath: string;
    permissionMode?: string;
  };

  // Interaction hints — does the runtime expect a decision?
  interaction: {
    expectsDecision: boolean;    // whether runtime waits for sendDecision
    defaultTimeoutMs?: number;   // adapter-enforced timeout
    canBlock?: boolean;          // protocol capability (not current UI behavior)
  };

  // Opaque payload — adapter enforces it's always an object
  // UI renderers may deep-access fields but must not import protocol types
  payload: unknown;
};

// ── Runtime Decision (UI → adapter) ──────────────────────

export type RuntimeDecisionType = 'passthrough' | 'block' | 'json';

export type RuntimeDecision = {
  type: RuntimeDecisionType;
  source: 'user' | 'timeout' | 'rule';
  intent?: RuntimeIntent;      // semantic intent for 'json' decisions
  reason?: string;             // for 'block' decisions
  data?: unknown;              // raw data (e.g., answers for AskUserQuestion)
};

// Typed intent union — small and stable
export type RuntimeIntent =
  | { kind: 'permission_allow' }
  | { kind: 'permission_deny'; reason: string }
  | { kind: 'question_answer'; answers: Record<string, string> }
  | { kind: 'pre_tool_allow' }
  | { kind: 'pre_tool_deny'; reason: string };

// ── Runtime Interface ────────────────────────────────────

export type RuntimeEventHandler = (event: RuntimeEvent) => void;

export type Runtime = {
  start(): void;
  stop(): void;
  getStatus(): 'stopped' | 'running';
  onEvent(handler: RuntimeEventHandler): () => void;  // returns unsubscribe
  sendDecision(eventId: string, decision: RuntimeDecision): void;
};
```

### Design decisions

- **`hookName` is `string`**, not a closed union — unknown events pass through without crash.
- **`RuntimeDecision.source`** distinguishes user action vs timeout vs rule match. Preserves "no opinion" vs "explicit allow" semantics.
- **`RuntimeIntent`** is a typed union so the adapter's `decisionMapper` is deterministic. Controller expresses semantic intent; adapter translates to Claude JSON shapes.
- **`payload: unknown`** — adapter wraps non-objects into `{ value: raw }`. UI renderers deep-access but never import protocol types.
- **`interaction`** hints formalize what's currently implicit: `canBlock` = protocol capability, `expectsDecision` = current product behavior.
- **`Runtime`** is a plain interface, not a React hook. Adapters implement it; UI wraps it in a hook.

---

## 3. Claude Hook Adapter

### Location: `source/runtime/adapters/claudeHooks/`

```
source/runtime/adapters/claudeHooks/
├── index.ts              # exports createClaudeHookRuntime(opts): Runtime
├── server.ts             # UDS net.Server lifecycle, NDJSON parse/write
├── mapper.ts             # HookEventEnvelope → RuntimeEvent (only file importing type guards)
├── decisionMapper.ts     # (RuntimeEvent, RuntimeDecision) → HookResultPayload
└── interactionRules.ts   # declarative map: hookName → interaction hints
```

### `createClaudeHookRuntime({ projectDir, instanceId }): Runtime`

Factory function. Creates UDS server, manages pending requests, handles timeouts.

### `mapper.ts`

The **only** file that imports `HookEventEnvelope`, `ClaudeHookEvent`, type guards. Responsibilities:
- Extract derived fields (`toolName`, `agentId`, etc.) from typed payload
- Build `context` from `BaseHookEvent` fields (`cwd`, `transcript_path`, `permission_mode`)
- Look up `interaction` hints from `interactionRules`
- Wrap payload: ensure it's always an object

### `decisionMapper.ts`

Signature: `decisionMapper(event: RuntimeEvent, decision: RuntimeDecision): HookResultPayload`

Takes the full `RuntimeEvent` (for `hookName` + any payload fields needed) and translates `RuntimeIntent` into Claude-specific JSON stdout shapes:

| Intent | hookName | HookResultPayload |
|--------|----------|--------------------|
| `permission_allow` | PermissionRequest | `json_output` with `{ hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'allow' } } }` |
| `permission_deny` | PermissionRequest | `json_output` with `{ ..., decision: { behavior: 'deny', reason } }` |
| `question_answer` | PreToolUse | `json_output` with `{ ..., permissionDecision: 'allow', updatedInput: { answers } }` |
| `pre_tool_allow` | PreToolUse | `json_output` with `{ ..., permissionDecision: 'allow' }` |
| `pre_tool_deny` | PreToolUse | `json_output` with `{ ..., permissionDecision: 'deny', reason }` |
| (no intent) | any | `passthrough` = no stdout, exit 0 |
| block | any | `block_with_stderr` with reason |

**Critical invariant**: `passthrough` means "no output, exit 0" (Claude continues with its own permission system). Never accidentally map passthrough into explicit allow JSON for PreToolUse — that changes semantics.

### `interactionRules.ts`

Declarative map with safe defaults for unknown events:

```typescript
const DEFAULT_RULE = { expectsDecision: false, defaultTimeoutMs: 4000, canBlock: false };

const RULES: Record<string, InteractionRule> = {
  PermissionRequest: { expectsDecision: true, defaultTimeoutMs: 300_000, canBlock: true },
  PreToolUse:        { expectsDecision: true, defaultTimeoutMs: 4000,    canBlock: true },
  PostToolUse:       { expectsDecision: false, defaultTimeoutMs: 4000,   canBlock: false },
  PostToolUseFailure:{ expectsDecision: false, defaultTimeoutMs: 4000,   canBlock: false },
  Stop:              { expectsDecision: false, defaultTimeoutMs: 4000,   canBlock: true },
  SubagentStop:      { expectsDecision: false, defaultTimeoutMs: 4000,   canBlock: true },
  SubagentStart:     { expectsDecision: false, defaultTimeoutMs: 4000,   canBlock: false },
  Notification:      { expectsDecision: false, defaultTimeoutMs: 4000,   canBlock: false },
  SessionStart:      { expectsDecision: false, defaultTimeoutMs: 4000,   canBlock: false },
  SessionEnd:        { expectsDecision: false, defaultTimeoutMs: 4000,   canBlock: false },
  PreCompact:        { expectsDecision: false, defaultTimeoutMs: 4000,   canBlock: false },
  UserPromptSubmit:  { expectsDecision: false, defaultTimeoutMs: 4000,   canBlock: true },
  // Unknown events: never wait, passthrough immediately
};
```

### Timeout handling

When timeout fires, the adapter:
1. Generates `RuntimeDecision { type: 'passthrough', source: 'timeout' }`
2. Runs it through `decisionMapper` to produce `HookResultPayload`
3. Sends `HookResultEnvelope` back over UDS
4. Updates internal pending map

Late decisions (UI sends after timeout fired) are logged and ignored.

### Pending request map

```typescript
pendingByRequestId: Map<string, {
  event: RuntimeEvent;
  timer: ReturnType<typeof setTimeout>;
  socket: net.Socket;
}>
```

`sendDecision(eventId, decision)`:
- Validates request exists and is still pending
- Cancels timeout timer
- Sends `HookResultEnvelope` via socket
- Removes from map

---

## 4. Controller Layer

### Location: `source/hooks/hookController.ts`

Evolves from current `eventHandlers.ts`. Receives `RuntimeEvent`s, returns `ControllerResult`s with typed `RuntimeIntent`s. Owns all UI-decision logic. **No transport/protocol imports.**

```typescript
export type ControllerCallbacks = {
  getRules: () => HookRule[];
  enqueuePermission: (eventId: string) => void;
  enqueueQuestion: (eventId: string) => void;
  setCurrentSessionId: (sessionId: string) => void;
  onTranscriptParsed: (eventId: string, summary: unknown) => void;
  signal?: AbortSignal;
};

export type ControllerResult =
  | { handled: true; decision?: RuntimeDecision }  // decided immediately (rule match)
  | { handled: false };                             // default path — adapter handles timeout
```

### Dispatch chain (same first-match-wins logic)

1. **PermissionRequest** — check rules → immediate allow/deny with `intent`, or enqueue for user
2. **AskUserQuestion** — enqueue for user (no immediate decision)
3. **SubagentStop** — no special handling beyond display (handled: false)
4. **Session tracking** — side effects (capture sessionId, parse transcript on SessionEnd)
5. **Default** — `{ handled: false }` → adapter's timeout auto-passthroughs

### Key change from `eventHandlers.ts`

- Takes `RuntimeEvent`, not `HandlerContext`
- Returns `ControllerResult` with `RuntimeDecision`/`RuntimeIntent`, not calling `respond()` directly
- No imports from `types/hooks/` — string matching on `hookName`/`toolName`
- Intent shapes like `{ kind: 'permission_allow' }` are pure semantic; adapter's `decisionMapper` translates

---

## 5. UI Integration

### `source/hooks/useRuntime.ts`

React hook that wraps the `Runtime` interface and bridges to existing UI state.

**Contract**: `runtime` must be memoized/stable. `useRuntime` assumes it does not change between renders.

### Responsibilities

- Call `runtime.start()` on mount, `runtime.stop()` on unmount
- Subscribe to events via `runtime.onEvent()`
- For each event: run controller → if immediate decision, call `runtime.sendDecision()` → map to `HookEventDisplay` → append to state
- Expose `resolvePermission(id, decision)` and `resolveQuestion(id, answers)` that:
  1. Construct a `RuntimeDecision` with appropriate `RuntimeIntent`
  2. Call `runtime.sendDecision(id, decision)`
  3. **Update the existing display event** (by id) with new status — not append a new entry
- Sync `status` from `runtime.getStatus()` after start/stop

### `source/hooks/mapToDisplay.ts`

Thin mapper: `RuntimeEvent → HookEventDisplay`

- `hookName` → `string` (update `HookEventDisplay.hookName` from `HookEventName` closed union to `string`)
- `payload` → pass through as `unknown` (update `HookEventDisplay.payload` from `ClaudeHookEvent` to `unknown`)
- `status` → `'pending'` initially
- Copy `toolName`, `toolUseId` directly
- **Do not** force unknown hookNames into a closed enum. Keep raw string.

### `HookEventDisplay` type changes

```typescript
// Before
hookName: HookEventName;          // closed union
payload: ClaudeHookEvent;         // Claude-specific
result?: HookResultPayload;       // transport type

// After
hookName: string;                  // open string
payload: unknown;                  // opaque
result?: unknown;                  // opaque (or remove entirely)
```

### UI component changes

Components currently use `isPreToolUseEvent(payload)` type guards → switch to `event.hookName === 'PreToolUse'` string matching. Components that deep-access payload fields continue to do so with casts — this is acceptable as a temporary bridge. A follow-up task ("tool renderers take ownership of shape extraction") will clean this up.

---

## 6. Mock Adapter

### Location: `source/runtime/adapters/mock/`

```
source/runtime/adapters/mock/
├── index.ts           # exports createMockRuntime, createInjectableMockRuntime
├── scriptedReplay.ts  # phase 1: emit events on timers
└── injectable.ts      # phase 2: programmatic emit + decision capture
```

### Phase 1: Scripted replay

`createMockRuntime(script: MockScript): Runtime`

```typescript
type MockScriptEntry = {
  delayMs: number;
  event: Partial<RuntimeEvent>;    // fillDefaults() supplies context, interaction, id, timestamp
  awaitDecisionForId?: string;     // pause script until this event gets a decision
};
```

- `fillDefaults()` always provides `context`, `interaction`, `id`, `timestamp` so partial events never trip null/undefined
- `sendDecision()` stores decisions for inspection
- Optionally pauses script until a decision arrives (for testing permission flows)

### Phase 2: Injectable (for tests)

`createInjectableMockRuntime(): InjectableMockRuntime`

Extends `Runtime` with:
- `emit(event: RuntimeEvent)` — push event to subscribers
- `getDecisions()` — return all decisions received
- `getDecision(eventId)` — return decision for specific event

Used in vitest tests for deterministic controller/UI testing.

---

## 7. Boundary Enforcement

### Primary: ESLint `no-restricted-imports`

UI files (`source/components/**`, `source/hooks/**`, `source/context/**`) cannot import from:
- `source/runtime/adapters/claudeHooks/` (adapter internals)
- `source/types/hooks/envelope` (wire protocol)
- `source/types/hooks/result` (transport actions)
- `source/types/hooks/events` (Claude event union + type guards)

### Secondary: vitest boundary test

`source/runtime/__tests__/boundary.test.ts`

Path-based check: glob all `.ts`/`.tsx` files in UI directories, grep for import paths matching adapter/protocol modules. Fail if any found. Type-name grep as secondary backup.

### Enforcement timing

Added **immediately after** the runtime is wired in (step 6 of migration), **before** breaking old imports. This prevents re-introduction during the refactoring pass.

---

## 8. Migration Strategy

Incremental steps — app compiles at every step:

| Step | Action | Risk |
|------|--------|------|
| 1 | Create `source/runtime/types.ts` — boundary types only | None (new file) |
| 2 | Create `source/runtime/adapters/claudeHooks/` — adapter implementing `Runtime` | None (new files, imports existing protocol types) |
| 3 | Create `source/hooks/mapToDisplay.ts` — thin RuntimeEvent → HookEventDisplay mapper | None (new file) |
| 4 | Create `source/hooks/hookController.ts` — rewrite eventHandlers to accept RuntimeEvent, return ControllerResult with RuntimeIntent | Low (new file, old file still exists) |
| 5 | Create `source/hooks/useRuntime.ts` — new hook wrapping Runtime | None (new file) |
| 6 | Update `source/context/HookContext.tsx` — swap useHookServer for useRuntime(createClaudeHookRuntime(...)) | **Medium** (integration point — app now uses runtime) |
| 7 | **Add boundary enforcement** — ESLint rules + vitest boundary test | None (catches violations) |
| 8 | Update `HookEventDisplay` — change `payload` to `unknown`, `hookName` to `string`, `result` to `unknown` | Medium (type errors surface) |
| 9 | Update UI components — remove type guard imports, switch to string matching + casts | Medium (many files touched, but mechanical) |
| 10 | Create mock adapter (scripted replay + injectable) | None (new files) |
| 11 | Remove dead code — unused protocol imports, old `useHookServer` if fully replaced, old `eventHandlers.ts` | Low (cleanup) |

**Critical invariant**: after step 6, the app behaves identically to before. Steps 7-9 are the "break old imports" pass with enforcement already in place. Step 8 is done incrementally — change types first with `as unknown` casts, then clean up component by component.

---

## 9. Follow-Up Tasks (Out of Scope)

- **Tool renderers**: dedicated modules that extract display data from opaque payloads, replacing ad-hoc casts in UI components
- **Feed model**: proper `FeedItem` type replacing `HookEventDisplay`, with richer status tracking
- **"No opinion" semantics**: use `RuntimeDecision.source: 'timeout'` to distinguish auto-passthrough from explicit allow in PreToolUse handling
- **`updatedPermissions` support**: adapter sends upstream permission persistence to Claude Code (currently only local HookRules)

---

## 10. Definition of Done

1. Ink UI has **zero** imports of `HookEventEnvelope`, `HookResultEnvelope`, `HookResultPayload`, `ClaudeHookEvent`, or Claude type guards
2. Claude hook protocol is isolated to `source/runtime/adapters/claudeHooks/`
3. UI still behaves identically (permission prompts, passthrough, hook displays)
4. Mock adapter exists and runs without Claude Code
5. Boundary enforcement (ESLint + vitest test) prevents regression
6. `RuntimeDecision.source` distinguishes user/timeout/rule provenance
