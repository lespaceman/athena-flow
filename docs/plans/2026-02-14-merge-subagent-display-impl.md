# Merge Subagent Display Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Merge the Task PreToolUse and SubagentStart into a single display entry so subagent launches show one combined header instead of two separate items.

**Architecture:** Filter Task PreToolUse events from the content stream in `shouldExcludeFromMainStream()`. Pair each SubagentStart with its spawning Task PreToolUse to extract the `description`. Attach it as `taskDescription` on `HookEventDisplay`. Render the combined header in `SubagentEvent`.

**Tech Stack:** React/Ink, vitest, ink-testing-library

---

### Task 1: Add `taskDescription` to HookEventDisplay

**Files:**

- Modify: `source/types/hooks/display.ts:23-48`

**Step 1: Add the field**

Add `taskDescription?: string` to `HookEventDisplay` after the `stopEvent` field:

```typescript
	/**
	 * For SubagentStart events: the description from the parent Task tool call.
	 * Extracted from the Task PreToolUse's tool_input.description.
	 */
	taskDescription?: string;
```

**Step 2: Commit**

```bash
git add source/types/hooks/display.ts
git commit -m "feat: add taskDescription field to HookEventDisplay"
```

---

### Task 2: Filter Task PreToolUse and pair with SubagentStart

**Files:**

- Modify: `source/hooks/useContentOrdering.ts:48-59` (shouldExcludeFromMainStream)
- Modify: `source/hooks/useContentOrdering.ts:278-298` (merge loop)
- Test: `source/hooks/useContentOrdering.test.ts`

**Step 1: Write the failing test — Task PreToolUse excluded**

Add test in the `useContentOrdering` describe block, near the existing "excludes PostToolUse for Task tool" test (~line 581):

```typescript
it('excludes PreToolUse for Task tool (merged into SubagentStart)', () => {
	const events = [
		makeEvent({
			id: 'task-pre',
			hookName: 'PreToolUse',
			toolName: 'Task',
			status: 'passthrough',
			timestamp: new Date(1000),
			payload: {
				session_id: 's1',
				transcript_path: '/tmp/t.jsonl',
				cwd: '/project',
				hook_event_name: 'PreToolUse',
				tool_name: 'Task',
				tool_input: {
					description: 'Add iPhone to cart',
					prompt: 'Navigate to apple.com...',
					subagent_type: 'web-testing-toolkit:browser-operator',
				},
			},
		}),
	];

	const {stableItems, dynamicItems} = callHook({
		messages: [],
		events,
	});

	const allItems = [...stableItems, ...dynamicItems];
	const taskPreToolUse = allItems.filter(
		i =>
			i.type === 'hook' &&
			i.data.hookName === 'PreToolUse' &&
			i.data.toolName === 'Task',
	);
	expect(taskPreToolUse).toHaveLength(0);
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/hooks/useContentOrdering.test.ts`
Expected: FAIL — Task PreToolUse is not yet excluded.

**Step 3: Add Task PreToolUse to shouldExcludeFromMainStream**

In `source/hooks/useContentOrdering.ts`, modify `shouldExcludeFromMainStream` (line ~48-59). Change the existing PostToolUse-only Task filter to cover both Pre and Post:

```typescript
function shouldExcludeFromMainStream(event: HookEventDisplay): boolean {
	if (event.hookName === 'SessionEnd') return true;
	if (event.hookName === 'SubagentStop') return true;
	if (
		(event.hookName === 'PreToolUse' || event.hookName === 'PostToolUse') &&
		event.toolName === 'Task'
	)
		return true;
	if (
		(event.hookName === 'PreToolUse' || event.hookName === 'PostToolUse') &&
		TASK_TOOL_NAMES.has(event.toolName ?? '')
	)
		return true;
	return false;
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run source/hooks/useContentOrdering.test.ts`
Expected: PASS

**Step 5: Write the failing test — taskDescription pairing**

```typescript
it('attaches taskDescription to SubagentStart from parent Task PreToolUse', () => {
	const events = [
		makeEvent({
			id: 'task-pre',
			hookName: 'PreToolUse',
			toolName: 'Task',
			status: 'passthrough',
			timestamp: new Date(1000),
			payload: {
				session_id: 's1',
				transcript_path: '/tmp/t.jsonl',
				cwd: '/project',
				hook_event_name: 'PreToolUse',
				tool_name: 'Task',
				tool_input: {
					description: 'Add iPhone to cart',
					prompt: 'Navigate to apple.com...',
					subagent_type: 'web-testing-toolkit:browser-operator',
				},
			},
		}),
		makeEvent({
			id: 'sub-start',
			hookName: 'SubagentStart',
			status: 'passthrough',
			timestamp: new Date(2000),
			payload: {
				session_id: 's1',
				transcript_path: '/tmp/t.jsonl',
				cwd: '/project',
				hook_event_name: 'SubagentStart',
				agent_id: 'afe0c79',
				agent_type: 'web-testing-toolkit:browser-operator',
			},
		}),
	];

	const {stableItems, dynamicItems} = callHook({
		messages: [],
		events,
	});

	const allItems = [...stableItems, ...dynamicItems];
	const subStart = allItems.find(
		i => i.type === 'hook' && i.data.hookName === 'SubagentStart',
	);
	expect(subStart).toBeDefined();
	expect(subStart!.type === 'hook' && subStart!.data.taskDescription).toBe(
		'Add iPhone to cart',
	);
});
```

**Step 6: Run test to verify it fails**

Run: `npx vitest run source/hooks/useContentOrdering.test.ts`
Expected: FAIL — taskDescription is undefined.

**Step 7: Implement the pairing logic**

In `useContentOrdering.ts`, after the existing SubagentStop merge loop (~line 280-298), add Task→SubagentStart pairing.

First, build a map of Task PreToolUse events (before the hookItems filter):

```typescript
// Build map of Task PreToolUse events for SubagentStart description pairing.
// Each Task PreToolUse spawns one SubagentStart. Match by subagent_type from
// tool_input matching agent_type on SubagentStart, in temporal order.
const taskPreToolUseEvents = events.filter(
	e =>
		e.hookName === 'PreToolUse' && e.toolName === 'Task' && !e.parentSubagentId,
);
```

Then in the existing merge loop (where `stopEvent` is merged onto SubagentStart items, ~line 280), add taskDescription pairing:

```typescript
// Track which Task PreToolUse events have been consumed for pairing
const consumedTaskPreIds = new Set<string>();

for (const item of hookItems) {
	if (item.type === 'hook') {
		// Existing toolUseId pairing...
		if (item.data.toolUseId) {
			const postEvent = postToolByUseId.get(item.data.toolUseId);
			if (postEvent) {
				item.data = {...item.data, postToolEvent: postEvent};
			}
		}
		// Existing SubagentStop merging...
		if (
			isSubagentStartEvent(item.data.payload) &&
			stoppedAgentIds.has(item.data.payload.agent_id)
		) {
			const stopEvent = stopEventsByAgent.get(item.data.payload.agent_id);
			if (stopEvent) {
				item.data = {...item.data, stopEvent};
			}
		}
		// NEW: Pair SubagentStart with Task PreToolUse to get description
		if (isSubagentStartEvent(item.data.payload)) {
			const agentType = item.data.payload.agent_type;
			const subTs = item.data.timestamp.getTime();
			const match = taskPreToolUseEvents.find(e => {
				if (consumedTaskPreIds.has(e.id)) return false;
				if (e.timestamp.getTime() > subTs) return false;
				if (!isPreToolUseEvent(e.payload)) return false;
				const input = e.payload.tool_input as Record<string, unknown>;
				return input.subagent_type === agentType;
			});
			if (match && isPreToolUseEvent(match.payload)) {
				consumedTaskPreIds.add(match.id);
				const input = match.payload.tool_input as Record<string, unknown>;
				const desc =
					typeof input.description === 'string' ? input.description : undefined;
				if (desc) {
					item.data = {...item.data, taskDescription: desc};
				}
			}
		}
	}
}
```

**Step 8: Run test to verify it passes**

Run: `npx vitest run source/hooks/useContentOrdering.test.ts`
Expected: PASS

**Step 9: Commit**

```bash
git add source/hooks/useContentOrdering.ts source/hooks/useContentOrdering.test.ts
git commit -m "feat: filter Task PreToolUse and pair description with SubagentStart"
```

---

### Task 3: Update SubagentEvent to display taskDescription

**Files:**

- Modify: `source/components/SubagentEvent.tsx`
- Modify: `source/components/HookEvent.test.tsx`

**Step 1: Write the failing test**

Add to `HookEvent.test.tsx`:

```typescript
	it('renders SubagentStart with taskDescription from parent Task', () => {
		const subagentPayload: SubagentStartEvent = {
			session_id: 'session-1',
			transcript_path: '/tmp/transcript.jsonl',
			cwd: '/project',
			hook_event_name: 'SubagentStart',
			agent_id: 'afe0c79',
			agent_type: 'web-testing-toolkit:browser-operator',
		};
		const event: HookEventDisplay = {
			id: 'sub-1',
			requestId: 'req-sub-1',
			timestamp: new Date('2024-01-15T10:30:45.000Z'),
			hookName: 'SubagentStart',
			payload: subagentPayload,
			status: 'passthrough',
			taskDescription: 'Add iPhone to cart',
		};
		const {lastFrame} = render(<HookEvent event={event} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('browser-operator');
		expect(frame).toContain('Add iPhone to cart');
	});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/components/HookEvent.test.tsx`
Expected: FAIL — description not rendered.

**Step 3: Update SubagentEvent to show taskDescription**

In `source/components/SubagentEvent.tsx`, modify the render to show description:

```tsx
export default function SubagentEvent({event}: Props): React.ReactNode {
	const theme = useTheme();
	if (!isSubagentStartEvent(event.payload)) return null;

	const payload = event.payload;
	const subSymbol = SUBAGENT_SYMBOLS[event.status];

	const isCompleted = Boolean(event.stopEvent);
	const responseText =
		event.stopEvent?.transcriptSummary?.lastAssistantText ?? '';

	return (
		<Box flexDirection="column" marginBottom={1}>
			<Box>
				<Text color={theme.accentSecondary}>{subSymbol} </Text>
				<Text color={theme.accentSecondary} bold>
					Task({payload.agent_type})
				</Text>
				{event.taskDescription ? (
					<Text dimColor> &quot;{event.taskDescription}&quot;</Text>
				) : (
					<Text dimColor> {payload.agent_id}</Text>
				)}
				{isCompleted && <Text dimColor> (completed)</Text>}
			</Box>
			{isCompleted && responseText && (
				<ResponseBlock response={responseText} isFailed={false} />
			)}
			<StderrBlock result={event.result} />
		</Box>
	);
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run source/components/HookEvent.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add source/components/SubagentEvent.tsx source/components/HookEvent.test.tsx
git commit -m "feat: show taskDescription in SubagentEvent header"
```

---

### Task 4: Run full test suite, lint, and typecheck

**Files:** None (verification only)

**Step 1: Run typecheck**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 2: Run lint**

Run: `npm run lint`
Expected: No errors

**Step 3: Run all tests**

Run: `npm test`
Expected: All pass

**Step 4: Fix any failures and commit**

If any failures, fix and commit with descriptive message.
