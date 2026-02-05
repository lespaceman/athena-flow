# Simplify Debug Mode and Event Merging

## Problem

Two areas of unnecessary complexity:

1. **Debug flag creates branching code paths.** `HookEvent.tsx` has `!debug` checks on every event type, bypassing all specialized components in favor of raw JSON. `useContentOrdering.ts` has 3 debug conditionals that change filtering logic. The debug flag is threaded through 6 files affecting rendering, content ordering, and process management.

2. **Pre/Post tool merging mutates the data model.** PostToolUse events silently disappear into their matching PreToolUse via `setEvents(prev => prev.map(...))`. This adds 7 optional fields to `HookEventDisplay` (`postToolPayload`, `postToolFailed`, `postToolTimestamp`, `postToolRequestId`, `subagentStopPayload`, `subagentStopRequestId`, `subagentStopTimestamp`). PostToolUse events are invisible even in debug mode.

## Design

### Data Model: Linked Events, No Merging

Remove all merge fields from `HookEventDisplay`:

```typescript
// REMOVE these fields:
postToolPayload?: PostToolUseEvent | PostToolUseFailureEvent;
postToolRequestId?: string;
postToolTimestamp?: Date;
postToolFailed?: boolean;
subagentStopPayload?: SubagentStopEvent;
subagentStopRequestId?: string;
subagentStopTimestamp?: Date;
```

Every hook event is a standalone entry in the `events` array. Linking uses identifiers already present in payloads:

- **PreToolUse <-> PostToolUse** — linked by `tool_use_id`
- **SubagentStart <-> SubagentStop** — linked by `agent_id`

`transcriptSummary` moves to the SubagentStop event (it has the transcript path).

### Hook Server: Remove Merge Handlers

**Delete entirely:**

- `handlePostToolUseMerge()` — PostToolUse falls through to default `addEvent()` + `storeWithAutoPassthrough()`
- `findMatchingPreToolUse()` helper
- `findMatchingSubagentStart()` helper

**Simplify `handleSubagentStopMerge()` -> `handleSubagentStop()`:**

- Just `addEvent()` + `storeWithAutoPassthrough()`
- Parse transcript and update the SubagentStop event itself (not a merged parent)

The dispatch chain drops from 6 specialized handlers to 5, with no cross-event mutation remaining.

### Rendering: Single Path with Verbose Prop

Rename `--debug` to `--verbose`. Remove all `!debug` guards in `HookEvent.tsx`.

Always route to specialized components. Each accepts `verbose?: boolean` for additive detail:

```tsx
// HookEvent.tsx — NO branching on verbose
if (isPreToolUseEvent(payload) && payload.tool_name === 'AskUserQuestion') {
	return <AskUserQuestionEvent event={event} verbose={verbose} />;
}
if (isPreToolUseEvent(payload) || isPermissionRequestEvent(payload)) {
	return <ToolCallEvent event={event} verbose={verbose} />;
}
if (isPostToolUseEvent(payload) || isPostToolUseFailureEvent(payload)) {
	return <ToolResultEvent event={event} verbose={verbose} />;
}
if (isSubagentStartEvent(payload)) {
	return (
		<SubagentEvent
			event={event}
			verbose={verbose}
			childEventsByAgent={childEventsByAgent}
		/>
	);
}
if (isSubagentStopEvent(payload)) {
	return <SubagentStopEvent event={event} verbose={verbose} />;
}
// GenericHookEvent — only for truly unrecognized event types
return <GenericHookEvent event={event} verbose={verbose} />;
```

What verbose adds (additive, not a different code path):

- **ToolCallEvent**: appends full input JSON below the summary
- **ToolResultEvent (new)**: normal shows compact "check Bash completed (1.2s)". Verbose adds tool output payload.
- **SubagentEvent**: appends agent payload details
- **GenericHookEvent**: shows full JSON payload (same as current debug behavior, but only for unrecognized events)

### Content Ordering: No Verbose Parameter

Remove `debug` parameter from `useContentOrdering`. One unconditional path:

- **SessionEnd** — always convert to synthetic assistant messages
- **TodoWrite** — always exclude from timeline, always render as sticky bottom widget
- **PostToolUse** — flows through as regular timeline items (previously invisible)
- **SubagentStop** — flows through as regular timeline items (previously merged)

**isStableContent updates:**

| Event         | Current                                             | After                                                         |
| ------------- | --------------------------------------------------- | ------------------------------------------------------------- |
| PreToolUse    | Stable when blocked OR `postToolPayload` exists     | Stable when `status !== 'pending'`                            |
| PostToolUse   | N/A (merged)                                        | Always stable (auto-passthrough)                              |
| SubagentStart | Stable when blocked OR `subagentStopPayload` exists | Stable when blocked OR matching SubagentStop exists in events |
| SubagentStop  | N/A (merged)                                        | Stable when `status !== 'pending'`                            |

Active subagent detection changes from checking `!e.subagentStopPayload` to checking whether a SubagentStop event with matching `agent_id` exists. Built as a `Set<string>` alongside `childEventsByAgent`.

### Verbose Flag Scope

After changes, verbose is checked in only 3 places:

| File                  | What it controls                                            |
| --------------------- | ----------------------------------------------------------- |
| `app.tsx`             | Server status bar display, streaming response display       |
| `HookEvent.tsx`       | Passes `verbose` to child components                        |
| `useClaudeProcess.ts` | jq filter for streaming text (needed for streaming display) |

Removed from: `useContentOrdering.ts`, `GenericHookEvent.tsx` (no longer the debug fallback).

## New Components

- **ToolResultEvent** — renders PostToolUse/PostToolUseFailure as compact completion indicator (normal) or with full output (verbose)
- **SubagentStopEvent** — renders SubagentStop with transcript summary

## Removed Code

- `handlePostToolUseMerge()` in useHookServer.ts
- `findMatchingPreToolUse()` in useHookServer.ts
- `findMatchingSubagentStart()` in useHookServer.ts
- `OrphanPostToolUseEvent` component (no more orphans — all PostToolUse events are first-class)
- 7 optional merge fields from `HookEventDisplay` type
- All `!debug` guards in `HookEvent.tsx`
- `debug` parameter from `useContentOrdering`
