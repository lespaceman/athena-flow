# SubagentStop Result Display Fix

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Display the actual subagent result in the SubagentStop event by using PostToolUse(Task) data instead of fragile transcript parsing.

**Architecture:** Currently, SubagentStop parses the subagent transcript file (async) to extract `lastAssistantText`, while PostToolUse(Task) — which carries the actual result from Claude Code — is excluded from the render stream. The fix replaces transcript parsing with direct use of PostToolUse(Task) for result display, matching the PreToolUse→PostToolUse pattern used by every other tool. SubagentStop becomes a header-only lifecycle marker.

**Tech Stack:** React/Ink, TypeScript, Vitest

---

## Summary of Changes

1. **Un-exclude PostToolUse(Task)** from the content stream so it renders via PostToolResult
2. **Remove transcript parsing** from `handleSubagentStop` — simplify to immediate event add
3. **Simplify SubagentStopEvent** to header-only (no body/transcript rendering)
4. **Clean up** unused transcript-related code in SubagentStop path

The PostToolUse(Task) `tool_response` has structure: `{status, content: [{type: "text", text: "..."}], agentId, totalTokens, ...}`. The existing `extractTask` extractor already handles this via `extractTextContent(response)` → recursion into `response.content` array.

---

### Task 1: Write failing test for PostToolUse(Task) appearing in content stream

**Files:**

- Modify: `source/hooks/useContentOrdering.test.ts`

**Step 1: Write the failing test**

Add a test that verifies PostToolUse(Task) events are NOT excluded from the main stream:

```typescript
it('includes PostToolUse for Task in main stream', () => {
	const postToolUseTask = makeHookEvent({
		hookName: 'PostToolUse',
		toolName: 'Task',
		payload: {
			hook_event_name: 'PostToolUse',
			tool_name: 'Task',
			tool_input: {prompt: 'do something', subagent_type: 'Explore'},
			tool_response: {
				status: 'completed',
				content: [{type: 'text', text: 'result'}],
			},
		},
	});

	const {stableItems} = useContentOrderingHelper({
		events: [postToolUseTask],
	});

	const hookItems = stableItems.filter(i => i.type === 'hook');
	expect(hookItems).toHaveLength(1);
	expect(hookItems[0]!.data).toBe(postToolUseTask);
});
```

Use existing test helpers (`makeHookEvent`, `useContentOrderingHelper`) from the test file. Adapt the payload shape to match existing patterns in the test.

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/hooks/useContentOrdering.test.ts`
Expected: FAIL — PostToolUse(Task) is currently excluded by `shouldExcludeFromMainStream`

**Step 3: Fix `shouldExcludeFromMainStream` in `useContentOrdering.ts`**

Remove the PostToolUse(Task) exclusion (line 42-43):

```typescript
// REMOVE these lines:
// if (event.hookName === 'PostToolUse' && event.toolName === 'Task')
//   return true;
```

Also remove the comment referencing "content already shown in SubagentStop".

**Step 4: Run test to verify it passes**

Run: `npx vitest run source/hooks/useContentOrdering.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add source/hooks/useContentOrdering.ts source/hooks/useContentOrdering.test.ts
git commit -m "feat: un-exclude PostToolUse(Task) from content stream"
```

---

### Task 2: Write failing test for SubagentStop handler — no transcript parsing

**Files:**

- Modify: `source/hooks/eventHandlers.ts` (tests are inline or in a separate test file)

**Step 1: Find existing `handleSubagentStop` tests**

Check for test files: `source/hooks/eventHandlers.test.ts` or similar. If tests exist, add to them. If not, create the test file.

Write a test verifying that `handleSubagentStop` calls `addEvent` immediately (not after async transcript parsing):

```typescript
it('adds SubagentStop event synchronously without transcript parsing', () => {
	const addEvent = vi.fn();
	const ctx = makeHandlerContext({
		hook_event_name: 'SubagentStop',
		agent_id: 'a123',
		agent_type: 'Explore',
		agent_transcript_path: '/some/path.jsonl',
	});

	const handled = handleSubagentStop(ctx, {
		...mockCallbacks,
		addEvent,
	});

	expect(handled).toBe(true);
	// Event should be added synchronously, not after async parse
	expect(addEvent).toHaveBeenCalledTimes(1);
	expect(addEvent).toHaveBeenCalledWith(ctx.displayEvent);
});
```

**Step 2: Run test to verify it fails**

Expected: FAIL — current code adds event in `.then()` callback (async), not synchronously

**Step 3: Simplify `handleSubagentStop` in `eventHandlers.ts`**

Replace the async transcript parsing with immediate event add:

```typescript
export function handleSubagentStop(
	ctx: HandlerContext,
	cb: HandlerCallbacks,
): boolean {
	const {envelope, displayEvent} = ctx;
	if (!isSubagentStopEvent(envelope.payload)) return false;

	cb.storeWithAutoPassthrough(ctx);
	cb.addEvent(displayEvent);
	return true;
}
```

Remove the `parseTranscriptFile` import if no longer used by other handlers in this file (it's still used by `handleSessionTracking`).

**Step 4: Run test to verify it passes**

Run: `npx vitest run source/hooks/eventHandlers.test.ts` (or wherever the test lives)
Expected: PASS

**Step 5: Commit**

```bash
git add source/hooks/eventHandlers.ts source/hooks/eventHandlers.test.ts
git commit -m "refactor: remove transcript parsing from SubagentStop handler"
```

---

### Task 3: Simplify SubagentStopEvent to header-only

**Files:**

- Modify: `source/components/SubagentStopEvent.tsx`

**Step 1: Write/update test for SubagentStopEvent**

If component tests exist, update them. Otherwise verify manually. The component should render only the header, no body:

```typescript
it('renders header only without transcript body', () => {
  const event = makeSubagentStopEvent({agent_type: 'Explore'});
  const {lastFrame} = render(<SubagentStopEvent event={event} />);
  expect(lastFrame()).toContain('Explore — Done');
  expect(lastFrame()).not.toContain('Loading');
});
```

**Step 2: Simplify the component**

Remove transcript body rendering, loading state, MarkdownText, ToolResultContainer imports:

```tsx
import React from 'react';
import {Box, Text} from 'ink';
import {
	type HookEventDisplay,
	isSubagentStopEvent,
} from '../types/hooks/index.js';
import {useTheme} from '../theme/index.js';
import {truncateLine} from '../utils/truncate.js';

export default function SubagentStopEvent({
	event,
}: {
	event: HookEventDisplay;
}): React.ReactNode {
	const theme = useTheme();
	if (!isSubagentStopEvent(event.payload)) return null;

	const terminalWidth = process.stdout.columns ?? 80;
	const headerText = truncateLine(
		`${event.payload.agent_type} — Done`,
		terminalWidth - 4,
	);

	return (
		<Box marginTop={1}>
			<Text color={theme.accentSecondary} bold>
				● {headerText}
			</Text>
		</Box>
	);
}
```

**Step 3: Run tests and lint**

Run: `npm test && npm run lint`
Expected: PASS

**Step 4: Commit**

```bash
git add source/components/SubagentStopEvent.tsx
git commit -m "refactor: simplify SubagentStopEvent to header-only marker"
```

---

### Task 4: Remove `onTranscriptParsed` callback from SubagentStop path (cleanup)

**Files:**

- Modify: `source/hooks/eventHandlers.ts` — verify `onTranscriptParsed` is only used by `handleSessionTracking`
- Modify: `source/types/hooks/display.ts` — `transcriptSummary` field is still needed for SessionEnd

**Step 1: Verify no dead code**

Check that `parseTranscriptFile` is still imported (used by `handleSessionTracking`). Check that `onTranscriptParsed` callback is still needed (used by `handleSessionTracking`). If both are still used, no cleanup needed here — just verify.

**Step 2: Update plan doc**

Replace `docs/plans/2026-02-16-subagent-rendering-design.md` with updated design notes reflecting the new architecture: SubagentStop is header-only, PostToolUse(Task) renders the result.

**Step 3: Run full test suite and lint**

Run: `npm test && npm run lint`
Expected: PASS

**Step 4: Commit**

```bash
git add docs/plans/
git commit -m "docs: update subagent rendering plan for PostToolUse(Task) result display"
```

---

### Task 5: Build and manual smoke test

**Step 1: Build**

Run: `npm run build`
Expected: Clean build, no errors

**Step 2: Manual verification**

Start athena-cli and trigger a subagent run. Verify:

- SubagentStop shows `● AgentType — Done` (header only)
- PostToolUse(Task) renders below with `⎿ [actual result text]`
- No duplicate content between SubagentStop and PostToolUse(Task)
- Child events from the subagent still appear between SubagentStart and SubagentStop

---

## Architecture After Change

```
● Explore (count .ts files)          ← TaskAgentEvent (PreToolUse Task)
  ⎿ [prompt text]
▸ Explore                            ← SubagentStartEvent
  ● Glob(source/hooks/**/*.ts)       ← child PreToolUse
  ⎿ [glob results]                   ← child PostToolUse
● Explore — Done                     ← SubagentResultEvent (PostToolUse Task)
⎿ There are 23 .ts files...           (combined: header + result in one Static item)
```

SubagentStop is excluded from the content stream. SubagentResultEvent combines
the "Done" header with the PostToolUse(Task) result body in a single Static item,
ensuring no visual gap. SubagentStopEvent.tsx has been removed.
