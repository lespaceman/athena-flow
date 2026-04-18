# Feed Cursor By Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the positional `feedCursor: number` with an identity-based `feedCursorId: string | null` so that pager, yank, search, and rendering all resolve the correct entry regardless of which array (full vs split-mode subset) is in scope.

**Architecture:** The root cause is that `feedCursor` is an integer index interpreted against two different arrays: `filteredEntries` (all entries) and `displayedFeedEntries` (feed-only subset in split mode). Every consumer that navigates bounds the cursor against one array, but consumers that look up the entry (pager, yank, search submission) use the other. The fix replaces the cursor with a stable entry ID. Navigation resolves the ID to a position in `displayedFeedEntries`, moves by delta, then stores the new entry's ID. Lookup consumers use `find(e => e.id === cursorId)` on whatever array they have — no ambiguity. The rendering layer (FeedGrid/feedSurfaceModel) continues to receive a positional index derived from `displayedFeedEntries` at render time.

**Tech Stack:** TypeScript, React hooks, Vitest

---

### File Map

| File                                             | Action | Responsibility                                                                                           |
| ------------------------------------------------ | ------ | -------------------------------------------------------------------------------------------------------- |
| `src/app/shell/sessionUiState.ts`                | Modify | Replace `feedCursor: number` with `feedCursorId: string \| null`, update reducer, scroll logic           |
| `src/app/shell/AppShell.tsx`                     | Modify | Wire `displayedFeedEntriesRef`, derive positional index for FeedGrid, update pager/yank/search callsites |
| `src/app/shell/useShellInput.ts`                 | Modify | Accept `displayedEntriesRef` instead of `filteredEntriesRef` for search                                  |
| `src/ui/hooks/usePager.ts`                       | Modify | Accept `displayedEntriesRef` + `feedCursorId`, look up entry by ID                                       |
| `src/app/shell/__tests__/sessionUiState.test.ts` | Modify | Update existing tests for new state shape, add identity cursor tests                                     |
| `src/app/shell/__tests__/useShellInput.test.ts`  | Modify | Update ref name in test helpers                                                                          |

---

### Task 1: Update State Types and Reducer

**Files:**

- Modify: `src/app/shell/sessionUiState.ts`
- Test: `src/app/shell/__tests__/sessionUiState.test.ts`

The reducer currently stores `feedCursor: number` and computes scroll state with `computeScrollState` which clamps a numeric cursor. We need to:

1. Replace `feedCursor: number` with `feedCursorId: string | null` in state
2. Keep `feedViewportStart: number` and `tailFollow: boolean` — these remain positional for scroll math
3. Add a new context field `feedEntries: ReadonlyArray<{id: string}>` so the reducer can resolve ID↔position
4. Move position-based scroll math into a helper that the AppShell calls after resolving the ID to an index

**Key insight:** The reducer doesn't need to resolve IDs itself. It stores the ID. The AppShell resolves to a positional index for viewport math and passes that to FeedGrid. The reducer still handles actions like `move_feed_cursor` — it receives the `displayedFeedEntries` array via context, finds the current ID's position, applies the delta, and stores the new ID.

- [ ] **Step 1: Write failing tests for identity-based cursor**

Add new tests to `src/app/shell/__tests__/sessionUiState.test.ts`:

```typescript
it('move_feed_cursor navigates by ID through provided entries', () => {
	const entries = [{id: 'a'}, {id: 'b'}, {id: 'c'}, {id: 'd'}, {id: 'e'}];
	const ctx = makeContext({
		feedEntryCount: 5,
		feedContentRows: 3,
		feedEntries: entries,
	});
	const state: SessionUiState = {
		...initialSessionUiState,
		feedCursorId: 'b',
		tailFollow: false,
	};
	const result = reduceSessionUiState(
		state,
		{type: 'move_feed_cursor', delta: 2},
		ctx,
	);
	expect(result.feedCursorId).toBe('d');
});

it('move_feed_cursor clamps at array bounds', () => {
	const entries = [{id: 'a'}, {id: 'b'}, {id: 'c'}];
	const ctx = makeContext({
		feedEntryCount: 3,
		feedContentRows: 3,
		feedEntries: entries,
	});
	const state: SessionUiState = {
		...initialSessionUiState,
		feedCursorId: 'b',
		tailFollow: false,
	};
	const result = reduceSessionUiState(
		state,
		{type: 'move_feed_cursor', delta: 10},
		ctx,
	);
	expect(result.feedCursorId).toBe('c');
});

it('move_feed_cursor with null cursorId starts from top', () => {
	const entries = [{id: 'a'}, {id: 'b'}];
	const ctx = makeContext({
		feedEntryCount: 2,
		feedContentRows: 2,
		feedEntries: entries,
	});
	const state: SessionUiState = {
		...initialSessionUiState,
		feedCursorId: null,
		tailFollow: false,
	};
	const result = reduceSessionUiState(
		state,
		{type: 'move_feed_cursor', delta: 1},
		ctx,
	);
	expect(result.feedCursorId).toBe('b');
});

it('jump_feed_tail sets cursorId to last entry', () => {
	const entries = [{id: 'a'}, {id: 'b'}, {id: 'c'}];
	const ctx = makeContext({
		feedEntryCount: 3,
		feedContentRows: 2,
		feedEntries: entries,
	});
	const state: SessionUiState = {
		...initialSessionUiState,
		feedCursorId: 'a',
		tailFollow: false,
	};
	const result = reduceSessionUiState(state, {type: 'jump_feed_tail'}, ctx);
	expect(result.feedCursorId).toBe('c');
	expect(result.tailFollow).toBe(true);
});

it('jump_feed_top sets cursorId to first entry', () => {
	const entries = [{id: 'a'}, {id: 'b'}, {id: 'c'}];
	const ctx = makeContext({
		feedEntryCount: 3,
		feedContentRows: 2,
		feedEntries: entries,
	});
	const state: SessionUiState = {
		...initialSessionUiState,
		feedCursorId: 'c',
		tailFollow: false,
	};
	const result = reduceSessionUiState(state, {type: 'jump_feed_top'}, ctx);
	expect(result.feedCursorId).toBe('a');
});

it('set_feed_cursor sets cursorId by index lookup', () => {
	const entries = [{id: 'a'}, {id: 'b'}, {id: 'c'}];
	const ctx = makeContext({
		feedEntryCount: 3,
		feedContentRows: 3,
		feedEntries: entries,
	});
	const state: SessionUiState = {
		...initialSessionUiState,
		feedCursorId: 'a',
		tailFollow: false,
	};
	const result = reduceSessionUiState(
		state,
		{type: 'set_feed_cursor', cursor: 2},
		ctx,
	);
	expect(result.feedCursorId).toBe('c');
});

it('resolveSessionUiState snaps stale cursorId to last entry', () => {
	const entries = [{id: 'x'}, {id: 'y'}];
	const ctx = makeContext({
		feedEntryCount: 2,
		feedContentRows: 2,
		feedEntries: entries,
	});
	const state: SessionUiState = {
		...initialSessionUiState,
		feedCursorId: 'deleted-entry',
		tailFollow: false,
	};
	const result = resolveSessionUiState(state, ctx);
	// Stale ID should snap to last entry
	expect(result.feedCursorId).toBe('y');
});

it('tailFollow sets cursorId to last entry on resolve', () => {
	const entries = [{id: 'a'}, {id: 'b'}, {id: 'c'}];
	const ctx = makeContext({
		feedEntryCount: 3,
		feedContentRows: 2,
		feedEntries: entries,
	});
	const state: SessionUiState = {
		...initialSessionUiState,
		feedCursorId: 'a',
		tailFollow: true,
	};
	const result = resolveSessionUiState(state, ctx);
	expect(result.feedCursorId).toBe('c');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/app/shell/__tests__/sessionUiState.test.ts`
Expected: FAIL — `feedCursorId` doesn't exist on the type yet.

- [ ] **Step 3: Update types in sessionUiState.ts**

In `SessionUiState`, replace `feedCursor: number` with `feedCursorId: string | null`:

```typescript
export type SessionUiState = {
	focusMode: FocusMode;
	inputMode: InputMode;
	hintsForced: boolean | null;
	showRunOverlay: boolean;
	searchQuery: string;
	searchMatchPos: number;
	feedCursorId: string | null; // was: feedCursor: number
	feedViewportStart: number;
	tailFollow: boolean;
	todoVisible: boolean;
	todoShowDone: boolean;
	todoCursor: number;
	todoScroll: number;
	todoCursorMode: TodoCursorMode;
	messagePanelTab: MessageTab;
	messageViewportStart: number;
	messageTailFollow: boolean;
};
```

Add `feedEntries` to `SessionUiContext`:

```typescript
export type SessionUiContext = {
	feedEntryCount: number;
	feedContentRows: number;
	feedEntries: ReadonlyArray<{id: string}>; // NEW
	searchMatchCount: number;
	todoVisibleCount: number;
	todoListHeight: number;
	todoFocusable: boolean;
	todoAnchorIndex: number;
	staticFloor?: number;
	messageEntryCount: number;
	messageContentRows: number;
};
```

Update `initialSessionUiState`:

```typescript
export const initialSessionUiState: SessionUiState = {
	focusMode: 'input',
	inputMode: 'normal',
	hintsForced: null,
	showRunOverlay: false,
	searchQuery: '',
	searchMatchPos: 0,
	feedCursorId: null, // was: feedCursor: 0
	feedViewportStart: 0,
	tailFollow: true,
	todoVisible: true,
	todoShowDone: true,
	todoCursor: 0,
	todoScroll: 0,
	todoCursorMode: 'auto',
	messagePanelTab: 'both',
	messageViewportStart: 0,
	messageTailFollow: true,
};
```

Update `FeedState`:

```typescript
type FeedState = Pick<
	SessionUiState,
	'feedCursorId' | 'feedViewportStart' | 'tailFollow'
>;
```

- [ ] **Step 4: Add ID↔position resolution helpers**

Add these helpers to `sessionUiState.ts`:

```typescript
/** Resolve a cursorId to its index in the entries array. Returns -1 if not found. */
function resolveIdToIndex(
	entries: ReadonlyArray<{id: string}>,
	cursorId: string | null,
): number {
	if (cursorId === null) return -1;
	return entries.findIndex(e => e.id === cursorId);
}

/** Resolve a positional index to the entry ID at that position. */
function resolveIndexToId(
	entries: ReadonlyArray<{id: string}>,
	index: number,
): string | null {
	return entries[index]?.id ?? null;
}
```

- [ ] **Step 5: Update computeFeedState to work with IDs**

Replace `computeFeedState` to take a positional cursor index (computed by the caller from the ID), do scroll math, then return the resulting ID:

```typescript
function computeFeedState(
	cursorIndex: number,
	viewportStart: number,
	tailFollow: boolean,
	ctx: SessionUiContext,
): FeedState {
	const floor = ctx.staticFloor ?? DEFAULT_STATIC_FLOOR;
	const s = computeScrollState(
		cursorIndex,
		viewportStart,
		tailFollow,
		ctx.feedEntryCount,
		ctx.feedContentRows,
		floor,
	);
	return {
		feedCursorId: resolveIndexToId(ctx.feedEntries, s.cursor),
		tailFollow: s.tailFollow,
		feedViewportStart: s.viewportStart,
	};
}
```

- [ ] **Step 6: Update withFeedChange**

```typescript
function withFeedChange(
	current: SessionUiState,
	feed: FeedState,
): SessionUiState {
	if (
		feed.feedCursorId === current.feedCursorId &&
		feed.feedViewportStart === current.feedViewportStart &&
		feed.tailFollow === current.tailFollow
	) {
		return current;
	}
	return {...current, ...feed};
}
```

- [ ] **Step 7: Update resolveSessionUiState**

The resolve function needs to convert the ID to a position for scroll math, then convert back:

```typescript
export function resolveSessionUiState(
	state: SessionUiState,
	ctx: SessionUiContext,
): SessionUiState {
	// Resolve cursorId to positional index for scroll math
	let cursorIndex = resolveIdToIndex(ctx.feedEntries, state.feedCursorId);
	if (cursorIndex < 0 && ctx.feedEntryCount > 0) {
		// Stale or null ID — snap to last entry
		cursorIndex = ctx.feedEntryCount - 1;
	}

	const feedState = computeFeedState(
		cursorIndex,
		state.feedViewportStart,
		state.tailFollow,
		ctx,
	);
	// ... rest unchanged, but replace feedCursor references with feedCursorId ...
```

Update the equality check at the end to compare `feedCursorId` instead of `feedCursor`:

```typescript
if (
	focusMode === state.focusMode &&
	searchMatchPos === state.searchMatchPos &&
	feedState.feedCursorId === state.feedCursorId &&
	feedState.feedViewportStart === state.feedViewportStart &&
	feedState.tailFollow === state.tailFollow &&
	todoCursor === state.todoCursor &&
	todoScroll === state.todoScroll &&
	msgState.messageViewportStart === state.messageViewportStart &&
	msgState.messageTailFollow === state.messageTailFollow
) {
	return state;
}

return {
	...state,
	focusMode,
	searchMatchPos,
	feedCursorId: feedState.feedCursorId,
	feedViewportStart: feedState.feedViewportStart,
	tailFollow: feedState.tailFollow,
	todoCursor,
	todoScroll,
	messageViewportStart: msgState.messageViewportStart,
	messageTailFollow: msgState.messageTailFollow,
};
```

- [ ] **Step 8: Update all reducer action handlers**

Each action that touches `feedCursor` must be updated. The pattern is: resolve current ID to index, compute new position, store new ID.

**`move_feed_cursor`:**

```typescript
case 'move_feed_cursor': {
	const currentIdx = resolveIdToIndex(ctx.feedEntries, current.feedCursorId);
	const baseIdx = currentIdx >= 0 ? currentIdx : 0;
	return withFeedChange(
		current,
		computeFeedState(
			baseIdx + action.delta,
			current.feedViewportStart,
			false,
			ctx,
		),
	);
}
```

**`jump_feed_tail`:**

```typescript
case 'jump_feed_tail':
	return withFeedChange(current, {
		feedCursorId: resolveIndexToId(ctx.feedEntries, maxFeedCursor(ctx)),
		feedViewportStart: maxFeedViewportStart(ctx),
		tailFollow: true,
	});
```

**`jump_feed_top`:**

```typescript
case 'jump_feed_top': {
	const floor = ctx.staticFloor ?? DEFAULT_STATIC_FLOOR;
	return withFeedChange(current, {
		feedCursorId: resolveIndexToId(ctx.feedEntries, floor),
		feedViewportStart: floor,
		tailFollow: false,
	});
}
```

**`set_feed_cursor`:**

```typescript
case 'set_feed_cursor':
	return withFeedChange(
		current,
		computeFeedState(action.cursor, current.feedViewportStart, false, ctx),
	);
```

**`set_tail_follow`:**

```typescript
case 'set_tail_follow':
	if (action.tailFollow) {
		return withFeedChange(current, {
			feedCursorId: resolveIndexToId(ctx.feedEntries, maxFeedCursor(ctx)),
			feedViewportStart: maxFeedViewportStart(ctx),
			tailFollow: true,
		});
	}
	if (!current.tailFollow) return current;
	return {...current, tailFollow: false};
```

**`clear_search_and_jump_tail`:**

```typescript
case 'clear_search_and_jump_tail':
	return {
		...current,
		searchQuery: '',
		searchMatchPos: 0,
		showRunOverlay: false,
		feedCursorId: resolveIndexToId(ctx.feedEntries, maxFeedCursor(ctx)),
		feedViewportStart: maxFeedViewportStart(ctx),
		tailFollow: true,
	};
```

**`submit_search_query`:** (the `firstMatchIndex` remains numeric — it's an index into the displayed array)

```typescript
case 'submit_search_query': {
	const nextState: SessionUiState = {
		...current,
		focusMode: 'feed',
		inputMode: 'normal',
		searchQuery: action.query,
		searchMatchPos: 0,
	};
	return action.firstMatchIndex === null
		? nextState
		: {
				...nextState,
				...computeFeedState(
					action.firstMatchIndex,
					current.feedViewportStart,
					false,
					ctx,
				),
			};
}
```

**`step_search_match`:**

```typescript
case 'step_search_match': {
	if (action.matches.length === 0) return current;
	const nextPos =
		(current.searchMatchPos + action.direction + action.matches.length) %
		action.matches.length;
	return {
		...current,
		searchMatchPos: nextPos,
		...computeFeedState(
			action.matches[nextPos]!,
			current.feedViewportStart,
			false,
			ctx,
		),
	};
}
```

**`reveal_feed_entry`:**

```typescript
case 'reveal_feed_entry': {
	const feed = computeFeedState(
		action.cursor,
		current.feedViewportStart,
		false,
		ctx,
	);
	if (
		current.focusMode === 'feed' &&
		feed.feedCursorId === current.feedCursorId &&
		feed.feedViewportStart === current.feedViewportStart &&
		feed.tailFollow === current.tailFollow
	) {
		return current;
	}
	return {...current, focusMode: 'feed', ...feed};
}
```

- [ ] **Step 9: Update existing tests to use new type shape**

In `src/app/shell/__tests__/sessionUiState.test.ts`, update:

1. `makeContext` to include `feedEntries` (default: generate entries from `feedEntryCount`):

```typescript
function makeContext(
	overrides: Partial<SessionUiContext> = {},
): SessionUiContext {
	const count = overrides.feedEntryCount ?? 10;
	return {
		feedEntryCount: count,
		feedContentRows: 4,
		feedEntries:
			overrides.feedEntries ??
			Array.from({length: count}, (_, i) => ({id: `e${i}`})),
		searchMatchCount: 0,
		todoVisibleCount: 0,
		todoListHeight: 0,
		todoFocusable: false,
		todoAnchorIndex: -1,
		staticFloor: 0,
		messageEntryCount: 0,
		messageContentRows: 0,
		...overrides,
	};
}
```

2. Replace all references to `feedCursor` with `feedCursorId` in test assertions and state construction. For example, `feedCursor: 9` becomes `feedCursorId: 'e9'` (matching the auto-generated IDs above).

- [ ] **Step 10: Run tests to verify they pass**

Run: `npx vitest run src/app/shell/__tests__/sessionUiState.test.ts`
Expected: All tests PASS.

- [ ] **Step 11: Commit**

```bash
git add src/app/shell/sessionUiState.ts src/app/shell/__tests__/sessionUiState.test.ts
git commit -m "refactor(feed): replace feedCursor index with feedCursorId identity

The positional feedCursor integer was interpreted against two different
arrays in split mode, causing pager/yank to open the wrong entry.
The reducer now stores a stable entry ID and resolves positions via
context-provided feedEntries array."
```

---

### Task 2: Wire AppShell — Derive Position from ID, Update Refs

**Files:**

- Modify: `src/app/shell/AppShell.tsx`

The AppShell is the integration point. It must:

1. Pass `feedEntries` in the `uiContext` so the reducer can resolve IDs
2. Create a `displayedFeedEntriesRef` that tracks the current displayed array
3. Derive a positional `feedCursorIndex` from `feedCursorId` for FeedGrid
4. Pass the ref to pager and yank so they look up by ID in the correct array

- [ ] **Step 1: Add feedEntries to uiContext**

In the `uiContext` useMemo (around line 1002), add `feedEntries: displayedFeedEntries`:

```typescript
const uiContext = useMemo(
	(): SessionUiContext => ({
		feedEntryCount: displayedFeedEntries.length,
		feedContentRows: visibleFeedContentRows,
		feedEntries: displayedFeedEntries, // NEW
		searchMatchCount: searchMatches.length,
		// ... rest unchanged
	}),
	[
		displayedFeedEntries, // changed from displayedFeedEntries.length
		visibleFeedContentRows,
		searchMatches.length,
		// ... rest unchanged
	],
);
```

Note: The dep changes from `.length` to the full array reference. This is intentional — when the array identity changes (entries added/removed), the context must update so the reducer can resolve IDs. In practice `displayedFeedEntries` already changes reference when entries change, so this doesn't add extra renders.

- [ ] **Step 2: Create displayedFeedEntriesRef**

After `displayedFeedEntries` is defined (around line 944), add a ref:

```typescript
const displayedFeedEntriesRef = useRef(displayedFeedEntries);
displayedFeedEntriesRef.current = displayedFeedEntries;
```

- [ ] **Step 3: Derive positional feedCursor from feedCursorId**

After `resolvedUiState` is computed (around line 1029), derive the positional index:

```typescript
const resolvedUiState = useMemo(
	() => resolveSessionUiState(uiState, uiContext),
	[uiState, uiContext],
);
const focusMode = resolvedUiState.focusMode;
const searchMatchPos = resolvedUiState.searchMatchPos;

// Derive positional cursor from ID for FeedGrid and viewport math
const feedCursorIndex = useMemo(() => {
	if (resolvedUiState.feedCursorId === null) return 0;
	const idx = displayedFeedEntries.findIndex(
		e => e.id === resolvedUiState.feedCursorId,
	);
	return idx >= 0 ? idx : 0;
}, [resolvedUiState.feedCursorId, displayedFeedEntries]);
```

- [ ] **Step 4: Update feedNav to expose feedCursorIndex**

```typescript
const feedNav = {
	feedCursorId: resolvedUiState.feedCursorId,
	feedCursorIndex, // positional, for FeedGrid
	feedViewportStart: resolvedUiState.feedViewportStart,
	tailFollow: resolvedUiState.tailFollow,
	moveFeedCursor: (delta: number) =>
		dispatchUi({type: 'move_feed_cursor', delta}),
	jumpToTail: () => dispatchUi({type: 'jump_feed_tail'}),
	jumpToTop: () => dispatchUi({type: 'jump_feed_top'}),
	setFeedCursor: (cursor: number) =>
		dispatchUi({type: 'set_feed_cursor', cursor}),
	setTailFollow: (tailFollow: boolean) =>
		dispatchUi({type: 'set_tail_follow', tailFollow}),
};
```

- [ ] **Step 5: Update FeedGrid props to use feedCursorIndex**

Replace all `feedCursor={feedNav.feedCursor}` with `feedCursor={feedNav.feedCursorIndex}` (two instances, around lines 1467 and 1486):

```typescript
feedCursor={feedNav.feedCursorIndex}
```

- [ ] **Step 6: Update usePager call to pass displayedFeedEntriesRef and cursorId**

```typescript
const {pagerActive, handleExpandForPager} = usePager({
	displayedEntriesRef: displayedFeedEntriesRef,
	feedCursorId: feedNav.feedCursorId,
	theme,
});
```

- [ ] **Step 7: Update yankAtCursor to use displayedFeedEntriesRef and cursorId**

```typescript
const yankAtCursor = useCallback(() => {
	const entry = displayedFeedEntriesRef.current.find(
		e => e.id === resolvedUiState.feedCursorId,
	);
	if (!entry) return;
	const content = extractYankContent(entry, theme);
	copyToClipboard(content);
	showToast('Copied to clipboard!');
}, [resolvedUiState.feedCursorId, showToast, theme]);
```

- [ ] **Step 8: Update useShellInput call to pass displayedFeedEntriesRef**

```typescript
const {
	// ...
} = useShellInput({
	inputMode,
	// ...
	filteredEntriesRef: displayedFeedEntriesRef, // was: filteredEntriesRef
	// ...
});
```

This makes search submission find the first match within the displayed entries (not the full unfiltered set), so the resulting index matches what the reducer expects.

- [ ] **Step 9: Update tailFollow-related usages**

Search for any remaining references to `feedNav.feedCursor` and replace with `feedNav.feedCursorIndex` where a positional value is needed. The `FeedGrid.tsx` `rowSignature` computation (around line 137 in FeedGrid) should also receive positional index — but since FeedGrid receives `feedCursor` as a prop (already mapped to `feedNav.feedCursorIndex` in step 5), this is handled.

- [ ] **Step 10: Run typecheck**

Run: `npm run typecheck`
Expected: PASS — all types should align.

- [ ] **Step 11: Commit**

```bash
git add src/app/shell/AppShell.tsx
git commit -m "refactor(feed): wire identity cursor through AppShell

Derive positional feedCursorIndex from feedCursorId for FeedGrid.
Pass displayedFeedEntriesRef to pager/yank/search so lookups use
the correct array in both unified and split mode."
```

---

### Task 3: Update usePager to Look Up by ID

**Files:**

- Modify: `src/ui/hooks/usePager.ts`

- [ ] **Step 1: Update UsePagerOptions type**

```typescript
export type UsePagerOptions = {
	displayedEntriesRef: React.RefObject<TimelineEntry[]>;
	feedCursorId: string | null;
	theme?: Theme;
};
```

- [ ] **Step 2: Update usePager function signature and handleExpandForPager**

```typescript
export function usePager({
	displayedEntriesRef,
	feedCursorId,
	theme,
}: UsePagerOptions): {
	pagerActive: boolean;
	handleExpandForPager: () => void;
} {
```

Update `handleExpandForPager` (was line 105):

```typescript
const handleExpandForPager = useCallback(() => {
	const entry = displayedEntriesRef.current.find(e => e.id === feedCursorId);
	if (!entry?.expandable) return;
	pendingPagerEntryRef.current = entry;
	pagerEntryIdRef.current = entry.id;
	setPagerActive(true);
}, [displayedEntriesRef, feedCursorId]);
```

- [ ] **Step 3: Update streaming re-render effect**

The effect at line 147 that detects `pairedPostEvent` changes should search `displayedEntriesRef` instead of `filteredEntriesRef`:

```typescript
useEffect(() => {
	if (!pagerActive) return;
	if (pagerLinesRef.current.length === 0) return;

	const entryId = pagerEntryIdRef.current;
	if (entryId) {
		const currentEntry = displayedEntriesRef.current.find(
			e => e.id === entryId,
		);
		// ... rest unchanged
```

- [ ] **Step 4: Run typecheck and tests**

Run: `npm run typecheck && npx vitest run`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ui/hooks/usePager.ts
git commit -m "fix(pager): look up entry by ID from displayed entries

Resolves the split-mode mismatch where pressing Enter on a feed item
would open the wrong entry's details."
```

---

### Task 4: Update useShellInput Type Annotation

**Files:**

- Modify: `src/app/shell/useShellInput.ts`
- Test: `src/app/shell/__tests__/useShellInput.test.ts`

The `useShellInput` receives `filteredEntriesRef` — in the AppShell we're now passing `displayedFeedEntriesRef`. The prop name says `filteredEntriesRef` but it already works with any `TimelineEntry[]` ref. We should rename it for clarity.

- [ ] **Step 1: Rename the prop**

In `useShellInput.ts`, rename `filteredEntriesRef` to `displayedEntriesRef` in the type and function:

```typescript
export type UseShellInputOptions = {
	inputMode: InputMode;
	setInputMode: (mode: InputMode) => void;
	setSearchQuery: (query: string) => void;
	closeInput: () => void;
	submitSearchQuery: (query: string, firstMatchIndex: number | null) => void;
	submitPromptOrSlashCommand: (value: string) => void;
	displayedEntriesRef: React.RefObject<TimelineEntry[]>; // renamed
	getSelectedCommand?: () => Command | undefined;
};
```

Update the destructure and usages inside the function (the `findFirstSearchMatch` call):

```typescript
export function useShellInput({
	inputMode,
	setInputMode,
	setSearchQuery,
	closeInput,
	submitSearchQuery,
	submitPromptOrSlashCommand,
	displayedEntriesRef,
	getSelectedCommand,
}: UseShellInputOptions): UseShellInputResult {
```

And in the submit handler:

```typescript
const firstIdx =
	query.length > 0
		? findFirstSearchMatch(displayedEntriesRef.current, query, 0)
		: -1;
```

And in the deps array:

```typescript
[
	inputMode,
	submitPromptOrSlashCommand,
	getSelectedCommand,
	closeInput,
	submitSearchQuery,
	displayedEntriesRef,
],
```

- [ ] **Step 2: Update AppShell callsite**

In `AppShell.tsx`, update the prop name:

```typescript
const {
	// ...
} = useShellInput({
	inputMode,
	// ...
	displayedEntriesRef: displayedFeedEntriesRef,
	// ...
});
```

- [ ] **Step 3: Update tests**

In `src/app/shell/__tests__/useShellInput.test.ts`, rename `filteredEntriesRef` to `displayedEntriesRef` in `makeOptions`:

```typescript
function makeOptions(
	overrides: Partial<UseShellInputOptions> = {},
): UseShellInputOptions {
	return {
		inputMode: 'normal' as const,
		setInputMode: vi.fn(),
		setSearchQuery: vi.fn(),
		closeInput: vi.fn(),
		submitSearchQuery: vi.fn(),
		submitPromptOrSlashCommand: vi.fn(),
		displayedEntriesRef: {current: []},
		...overrides,
	};
}
```

And update all test cases that pass `filteredEntriesRef`:

```typescript
// Before:
filteredEntriesRef: {current: entries},
// After:
displayedEntriesRef: {current: entries},
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/app/shell/__tests__/useShellInput.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/shell/useShellInput.ts src/app/shell/__tests__/useShellInput.test.ts src/app/shell/AppShell.tsx
git commit -m "refactor(search): rename filteredEntriesRef to displayedEntriesRef

Search submission now operates on the displayed entries array,
which in split mode is the feed-only subset. This ensures the
first-match index returned to the reducer matches the cursor space."
```

---

### Task 5: Fix Search Match Indices for Split Mode

**Files:**

- Modify: `src/app/shell/AppShell.tsx`

`searchMatches` and `searchMatchSet` are computed by `useTimeline` as indices into `filteredEntries` (the full array). In split mode, these indices don't correspond to positions in `displayedFeedEntries`. The `searchMatchSet` is passed to FeedGrid for highlighting, and `visibleSearchMatches` is passed to keyboard handler for n/N stepping.

- [ ] **Step 1: Remap searchMatches for split mode**

After `displayedFeedEntries` is defined, add remapping logic. In split mode, we need to map indices from `filteredEntries` space to `displayedFeedEntries` space:

```typescript
// Remap search matches to displayedFeedEntries index space
const displayedSearchMatches = useMemo(() => {
	if (!splitMode) return searchMatches;
	// Build a map from entry ID -> index in displayedFeedEntries
	const idToDisplayIdx = new Map<string, number>();
	displayedFeedEntries.forEach((e, i) => idToDisplayIdx.set(e.id, i));
	// Remap: for each match index in filteredEntries, look up the entry's
	// ID and find its position in displayedFeedEntries
	const remapped: number[] = [];
	for (const matchIdx of searchMatches) {
		const entry = filteredEntries[matchIdx];
		if (entry) {
			const displayIdx = idToDisplayIdx.get(entry.id);
			if (displayIdx !== undefined) {
				remapped.push(displayIdx);
			}
		}
	}
	return remapped;
}, [splitMode, searchMatches, filteredEntries, displayedFeedEntries]);

const displayedSearchMatchSet = useMemo(
	() => new Set(displayedSearchMatches),
	[displayedSearchMatches],
);
```

- [ ] **Step 2: Pass remapped matches to consumers**

Update `searchMatchSet` passed to FeedGrid (two instances):

```typescript
searchMatchSet = {displayedSearchMatchSet};
```

Update the `useFrameChrome` call — `searchMatches` prop should use `displayedSearchMatches`:

```typescript
searchMatches: displayedSearchMatches,
```

Or more precisely, update the `visibleSearchMatches` source. `useFrameChrome` computes `visibleSearchMatches` from `searchMatches`. Since we're now in displayed-entry space, the `staticHighWaterMark` filter still applies (it's 0 anyway). Pass `displayedSearchMatches` to `useFrameChrome`:

Look at how `searchMatches` flows into `useFrameChrome`. It's passed as a prop. Change:

```typescript
searchMatches: displayedSearchMatches,
```

- [ ] **Step 3: Run typecheck and full test suite**

Run: `npm run typecheck && npm test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/app/shell/AppShell.tsx
git commit -m "fix(search): remap search match indices for split mode

Search matches are computed against the full filteredEntries array
but consumed in displayedFeedEntries space. In split mode, remap
the indices so search highlighting and n/N stepping target the
correct rows."
```

---

### Task 6: Remove Stale filteredEntriesRef

**Files:**

- Modify: `src/app/shell/AppShell.tsx`

After the previous tasks, `filteredEntriesRef` in AppShell should no longer be used by pager, yank, or search. Check if any remaining consumers need it. If not, remove it.

- [ ] **Step 1: Search for remaining filteredEntriesRef usages**

Grep for `filteredEntriesRef` in AppShell. The only remaining consumer should be the `useShellInput` call — but we already changed that to `displayedFeedEntriesRef`. If no consumers remain, remove the ref:

```typescript
// REMOVE these two lines:
// const filteredEntriesRef = useRef(filteredEntries);
// filteredEntriesRef.current = filteredEntries;
```

If any consumer still needs access to the full `filteredEntries` (not the displayed subset), keep it. But based on the analysis, all consumers that used `filteredEntriesRef` have been migrated to `displayedFeedEntriesRef`.

- [ ] **Step 2: Run typecheck and full test suite**

Run: `npm run typecheck && npm test`
Expected: PASS

- [ ] **Step 3: Run linter**

Run: `npm run lint`
Expected: PASS — no unused variables.

- [ ] **Step 4: Commit**

```bash
git add src/app/shell/AppShell.tsx
git commit -m "chore: remove unused filteredEntriesRef"
```

---

### Task 7: Final Verification

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: All tests PASS.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: No errors.

- [ ] **Step 3: Run linter**

Run: `npm run lint`
Expected: No warnings or errors.

- [ ] **Step 4: Run dead code detection**

Run: `npm run lint:dead`
Expected: No new dead code introduced.

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: Clean build, no errors.
