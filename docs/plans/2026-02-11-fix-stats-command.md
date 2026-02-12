# Fix /stats Command Bugs — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix four bugs in the `/stats` command: content duplication in `<Static>`, ghost dynamic viewport (Tasks x3), Duration always 0s, and Tokens always `--`.

**Architecture:** The root rendering issue is an architectural mismatch — `useContentOrdering` sorts items by timestamp (items can be inserted anywhere in the array), but Ink's `<Static>` component tracks rendered items by array index and assumes items are only appended at the end. When a new item is sorted into the middle of `stableItems`, it shifts already-rendered items past `<Static>`'s tracked index, causing them to render again. The fix is to make `stableItems` append-only by tracking items with a `useRef`-based accumulator keyed by item ID. The metrics bugs are straightforward: `sessionStartTime` is coupled to `model` detection, and token data has no source when Claude runs externally.

**Tech Stack:** React 19 + Ink 6.6.0, vitest, TypeScript ESM

---

### Task 1: Fix `sessionStartTime` coupled to `model` field in `useHeaderMetrics`

The `sessionStartTime` is only set when `event.payload.model` is truthy. If the `SessionStart` event arrives without a `model` field, session duration stays at 0s even though the session is running.

**Files:**

- Modify: `source/hooks/useHeaderMetrics.ts:38-47`
- Modify: `source/hooks/useHeaderMetrics.test.ts`

**Step 1: Write the failing test**

Add this test to `source/hooks/useHeaderMetrics.test.ts` inside the `describe('useHeaderMetrics')` block:

```typescript
it('sets sessionStartTime even when SessionStart has no model field', () => {
	const ts = new Date('2024-01-15T10:00:00Z');
	const events = [
		makeEvent({
			hookName: 'SessionStart',
			timestamp: ts,
			payload: {
				session_id: 's1',
				transcript_path: '/tmp/t.jsonl',
				cwd: '/project',
				hook_event_name: 'SessionStart',
				source: 'startup',
				// no model field
			},
		}),
	];

	const {result} = renderHook(() => useHeaderMetrics(events));
	expect(result.current.sessionStartTime).toEqual(ts);
	expect(result.current.modelName).toBeNull();
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/hooks/useHeaderMetrics.test.ts`
Expected: FAIL — `sessionStartTime` is `null` because the `model` check gates both fields.

**Step 3: Write minimal implementation**

In `source/hooks/useHeaderMetrics.ts`, replace lines 38-47:

```typescript
for (const event of events) {
	// Extract session start time from first SessionStart event
	if (sessionStartTime === null && isSessionStartEvent(event.payload)) {
		sessionStartTime = event.timestamp;
	}

	// Extract model from first SessionStart event with model field
	if (
		modelName === null &&
		isSessionStartEvent(event.payload) &&
		event.payload.model
	) {
		modelName = event.payload.model;
	}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run source/hooks/useHeaderMetrics.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add source/hooks/useHeaderMetrics.ts source/hooks/useHeaderMetrics.test.ts
git commit -m "fix: decouple sessionStartTime from model field in useHeaderMetrics

SessionStart events without a model field now still set sessionStartTime,
fixing Duration: 0s in /stats output."
```

---

### Task 2: Make `stableItems` append-only to fix `<Static>` duplication

**Problem:** Ink's `<Static>` component tracks rendered items by array length index (`items.slice(index)`). When `useContentOrdering` sorts items by timestamp, a new item inserted in the middle shifts already-rendered items past the index, causing re-rendering. This produces duplicate stats blocks and ghost dynamic content.

**Fix:** Use a `useRef`-based ID set to track which items have been emitted as stable. Once an item ID is added to `stableItems`, it stays in its position. New items are always appended at the end, never inserted in the middle.

**Files:**

- Modify: `source/hooks/useContentOrdering.ts:257-268`
- Modify: `source/hooks/useContentOrdering.test.ts`

**Step 1: Write the failing test**

Add this test to `source/hooks/useContentOrdering.test.ts` inside the `describe('useContentOrdering')` block:

```typescript
it('new stable items are appended at end, never inserted into middle', () => {
	// Simulate: events exist at t=1000 and t=3000.
	// Then a new item appears at t=2000 (e.g., SessionEnd synthetic message).
	// The new item should be APPENDED at the end of stableItems,
	// not inserted at its timestamp position.

	const events = [
		makeEvent({
			id: 'e1',
			hookName: 'Notification',
			status: 'passthrough',
			timestamp: new Date(1000),
		}),
		makeEvent({
			id: 'e3',
			hookName: 'Notification',
			status: 'passthrough',
			timestamp: new Date(3000),
		}),
	];

	// First call: 2 stable items, ordered by timestamp
	const result1 = useContentOrdering({messages: [], events});
	expect(result1.stableItems).toHaveLength(2);
	expect(result1.stableItems[0]!.data.id).toBe('e1');
	expect(result1.stableItems[1]!.data.id).toBe('e3');

	// Second call: add a message at t=2000 (between e1 and e3)
	const midMessage = makeMessage('mid', 'assistant', new Date(2000));
	const result2 = useContentOrdering({messages: [midMessage], events});

	expect(result2.stableItems).toHaveLength(3);
	// e1 and e3 keep their original positions (0 and 1)
	expect(result2.stableItems[0]!.data.id).toBe('e1');
	expect(result2.stableItems[1]!.data.id).toBe('e3');
	// New item appended at end, not inserted at position 1
	expect(result2.stableItems[2]!.data.id).toBe('mid');
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/hooks/useContentOrdering.test.ts`
Expected: FAIL — currently `mid` is sorted to position 1 (between e1 and e3).

**Step 3: Write minimal implementation**

`useContentOrdering` is a plain function (not a hook with `useRef`). To make it append-only, we need to change the approach. Since `useContentOrdering` is called as a plain function (not inside `renderHook`), the cleanest approach is to split: keep the pure computation but change how `stableItems` is built.

The fix: instead of sorting `stableItems` by timestamp (which causes insertion), build `stableItems` as an append-only list. Items that were in the previous `stableItems` keep their positions. New stable items are appended at the end.

Since `useContentOrdering` is a plain function called each render (not a hook), we need the caller to pass in the previous stableItems. But that would change the API. Instead, **convert `useContentOrdering` to use `useRef` internally** to track the stable item order.

In `source/hooks/useContentOrdering.ts`, replace the current export with:

```typescript
import {useRef} from 'react';

// ... (keep all existing imports and helper functions unchanged)

export function useContentOrdering({
	messages,
	events,
}: UseContentOrderingOptions): UseContentOrderingResult {
	// Track IDs that have been emitted as stable, in order.
	// Once an item enters this list, its position is fixed.
	const stableOrderRef = useRef<string[]>([]);

	// ... (keep all existing code from line 165 to line 262 unchanged:
	//      sessionEndMessages, childEventsByAgent, stoppedAgentIds,
	//      stopEventsByAgent, hookItems, todoWriteEvents, tasks,
	//      activeSubagents, completedSubagentItems, contentItems)

	const contentItems: ContentItem[] = [
		...messages.map(m => ({type: 'message' as const, data: m})),
		...hookItems,
		...completedSubagentItems,
		...sessionEndMessages,
	].sort((a, b) => getItemTime(a) - getItemTime(b));

	// Build a lookup map from item ID → ContentItem for O(1) access
	const itemById = new Map<string, ContentItem>();
	for (const item of contentItems) {
		itemById.set(item.data.id, item);
	}

	// Determine stability for each item
	const isStable = (item: ContentItem) =>
		isStableContent(item, stoppedAgentIds);

	// Build append-only stableItems:
	// 1. Keep existing stable items in their original order (skip any that are no longer present)
	// 2. Append new stable items that weren't in the previous list
	const prevStableIds = new Set(stableOrderRef.current);
	const stableItems: ContentItem[] = [];

	// Retain existing order for previously-stable items
	for (const id of stableOrderRef.current) {
		const item = itemById.get(id);
		if (item && isStable(item)) {
			stableItems.push(item);
		}
	}

	// Append newly-stable items (in timestamp order among themselves)
	for (const item of contentItems) {
		if (isStable(item) && !prevStableIds.has(item.data.id)) {
			stableItems.push(item);
		}
	}

	// Update the ref with the current stable ID order
	stableOrderRef.current = stableItems.map(i => i.data.id);

	// Dynamic items: everything that's not stable
	const dynamicItems = contentItems.filter(item => !isStable(item));

	return {
		stableItems,
		dynamicItems,
		activeSubagents,
		childEventsByAgent,
		tasks,
	};
}
```

**Important:** This changes `useContentOrdering` from a pure function to a React hook (it now uses `useRef`). The existing call site in `app.tsx` already calls it inside a component, so this is safe. But the **tests** call it as a plain function — they need to be updated.

**Step 4: Update tests to use `renderHook`**

The test file calls `useContentOrdering()` directly as a plain function. Since it now uses `useRef`, tests must wrap it in `renderHook`. Add this docblock to the top of the test file:

```typescript
/** @vitest-environment jsdom */
```

And update each test that calls `useContentOrdering` to use `renderHook`. For example, the interleaving test becomes:

```typescript
it('interleaves messages and events by timestamp', () => {
	const messages = [makeMessage('1000-msg', 'user', new Date(1000))];
	const events = [
		makeEvent({
			id: 'e1',
			hookName: 'Notification',
			status: 'passthrough',
			timestamp: new Date(500),
		}),
		makeEvent({
			id: 'e2',
			hookName: 'Notification',
			status: 'passthrough',
			timestamp: new Date(1500),
		}),
	];

	const {result} = renderHook(() => useContentOrdering({messages, events}));
	const {stableItems} = result.current;

	// Ordered by time: e1 (500) → msg (1000) → e2 (1500)
	expect(stableItems[0]).toEqual({type: 'hook', data: events[0]});
	expect(stableItems[1]).toEqual({type: 'message', data: messages[0]});
	expect(stableItems[2]).toEqual({type: 'hook', data: events[1]});
});
```

**Note:** The initial render (first call) still sorts by timestamp. Only subsequent renders use append-only ordering. The test from Step 1 validates multi-render behavior using `renderHook` + `rerender`.

Update the Step 1 test to use `renderHook` with `rerender`:

```typescript
it('new stable items are appended at end, never inserted into middle', () => {
	const events = [
		makeEvent({
			id: 'e1',
			hookName: 'Notification',
			status: 'passthrough',
			timestamp: new Date(1000),
		}),
		makeEvent({
			id: 'e3',
			hookName: 'Notification',
			status: 'passthrough',
			timestamp: new Date(3000),
		}),
	];

	const {result, rerender} = renderHook(
		(props: {messages: Message[]; events: HookEventDisplay[]}) =>
			useContentOrdering(props),
		{initialProps: {messages: [], events}},
	);

	expect(result.current.stableItems).toHaveLength(2);
	expect(result.current.stableItems[0]!.data.id).toBe('e1');
	expect(result.current.stableItems[1]!.data.id).toBe('e3');

	// Add a message at t=2000 (between e1 and e3)
	const midMessage = makeMessage('mid', 'assistant', new Date(2000));
	rerender({messages: [midMessage], events});

	expect(result.current.stableItems).toHaveLength(3);
	// Original items keep their positions
	expect(result.current.stableItems[0]!.data.id).toBe('e1');
	expect(result.current.stableItems[1]!.data.id).toBe('e3');
	// New item appended at end
	expect(result.current.stableItems[2]!.data.id).toBe('mid');
});
```

**Step 5: Run tests to verify all pass**

Run: `npx vitest run source/hooks/useContentOrdering.test.ts`
Expected: ALL PASS

**Step 6: Run full test suite**

Run: `npm test`
Expected: ALL PASS

**Step 7: Commit**

```bash
git add source/hooks/useContentOrdering.ts source/hooks/useContentOrdering.test.ts
git commit -m "fix: make stableItems append-only to prevent <Static> duplication

Ink's <Static> tracks rendered items by array index. When items were
sorted by timestamp, new items inserted in the middle shifted
already-rendered items past the index boundary, causing re-rendering.

stableItems now uses a useRef-based ID tracker: previously-emitted items
keep their positions, and new stable items are always appended at the end."
```

---

### Task 3: Run lint, typecheck, and full tests

**Step 1: Run typecheck**

Run: `npm run build`
Expected: No errors

**Step 2: Run lint**

Run: `npm run lint`
Expected: No errors (fix any formatting issues with `npm run format`)

**Step 3: Run full test suite**

Run: `npm test`
Expected: ALL PASS

**Step 4: Manual verification**

Build and run athena-cli. Start a Claude session. After events arrive, run `/stats` twice. Verify:

- Stats block appears exactly once per `/stats` call
- Tasks widget appears exactly once (not multiplied)
- Duration shows non-zero value (if SessionStart was received)
- Model name displays correctly

---

### Task 4 (Future — not in this PR): Token data from hook events

**Context:** Tokens show `--` because `tokenUsage` only comes from `useClaudeProcess` (spawned Claude). When Claude runs externally via hooks, no token data is available. This requires a new data source — either from the `SessionEnd` transcript summary or from a new hook event. This is a separate feature, not a bug fix.

**Skip for now.** File an issue to track.

---

## Risks & Edge Cases

1. **Test migration to `renderHook`:** Converting all `useContentOrdering` tests to use `renderHook` is tedious but straightforward. The `@testing-library/react` `renderHook` requires `jsdom` environment (already noted in MEMORY.md).

2. **First-render ordering:** On the very first render, `stableOrderRef.current` is empty, so all items are "new" and appended in timestamp order. This preserves the existing behavior for the initial display.

3. **Items removed from `contentItems`:** If an item ID is in `stableOrderRef` but no longer in `contentItems` (e.g., events were cleared), it's silently skipped. This handles `/clear` correctly.

4. **Performance:** The `Map` + `Set` lookups are O(n) overall, same as the current `filter` approach. No regression.
