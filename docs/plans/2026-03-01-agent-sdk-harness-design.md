# Agent SDK Harness Design

## Overview

Add the Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) as a new harness alongside the existing Claude Code harness. The Agent SDK runs as an in-process library inside a Worker thread, with hook callbacks bridged to athena's `RuntimeEvent`/`RuntimeDecision` pipeline via `MessagePort`.

## Design Decisions

| Decision             | Choice                    | Rationale                                                                 |
| -------------------- | ------------------------- | ------------------------------------------------------------------------- |
| SDK integration mode | In-process library        | Richer data, no IPC overhead, programmatic hooks                          |
| Event source         | Hooks-first               | SDK hooks map 1:1 to RuntimeEventKind; preserves existing feed/controller |
| Decision model       | Same RuntimeDecision flow | Hook callbacks await Promise; controller/user resolves via sendDecision() |
| Process isolation    | Worker thread             | Prevents SDK from blocking Ink's main thread rendering                    |

## Architecture

### Communication Flow

```
Main Thread (Ink)                    Worker Thread
─────────────────                    ─────────────
RuntimeProvider                      query() async iterator
  └─ server.ts                         └─ SDK hook callbacks
      ├─ onEvent → feed/controller         ├─ PreToolUse → post hook_event
      ├─ sendDecision → post decision      ├─ PostToolUse → post hook_event
      └─ MessagePort ◄──────────────────── ├─ Stop → post hook_event
              │                            └─ ... etc
              └─────────────────────────►  await decision response
```

### Worker Protocol (MessagePort)

```typescript
/** Main thread → Worker */
type WorkerRequest =
	| {
			type: 'start';
			options: SerializedAgentOptions;
			prompt: string;
			sessionId?: string;
	  }
	| {type: 'decision'; requestId: string; decision: RuntimeDecision}
	| {type: 'abort'};

/** Worker → Main thread */
type WorkerResponse =
	| {
			type: 'hook_event';
			requestId: string;
			hookName: string;
			hookInput: Record<string, unknown>;
	  }
	| {type: 'sdk_message'; message: SerializedSDKMessage}
	| {type: 'ready'}
	| {type: 'done'; result?: SerializedResultMessage}
	| {type: 'error'; error: string};
```

### Decision Flow (for events requiring interaction)

1. Worker: SDK fires PreToolUse hook callback
2. Worker: Generates requestId, posts `hook_event` to main thread, creates pending Promise
3. Main: `server.ts` receives message, translates to `RuntimeEvent` (with `expectsDecision: true`)
4. Main: Emits to handlers → feed/controller evaluate rules
5. Main: Controller/user/timeout produces `RuntimeDecision`
6. Main: `sendDecision()` posts `{ type: 'decision', requestId, decision }` to Worker
7. Worker: Resolves pending Promise with decision
8. Worker: Hook callback returns translated `HookJSONOutput` (allow/deny/etc.)
9. Worker: SDK continues execution

## File Structure

```
src/harnesses/agent-sdk/
├── config/
│   ├── optionsBuilder.ts           # Builds ClaudeAgentOptions from HarnessProcessConfig
│   └── optionsBuilder.test.ts
├── process/
│   ├── spawn.ts                    # Creates Worker, manages lifecycle
│   ├── useProcess.ts               # React hook: spawn/kill/interrupt/tokenUsage
│   ├── tokenAccumulator.ts         # Extracts TokenUsage from SDKResultMessage
│   ├── tokenAccumulator.test.ts
│   └── types.ts                    # SpawnAgentSdkOptions
├── protocol/
│   ├── messages.ts                 # SDKMessage type re-exports + discriminators
│   ├── hookInput.ts                # Hook callback input types
│   └── workerMessages.ts           # WorkerRequest / WorkerResponse types
├── runtime/
│   ├── index.ts                    # createAgentSdkRuntime() factory
│   ├── server.ts                   # RuntimeConnector backed by MessagePort
│   ├── worker.ts                   # Worker entry: runs query(), wires hooks
│   ├── eventTranslator.ts          # SDK hook input → { kind, data, toolName, ... }
│   ├── decisionMapper.ts           # RuntimeDecision → HookJSONOutput
│   ├── interactionRules.ts         # RuntimeEventKind → InteractionHints
│   ├── mapper.ts                   # Combines translator + hints → RuntimeEvent
│   └── __tests__/
│       ├── eventTranslator.test.ts
│       ├── decisionMapper.test.ts
│       ├── server.test.ts
│       └── mapper.test.ts
└── system/
    └── detectSdk.ts                # Checks if SDK package is installed
```

## Event Translation

SDK hook events map directly to existing RuntimeEventKind:

| SDK Hook         | RuntimeEventKind |
| ---------------- | ---------------- |
| PreToolUse       | `tool.pre`       |
| PostToolUse      | `tool.post`      |
| Stop             | `stop.request`   |
| SessionStart     | `session.start`  |
| SessionEnd       | `session.end`    |
| SubagentStart    | `subagent.start` |
| SubagentStop     | `subagent.stop`  |
| UserPromptSubmit | `user.prompt`    |
| PreCompact       | `compact.pre`    |
| Notification     | `notification`   |

SDKMessage stream events (non-hook):

- `SDKSystemMessage` (init) → synthetic `session.start` with model/tools metadata
- `SDKResultMessage` (success/error) → synthetic `session.end` + token usage update

## Decision Mapping

RuntimeDecision → SDK HookJSONOutput:

| RuntimeDecision                   | HookJSONOutput                                                       |
| --------------------------------- | -------------------------------------------------------------------- |
| `type: 'passthrough'`             | `{}` (empty object = allow)                                          |
| `type: 'block'`                   | `{ hookSpecificOutput: { permissionDecision: 'deny', reason } }`     |
| `intent.kind: 'permission_allow'` | `{ hookSpecificOutput: { decision: { behavior: 'allow' } } }`        |
| `intent.kind: 'permission_deny'`  | `{ hookSpecificOutput: { decision: { behavior: 'deny', reason } } }` |
| `intent.kind: 'pre_tool_allow'`   | `{ hookSpecificOutput: { permissionDecision: 'allow' } }`            |
| `intent.kind: 'pre_tool_deny'`    | `{ hookSpecificOutput: { permissionDecision: 'deny', reason } }`     |

## Changes to Existing Files

1. **`src/infra/plugins/config.ts`** — Add `'agent-sdk'` to `AthenaHarness` type union
2. **`src/harnesses/registry.ts`** — Add Agent SDK capability entry with `detectSdk()` verifier
3. **`src/app/runtime/createRuntime.ts`** — Add `'agent-sdk'` case calling `createAgentSdkRuntime()`
4. **`src/harnesses/configProfiles.ts`** — Add Agent SDK config profile (model resolution, options)
5. **`src/harnesses/processProfiles.ts`** — Add Agent SDK process profile (Worker-based spawn)
6. **`tsup.config.ts`** — Add `src/harnesses/agent-sdk/runtime/worker.ts` as entry point

## What Stays Unchanged

- `src/core/` — feed system, controller, workflows (all consume RuntimeEvent)
- `src/ui/` — all components read from HookContext (harness-agnostic)
- `src/app/providers/` — RuntimeProvider accepts runtimeFactory, useFeed subscribes to runtime.onEvent()
- `src/harnesses/mock/` — mock runtime for tests

## Worker Thread Lifecycle

### Startup

1. `useProcess` hook calls `spawn()` → creates `new Worker('./worker.js')`
2. Worker posts `{ type: 'ready' }` when initialized
3. Main thread posts `{ type: 'start', options, prompt }` to begin execution

### Running

1. Worker iterates `query()` async generator
2. Hook callbacks post events, await decisions
3. SDK messages forwarded for session tracking

### Shutdown

- **Graceful:** `sendInterrupt()` → posts `{ type: 'abort' }` → AbortController.abort() → query() terminates → Worker posts `{ type: 'done' }`
- **Forceful:** `kill()` → `Worker.terminate()` (immediate)

### Error Recovery

- Worker `'error'` event → set isRunning=false, log error
- Worker `'exit'` event → cleanup, update token usage from last known state

## Testing Strategy

- Unit tests: eventTranslator, decisionMapper, mapper (pure functions, no Worker needed)
- Integration tests: server.ts with mock MessagePort (simulates Worker messages)
- Process tests: useProcess hook with mock Worker
- End-to-end: mock runtime (injectable) for UI component tests (unchanged)

## Dependencies

- `@anthropic-ai/claude-agent-sdk` — peer dependency (optional, only needed when harness='agent-sdk')
- `node:worker_threads` — built-in Node.js module
