# Feed UI Refinement Design

**Date**: 2026-02-18
**Status**: Approved

## Problem Statement

The feed UI has three critical issues and two feature gaps:

1. **Permission dialog race condition**: React state batching causes `permissionQueue` and `feedEvents` to update in separate renders. `currentPermissionRequest` derives from both via `useMemo` — if `feedEvents` is stale when `permissionQueue` updates, the dialog doesn't render until the next frame. In heavy render paths, this can cause the 300s timeout to expire before the dialog appears.

2. **Stop event noise**: Stop events have `expectsDecision: true` with a 4s timeout, creating noisy `stop.decision: timeout` events on every agent stop. The hookController doesn't handle Stop events, so 100% of them auto-passthrough.

3. **Subagent.stop filtered**: `shouldExcludeFromFeed()` hides all `subagent.stop` events, making subagent lifecycle invisible in the feed.

4. **No agent final message**: The Stop hook payload doesn't include the agent's response text. The only way to surface it is transcript parsing, which currently only happens on SessionEnd.

5. **Feed noise**: `stop.decision`, `setup`, `compact.pre` events add visual noise without user value.

## Design

### A. Permission Queue — `PermissionQueueItem[]`

**Principle**: Queue = dialog lifecycle source of truth. Feed = audit log.

Replace `permissionQueue: string[]` with `permissionQueue: PermissionQueueItem[]`:

```typescript
type PermissionQueueItem = {
  request_id: string;       // RuntimeEvent.id (for sendDecision)
  ts: number;
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_use_id?: string;
  suggestions?: unknown;    // permission_suggestions from payload
};
```

- `enqueuePermission(event: RuntimeEvent)` extracts a snapshot → pushes `PermissionQueueItem`
- `currentPermissionRequest` reads `permissionQueue[0]` directly — **no feed lookup**
- `resolvePermission` uses `request_id` to call `runtime.sendDecision()`
- Feed keeps causality via `hook_request_id` on `permission.decision` events
- Auto-dequeue on `permission.decision` matches via `hook_request_id`
- Components never import runtime types — `PermissionQueueItem` is a semantic UI type

**Files changed**:
- `source/hooks/useFeed.ts`: Queue type, enqueue logic, remove feed-lookup memoization
- `source/hooks/hookController.ts`: `enqueuePermission` callback signature change
- `source/app.tsx`: PermissionDialog reads from queue item, not FeedEvent
- `source/components/PermissionDialog.tsx`: Accept `PermissionQueueItem` prop

### B. Stop Noise Removal — Kill at Source

**Principle**: If no decision is expected, don't create decision infrastructure.

- `interactionRules.ts`: `Stop` → `expectsDecision: false`, remove timeout
- Adapter (`server.ts`): No timer scheduled when `expectsDecision: false`
- Mapper (`feed/mapper.ts`): Guard `mapDecision()` — don't emit `stop.decision` when no decision is expected
- Keep `stop.request` as informational event in feed (level: `info`, not `warn`)

**Files changed**:
- `source/runtime/adapters/claudeHooks/interactionRules.ts`: Stop config
- `source/runtime/adapters/claudeHooks/server.ts`: Guard timeout scheduling
- `source/feed/mapper.ts`: Guard stop.decision emission

### C. Subagent.stop Visible — Honest Rendering

**Principle**: Show what's actually in the payload. Don't fabricate results.

- Remove `subagent.stop` from `shouldExcludeFromFeed()`
- New renderer `SubagentStopEvent`: `⏹ AgentType done` + agent_id
- Expandable: shows transcript path (if present), stop_hook_active, full metadata
- No fake "result" excerpt — only surface data that exists in the payload

**Files changed**:
- `source/feed/filter.ts`: Remove subagent.stop exclusion
- `source/components/HookEvent.tsx`: Route `subagent.stop` to new renderer
- New: `source/components/SubagentStopEvent.tsx` (or inline in HookEvent)

### D. Agent Final Message — Async Enrichment in useFeed

**Principle**: Mapper stays sync. Enrichment (I/O) lives in useFeed.

New feed event kind: `agent.message`

```typescript
// In feed/types.ts
type AgentMessageData = {
  message: string;         // The agent's final response text
  source: 'transcript';   // Where the message came from
  scope: 'root' | 'subagent';
};
```

Flow:
1. Mapper emits `stop.request` (sync, immediate)
2. `useFeed` detects new `stop.request` in feed → schedules async `parseTranscriptTail(transcriptPath)`
3. Tail-read: last 64–256KB of transcript JSONL, scan backwards for last `role: assistant` block
4. On success: append `agent.message` event with:
   - `cause.parent_event_id` = stop.request event_id
   - `actor_id` = `agent:root`
   - `body` = extracted assistant text (truncated for display, expandable)
5. On failure: emit nothing (or debug-level event in verbose mode)
6. Cache: track last parsed offset per transcript path to skip redundant reads

**Files changed**:
- `source/feed/types.ts`: Add `agent.message` kind + `AgentMessageData`
- `source/feed/titleGen.ts`: Title for agent.message
- `source/hooks/useFeed.ts`: Async enrichment on stop.request
- New: `source/utils/parseTranscriptTail.ts` — tail-read + last-assistant extraction
- `source/components/HookEvent.tsx`: Route `agent.message` to renderer
- New: `source/components/AgentMessageEvent.tsx` — markdown-rendered message

### E. Subagent Transcript Excerpt (Option A)

Same pattern as D, but triggered by `subagent.stop` with `agent_transcript_path`:

1. `useFeed` detects `subagent.stop` with transcript path → schedules parse
2. Appends `agent.message` with `actor_id = subagent:<agent_id>`
3. `cause.parent_event_id` = subagent.stop event_id
4. Concurrency limit: max 2 concurrent transcript parses (subagents can end in bursts)

**Files changed**: Same as D (reuses `parseTranscriptTail` and `agent.message` kind)

### F. Feed Noise Cleanup

- Don't create `stop.decision` events (remove, don't filter)
- `stop.request` level: `info` (was `warn`)
- `setup` and `compact.pre`: collapsed by default (set `ui.collapsed_default: true`)
- `run.end`: always visible, never collapsed (summary anchor)
- Default collapse for `unknown.hook`: true

**Files changed**:
- `source/feed/mapper.ts`: stop.request level, collapse defaults
- `source/feed/mapper.ts`: Guard stop.decision creation

## Verification Checklist

- [ ] PermissionDialog renders correctly even when feed is empty/delayed
- [ ] Permission auto-dequeue still works via hook_request_id match
- [ ] No stop.decision timeout events appear in a typical run
- [ ] Subagent.stop rows render without throwing if transcript path is missing
- [ ] No new imports of runtime/protocol types in components
- [ ] Mapper remains pure/sync — no I/O in mapper
- [ ] Transcript parse failures don't crash or block the feed
- [ ] Concurrent subagent transcript parses are limited to 2
- [ ] agent.message events have correct actor_id attribution
- [ ] Feed events still append-only (no mutation of existing events)
