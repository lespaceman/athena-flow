# Native Loop Control Design

**Date**: 2026-02-25
**Status**: Approved

## Problem

Loop control currently depends on an external ralph-loop plugin installed from the marketplace. This plugin handles the Claude Code `Stop` hook, reads a state file, and decides whether to block the stop (continue looping) or allow it. This creates an unnecessary external dependency for a core orchestration feature. Athena already receives Stop events via the hook-forwarder — it should make the loop decision natively.

## Goals

1. Remove the external ralph-loop plugin dependency
2. Handle Stop hook decisions natively in athena's hookController
3. Introduce a hybrid tracker markdown — workflow author defines structure, Claude fills progress, athena reads to evaluate completion
4. Tie tracker lifecycle to the athena adapter session

## LoopConfig Changes

```typescript
export type LoopConfig = {
  enabled: boolean;
  completionMarker: string;    // string to scan for in tracker body
  maxIterations: number;
  continueMessage?: string;    // static message sent when blocking stop (default provided)
  trackerTemplate?: string;    // markdown template for the tracker file
};
```

**Renames**: `completionPromise` → `completionMarker` (clearer — it's a string scan, not a promise).

**New fields**: `trackerTemplate` (workflow author's markdown structure), `continueMessage` (optional override for the continue reason).

**Example workflow.json**:
```json
{
  "name": "e2e-testing",
  "plugins": ["e2e-test-builder@owner/repo"],
  "promptTemplate": "Use /add-e2e-tests {input}",
  "loop": {
    "enabled": true,
    "completionMarker": "E2E_COMPLETE",
    "maxIterations": 15,
    "trackerTemplate": "# E2E Test Progress\n\n## Criteria\n- [ ] All tests passing\n- [ ] Coverage threshold met\n\n## Status\n_pending_"
  }
}
```

## Tracker Markdown Lifecycle

### File Location

`{projectDir}/.athena/sessions/{athenaSessionId}/loop-tracker.md`

Session-scoped, in the project directory where Claude can easily access it, under `.athena/` (gitignored).

### Creation (session start)

When `useClaudeProcess.spawn()` is called with `workflow.loop.enabled`:

1. Generate tracker from `loop.trackerTemplate` (or a minimal default)
2. Prepend YAML frontmatter with runtime state:

```markdown
---
iteration: 0
max_iterations: 15
completion_marker: "E2E_COMPLETE"
active: true
started_at: "2026-02-25T10:00:00Z"
---
# E2E Test Progress

## Criteria
- [ ] All tests passing
- [ ] Coverage threshold met

## Status
_pending_
```

3. Write to the session directory

### Updates

- **Claude** updates the markdown body during execution (via Write/Edit tools)
- **Athena** only updates the YAML frontmatter `iteration` counter when it blocks a stop

### Cleanup

On process kill/exit, athena sets `active: false` in frontmatter or removes the tracker file. Replaces the old `removeLoopState()`.

## Stop Hook Decision Logic

### hookController Changes

`handleEvent()` gains a Stop event handler. Loop state is provided via new callbacks:

```typescript
export type ControllerCallbacks = {
  getRules: () => HookRule[];
  enqueuePermission: (event: RuntimeEvent) => void;
  enqueueQuestion: (eventId: string) => void;
  getLoopState?: () => LoopState | null;       // NEW
  updateLoopState?: (update: Partial<LoopState>) => void;  // NEW
  signal?: AbortSignal;
};

type LoopState = {
  active: boolean;
  iteration: number;
  maxIterations: number;
  completionMarker: string;
  continueMessage: string;
  trackerContent: string;   // raw markdown body (below frontmatter)
};
```

### Decision Flow

```
Stop event received
  │
  ├─ getLoopState() returns null? → {handled: false} (passthrough, no loop)
  │
  ├─ loopState.active === false? → {handled: false} (loop already ended)
  │
  ├─ iteration >= maxIterations? → updateLoopState({active: false})
  │                                 → {handled: false} (max reached, let Claude stop)
  │
  ├─ trackerContent contains completionMarker? → updateLoopState({active: false})
  │                                               → {handled: false} (complete!)
  │
  └─ Otherwise → updateLoopState({iteration: iteration + 1})
                  → {handled: true, decision: {
                       type: 'json',
                       source: 'rule',
                       intent: {kind: 'stop_block', reason: continueMessage}
                     }}
```

### New RuntimeIntent Variant

```typescript
export type RuntimeIntent =
  | {kind: 'permission_allow'}
  | {kind: 'permission_deny'; reason: string}
  | {kind: 'question_answer'; answers: Record<string, string>}
  | {kind: 'pre_tool_allow'}
  | {kind: 'pre_tool_deny'; reason: string}
  | {kind: 'stop_block'; reason: string};   // NEW
```

### decisionMapper Addition

```typescript
case 'stop_block':
  return {
    action: 'json_output',
    stdout_json: {
      decision: 'block',
      reason: intent.reason,
    },
  };
```

### stop_hook_active Guard

When `stop_hook_active` is `true` on the incoming Stop event, athena still proceeds with iteration/completion checks. The iteration counter accurately reflects total blocks. Combined with `maxIterations`, this prevents infinite loops.

## LoopManager

Pure utility (not a React hook) managing tracker state:

```typescript
// source/workflows/loopManager.ts

export type LoopManager = {
  isActive(): boolean;
  getState(): LoopState | null;
  evaluate(): LoopDecision;
  incrementIteration(): void;
  deactivate(): void;
  cleanup(): void;
};

type LoopDecision =
  | { action: 'continue'; reason: string }
  | { action: 'stop'; reason: string };

export function createLoopManager(
  trackerPath: string,
  config: LoopConfig,
): LoopManager;
```

Instantiated once when workflow starts. Its methods are passed as callbacks to hookController via `getLoopState` and `updateLoopState`.

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Tracker file deleted mid-loop | `getLoopState()` returns null → passthrough → Claude stops. Log warning. |
| Tracker file unreadable | Same as deleted — fail open, let Claude stop. |
| maxIterations reached | Deactivate loop, passthrough, log "max iterations reached". |
| Completion marker found | Deactivate loop, passthrough, log "completion marker found". |
| User kills process | `cleanup()` removes tracker file. |
| Session resume with stale tracker | Check if tracker exists with `active: true`. Re-initialize LoopManager if so. |
| No trackerTemplate in config | Default: `"# Loop Progress\n\n_In progress_"` |
| Multiple Stop events rapidly | LoopManager reads from disk each time. Sequential UDS processing prevents races. |

**Fail-safe principle**: Always fail open. If anything goes wrong reading/parsing the tracker, let Claude stop. Never risk an infinite loop.

## What Gets Removed

- `writeLoopState()` and `removeLoopState()` in `applyWorkflow.ts`
- `ralph-loop.local.md` file convention
- External ralph-loop plugin dependency from workflow `plugins` arrays
- `completionPromise` field (renamed to `completionMarker`)

## Code Changes Summary

### New Files

- **`source/workflows/loopManager.ts`**: `createLoopManager()` factory, tracker file I/O, YAML frontmatter parsing
- **`source/workflows/loopManager.test.ts`**: Unit tests

### Modified Files

- **`source/workflows/types.ts`**: Update `LoopConfig` (rename + new fields)
- **`source/runtime/types.ts`**: Add `stop_block` to `RuntimeIntent`
- **`source/hooks/hookController.ts`**: Add Stop event handler, new callbacks in `ControllerCallbacks`
- **`source/runtime/adapters/claudeHooks/decisionMapper.ts`**: Add `stop_block` case
- **`source/hooks/useClaudeProcess.ts`**: Replace `writeLoopState`/`removeLoopState` with `LoopManager` lifecycle
- **`source/workflows/applyWorkflow.ts`**: Remove `writeLoopState()` and `removeLoopState()`

### Removed

- Ralph-loop state file writing (`ralph-loop.local.md`)
