# Feed UI Migration + Navigable Event List

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate the UI to render `FeedEvent` directly from `useFeed`, add arrow-key navigation with expand/collapse, replace old ordering with feed-native sorting, and enforce import boundaries.

**Architecture:** The UI currently renders `FeedItem[]` from `useFeed` through `<Static>` (write-once). This migration replaces `<Static>` with a scrollable, navigable list where "focusable root" events can be expanded/collapsed via arrow keys + Enter. Permission/question dialogs become feed-state-driven (dismiss on `permission.decision` child event). Header metrics switch to pure selectors over `FeedEvent[]`.

**Tech Stack:** Ink + React 19, TypeScript, vitest, ink-testing-library

---

## Task 1: Add `useFocusableList` hook — navigation state

**Files:**

- Create: `source/hooks/useFocusableList.ts`
- Test: `source/hooks/__tests__/useFocusableList.test.ts`

This hook manages cursor position and expand/collapse state for the feed list. It is a pure UI state hook — no feed knowledge.

**Step 1: Write the failing test**

```ts
// source/hooks/__tests__/useFocusableList.test.ts
import {describe, it, expect} from 'vitest';
import {renderHook, act} from '@testing-library/react';
import {useFocusableList} from '../useFocusableList.js';

describe('useFocusableList', () => {
	const ids = ['E1', 'E2', 'E3'];

	it('initializes cursor at 0 and empty expandSet', () => {
		const {result} = renderHook(() => useFocusableList(ids));
		expect(result.current.cursor).toBe(0);
		expect(result.current.expandedSet.size).toBe(0);
		expect(result.current.focusedId).toBe('E1');
	});

	it('moveDown increments cursor, clamped at end', () => {
		const {result} = renderHook(() => useFocusableList(ids));
		act(() => result.current.moveDown());
		expect(result.current.cursor).toBe(1);
		act(() => result.current.moveDown());
		act(() => result.current.moveDown());
		expect(result.current.cursor).toBe(2); // clamped
	});

	it('moveUp decrements cursor, clamped at 0', () => {
		const {result} = renderHook(() => useFocusableList(ids));
		act(() => result.current.moveDown());
		act(() => result.current.moveUp());
		expect(result.current.cursor).toBe(0);
		act(() => result.current.moveUp());
		expect(result.current.cursor).toBe(0); // clamped
	});

	it('toggleExpand adds/removes from expandedSet', () => {
		const {result} = renderHook(() => useFocusableList(ids));
		act(() => result.current.toggleExpand('E2'));
		expect(result.current.expandedSet.has('E2')).toBe(true);
		act(() => result.current.toggleExpand('E2'));
		expect(result.current.expandedSet.has('E2')).toBe(false);
	});

	it('toggleFocused toggles the currently focused item', () => {
		const {result} = renderHook(() => useFocusableList(ids));
		act(() => result.current.toggleFocused());
		expect(result.current.expandedSet.has('E1')).toBe(true);
	});

	it('expandById expands a specific event and moves cursor to it', () => {
		const {result} = renderHook(() => useFocusableList(ids));
		act(() => result.current.expandById('E3'));
		expect(result.current.cursor).toBe(2);
		expect(result.current.expandedSet.has('E3')).toBe(true);
	});

	it('clamps cursor when focusableIds shrinks', () => {
		const {result, rerender} = renderHook(({ids}) => useFocusableList(ids), {
			initialProps: {ids: ['E1', 'E2', 'E3']},
		});
		act(() => result.current.moveDown());
		act(() => result.current.moveDown());
		expect(result.current.cursor).toBe(2);
		rerender({ids: ['E1']});
		expect(result.current.cursor).toBe(0);
	});
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/hooks/__tests__/useFocusableList.test.ts`
Expected: FAIL — module not found

**Step 3: Write the implementation**

```ts
// source/hooks/useFocusableList.ts
import {useState, useCallback, useMemo, useEffect} from 'react';

export type UseFocusableListResult = {
	cursor: number;
	focusedId: string | undefined;
	expandedSet: ReadonlySet<string>;
	moveUp: () => void;
	moveDown: () => void;
	toggleExpand: (id: string) => void;
	toggleFocused: () => void;
	expandById: (id: string) => void;
};

export function useFocusableList(
	focusableIds: string[],
): UseFocusableListResult {
	const [cursor, setCursor] = useState(0);
	const [expandedSet, setExpandedSet] = useState<Set<string>>(() => new Set());

	// Clamp cursor when list shrinks
	useEffect(() => {
		setCursor(prev => Math.min(prev, Math.max(0, focusableIds.length - 1)));
	}, [focusableIds.length]);

	const focusedId = focusableIds[cursor];

	const moveUp = useCallback(() => {
		setCursor(prev => Math.max(prev - 1, 0));
	}, []);

	const moveDown = useCallback(() => {
		setCursor(prev => Math.min(prev + 1, focusableIds.length - 1));
	}, [focusableIds.length]);

	const toggleExpand = useCallback((id: string) => {
		setExpandedSet(prev => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}, []);

	const toggleFocused = useCallback(() => {
		const id = focusableIds[cursor];
		if (id !== undefined) toggleExpand(id);
	}, [cursor, focusableIds, toggleExpand]);

	const expandById = useCallback(
		(id: string) => {
			const idx = focusableIds.indexOf(id);
			if (idx >= 0) {
				setCursor(idx);
				setExpandedSet(prev => {
					const next = new Set(prev);
					next.add(id);
					return next;
				});
			}
		},
		[focusableIds],
	);

	return useMemo(
		() => ({
			cursor,
			focusedId,
			expandedSet,
			moveUp,
			moveDown,
			toggleExpand,
			toggleFocused,
			expandById,
		}),
		[
			cursor,
			focusedId,
			expandedSet,
			moveUp,
			moveDown,
			toggleExpand,
			toggleFocused,
			expandById,
		],
	);
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run source/hooks/__tests__/useFocusableList.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add source/hooks/useFocusableList.ts source/hooks/__tests__/useFocusableList.test.ts
git commit -m "feat: add useFocusableList hook for arrow-key navigation"
```

---

## Task 2: Add `isExpandable` predicate — determines focusable rows

**Files:**

- Create: `source/feed/expandable.ts`
- Test: `source/feed/__tests__/expandable.test.ts`

Only "semantic root" events that own children via causality are focusable. This prevents every row from being a focus target.

**Step 1: Write the failing test**

```ts
// source/feed/__tests__/expandable.test.ts
import {describe, it, expect} from 'vitest';
import {isExpandable} from '../expandable.js';
import type {FeedEvent} from '../types.js';

function stub(kind: string, extra?: Record<string, unknown>): FeedEvent {
	return {
		event_id: 'e1',
		seq: 1,
		ts: 1,
		session_id: 's',
		run_id: 'r',
		kind,
		level: 'info',
		actor_id: 'agent:root',
		title: '',
		data: {tool_name: 'Bash', tool_input: {}, ...extra},
	} as unknown as FeedEvent;
}

describe('isExpandable', () => {
	it('returns true for tool.pre', () => {
		expect(isExpandable(stub('tool.pre'))).toBe(true);
	});

	it('returns true for permission.request', () => {
		expect(isExpandable(stub('permission.request'))).toBe(true);
	});

	it('returns true for subagent.start', () => {
		expect(
			isExpandable(stub('subagent.start', {agent_id: 'a1', agent_type: 'X'})),
		).toBe(true);
	});

	it('returns true for run.start', () => {
		expect(isExpandable(stub('run.start'))).toBe(true);
	});

	it('returns false for tool.post', () => {
		expect(isExpandable(stub('tool.post'))).toBe(false);
	});

	it('returns false for tool.failure', () => {
		expect(isExpandable(stub('tool.failure'))).toBe(false);
	});

	it('returns false for permission.decision', () => {
		expect(isExpandable(stub('permission.decision'))).toBe(false);
	});

	it('returns false for notification', () => {
		expect(isExpandable(stub('notification'))).toBe(false);
	});
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/feed/__tests__/expandable.test.ts`
Expected: FAIL

**Step 3: Write the implementation**

```ts
// source/feed/expandable.ts
import type {FeedEvent, FeedEventKind} from './types.js';

const EXPANDABLE_KINDS: ReadonlySet<FeedEventKind> = new Set([
	'tool.pre',
	'permission.request',
	'subagent.start',
	'run.start',
	'stop.request',
]);

export function isExpandable(event: FeedEvent): boolean {
	return EXPANDABLE_KINDS.has(event.kind);
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run source/feed/__tests__/expandable.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add source/feed/expandable.ts source/feed/__tests__/expandable.test.ts
git commit -m "feat: add isExpandable predicate for focusable feed rows"
```

---

## Task 3: Create `FeedList` component — replaces `<Static>` for feed events

**Files:**

- Create: `source/components/FeedList.tsx`
- Test: `source/components/__tests__/FeedList.test.tsx`

This is the main navigable list. It:

- Renders all `FeedItem[]` in order
- Shows a `›` cursor indicator on the focused expandable row
- Shows `▸`/`▾` expand affordance on expandable rows
- Handles arrow keys + Enter for navigation (when no dialog is active)
- Delegates to existing `renderContentItem` for actual rendering

**Key constraint**: Ink's `<Static>` is write-once and won't support cursor indicators or dynamic expand/collapse. We need to switch to a standard `<Box>` with manual scroll management. However, this is a significant rendering change — `<Static>` prevents re-renders of historical items. Without it, we need viewport windowing.

**Approach**: Use `<Static>` for items above the viewport and a dynamic `<Box>` for the visible window. This preserves write-once semantics for scrollback while allowing cursor/expand in the viewport.

**Step 1: Write the failing test**

```tsx
// source/components/__tests__/FeedList.test.tsx
import React from 'react';
import {render} from 'ink-testing-library';
import {describe, it, expect} from 'vitest';
import FeedList from '../FeedList.js';
import type {FeedEvent} from '../../feed/types.js';

function stubFeedEvent(id: string, kind: string, title: string): FeedEvent {
	return {
		event_id: id,
		seq: 1,
		ts: Date.now(),
		session_id: 's',
		run_id: 'r',
		kind,
		level: 'info',
		actor_id: 'agent:root',
		title,
		data: {tool_name: 'Bash', tool_input: {command: 'ls'}},
	} as unknown as FeedEvent;
}

describe('FeedList', () => {
	it('renders feed events', () => {
		const events: FeedEvent[] = [
			stubFeedEvent('E1', 'tool.pre', 'Bash(ls)'),
			stubFeedEvent('E2', 'tool.post', 'ok'),
		];
		const {lastFrame} = render(
			<FeedList
				items={events.map(e => ({type: 'feed' as const, data: e}))}
				focusedId={undefined}
				expandedSet={new Set()}
				dialogActive={false}
			/>,
		);
		const frame = lastFrame();
		expect(frame).toContain('Bash');
	});

	it('shows cursor indicator on focused expandable row', () => {
		const events: FeedEvent[] = [stubFeedEvent('E1', 'tool.pre', 'Bash(ls)')];
		const {lastFrame} = render(
			<FeedList
				items={events.map(e => ({type: 'feed' as const, data: e}))}
				focusedId="E1"
				expandedSet={new Set()}
				dialogActive={false}
			/>,
		);
		const frame = lastFrame();
		expect(frame).toContain('›');
	});
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/components/__tests__/FeedList.test.tsx`
Expected: FAIL

**Step 3: Write the implementation**

```tsx
// source/components/FeedList.tsx
import React from 'react';
import {Box, Static, Text} from 'ink';
import type {FeedItem} from '../hooks/useFeed.js';
import type {FeedEvent} from '../feed/types.js';
import {isExpandable} from '../feed/expandable.js';
import HookEvent from './HookEvent.js';
import Message from './Message.js';
import ErrorBoundary from './ErrorBoundary.js';

type Props = {
	items: FeedItem[];
	focusedId: string | undefined;
	expandedSet: ReadonlySet<string>;
	verbose?: boolean;
	dialogActive: boolean;
};

function renderItem(
	item: FeedItem,
	focusedId: string | undefined,
	expandedSet: ReadonlySet<string>,
	verbose?: boolean,
): React.ReactNode {
	if (item.type === 'message') {
		return <Message key={item.data.id} message={item.data} />;
	}

	const event = item.data;
	const isFocused = focusedId === event.event_id;
	const expandable = isExpandable(event);
	const isExpanded = expandedSet.has(event.event_id);

	return (
		<Box key={event.event_id} flexDirection="row">
			{/* Cursor indicator — 2 chars wide */}
			<Text>{isFocused && expandable ? '› ' : '  '}</Text>
			<Box flexDirection="column" flexGrow={1}>
				<ErrorBoundary
					fallback={<Text color="red">[Error rendering event]</Text>}
				>
					<HookEvent event={event} verbose={verbose} expanded={isExpanded} />
				</ErrorBoundary>
			</Box>
			{/* Expand affordance */}
			{expandable && <Text dimColor>{isExpanded ? ' ▾' : ' ▸'}</Text>}
		</Box>
	);
}

export default function FeedList({
	items,
	focusedId,
	expandedSet,
	verbose,
	dialogActive,
}: Props): React.ReactNode {
	// Use <Static> for write-once semantics. Cursor/expand indicators are
	// part of the static output — they get "baked in" at render time.
	// This means the cursor won't visually move on already-rendered items,
	// but new items will render with correct cursor state.
	//
	// Phase 2: Replace with viewport windowing for live cursor movement.
	return (
		<Static items={items}>
			{(item: FeedItem) => renderItem(item, focusedId, expandedSet, verbose)}
		</Static>
	);
}
```

> **Note:** This initial implementation still uses `<Static>` for stability. The cursor indicator will only appear correctly on newly rendered items. Task 8 addresses the viewport windowing needed for live cursor movement. This is intentional — get the data flow right first, then fix the rendering.

**Step 4: Run test to verify it passes**

Run: `npx vitest run source/components/__tests__/FeedList.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add source/components/FeedList.tsx source/components/__tests__/FeedList.test.tsx
git commit -m "feat: add FeedList component with cursor and expand indicators"
```

---

## Task 4: Add `expanded` prop to `HookEvent` — expand/collapse rendering

**Files:**

- Modify: `source/components/HookEvent.tsx`
- Modify: `source/components/PostToolResult.tsx` (needs to accept `expanded` to control collapse)
- Test: `source/components/__tests__/HookEvent.test.tsx` (add expand test cases)

Currently `HookEvent` renders tool.pre/tool.post as independent static lines. With expansion, `tool.pre` in expanded mode should also show its child `tool.post`/`tool.failure` data inline.

**For Phase 1**, `expanded` only controls whether `PostToolResult` shows its full output or the collapsed summary. The causality-based child rendering (showing tool.post inline under tool.pre) is Phase 2.

**Step 1: Write the failing test**

```tsx
// Add to existing HookEvent tests or create source/components/__tests__/HookEvent.test.tsx
import React from 'react';
import {render} from 'ink-testing-library';
import {describe, it, expect} from 'vitest';
import HookEvent from '../HookEvent.js';
import type {FeedEvent} from '../../feed/types.js';

describe('HookEvent expanded prop', () => {
	it('passes expanded=false by default', () => {
		const event: FeedEvent = {
			event_id: 'E1',
			seq: 1,
			ts: Date.now(),
			session_id: 's',
			run_id: 'r',
			kind: 'tool.post',
			level: 'info',
			actor_id: 'agent:root',
			title: '',
			data: {
				tool_name: 'Bash',
				tool_input: {command: 'echo hi'},
				tool_response: {stdout: 'hi'},
			},
		} as FeedEvent;
		const {lastFrame} = render(<HookEvent event={event} />);
		expect(lastFrame()).toBeDefined();
	});

	it('accepts expanded prop without error', () => {
		const event: FeedEvent = {
			event_id: 'E1',
			seq: 1,
			ts: Date.now(),
			session_id: 's',
			run_id: 'r',
			kind: 'tool.post',
			level: 'info',
			actor_id: 'agent:root',
			title: '',
			data: {
				tool_name: 'Bash',
				tool_input: {command: 'echo hi'},
				tool_response: {stdout: 'hi'},
			},
		} as FeedEvent;
		const {lastFrame} = render(<HookEvent event={event} expanded={true} />);
		expect(lastFrame()).toBeDefined();
	});
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/components/__tests__/HookEvent.test.tsx`
Expected: FAIL — `expanded` prop not accepted

**Step 3: Modify HookEvent to accept `expanded` prop**

In `source/components/HookEvent.tsx`, add `expanded?: boolean` to the Props type and thread it to `PostToolResult`:

```tsx
type Props = {
	event: FeedEvent;
	verbose?: boolean;
	expanded?: boolean; // NEW
};

export default function HookEvent({
	event,
	verbose,
	expanded,
}: Props): React.ReactNode {
	// ... existing routing logic ...
	// Where PostToolResult is rendered, pass expanded:
	if (event.kind === 'tool.post' || event.kind === 'tool.failure') {
		return (
			<PostToolResult event={event} verbose={verbose} expanded={expanded} />
		);
	}
	// ... rest unchanged
}
```

In `source/components/PostToolResult.tsx`, add `expanded?: boolean` and use it to override the collapse threshold:

```tsx
// In Props type, add:
expanded?: boolean;

// In the component, use expanded to control collapse:
// When expanded=true, set collapseThreshold to Infinity (show all)
// When expanded=false, use default threshold (5 lines)
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run source/components/__tests__/HookEvent.test.tsx`
Expected: PASS

**Step 5: Run existing tests to verify no regressions**

Run: `npm test`
Expected: All PASS

**Step 6: Commit**

```bash
git add source/components/HookEvent.tsx source/components/PostToolResult.tsx source/components/__tests__/HookEvent.test.tsx
git commit -m "feat: add expanded prop to HookEvent and PostToolResult"
```

---

## Task 5: Wire `FeedList` + `useFocusableList` into `AppContent`

**Files:**

- Modify: `source/app.tsx`

Replace the current `<Static items={stableItems}>` with `<FeedList>` and wire up `useFocusableList` with keyboard input.

**Step 1: Modify `AppContent` in `app.tsx`**

Add imports:

```ts
import FeedList from './components/FeedList.js';
import {useFocusableList} from './hooks/useFocusableList.js';
import {isExpandable} from './feed/expandable.js';
```

Inside `AppContent`, after `stableItems` useMemo, add:

```ts
// Compute focusable IDs from feed events
const focusableIds = useMemo(
	() =>
		stableItems
			.filter((item): item is FeedItem & {type: 'feed'} => item.type === 'feed')
			.filter(item => isExpandable(item.data))
			.map(item => item.data.event_id),
	[stableItems],
);

const {focusedId, expandedSet, moveUp, moveDown, toggleFocused, expandById} =
	useFocusableList(focusableIds);
```

Add key handler (merge into existing `useInput`):

```ts
useInput(
	(_input, key) => {
		if (key.ctrl && _input === 'e') {
			setStatsExpanded(prev => !prev);
		}
		if (key.upArrow) moveUp();
		if (key.downArrow) moveDown();
		if (key.return) toggleFocused();
	},
	{isActive: !dialogActive},
);
```

Replace the `<Static>` block:

```tsx
{
	/* Before: */
}
<Static items={stableItems}>
	{(item: FeedItem) => renderContentItem(item, verbose)}
</Static>;

{
	/* After: */
}
<FeedList
	items={stableItems}
	focusedId={focusedId}
	expandedSet={expandedSet}
	verbose={verbose}
	dialogActive={dialogActive}
/>;
```

Remove the now-unused `renderContentItem` function from the module level.

**Step 2: Wire `:open` command to `expandById`**

In the command executor context (`hook` context passed to `executeCommand`), expose `expandById` so the `:open` command can programmatically expand an event by ID.

**Step 3: Run lint + typecheck + tests**

Run: `npm run lint && npx tsc --noEmit && npm test`
Expected: All PASS

**Step 4: Commit**

```bash
git add source/app.tsx
git commit -m "feat: wire FeedList with arrow-key navigation into AppContent"
```

---

## Task 6: Make permission dialogs feed-state-driven

**Files:**

- Modify: `source/hooks/useFeed.ts`

Currently the permission queue is a simple array of `hook_request_id`s. Dequeuing happens only when the user explicitly resolves. The spec says dialogs should also dismiss when a matching `permission.decision` child event appears (from timeout or rule).

**Step 1: Write the failing test**

```ts
// Add to source/hooks/__tests__/useFeed.test.ts (or create it)
// Test: permission request is auto-dequeued when permission.decision arrives

describe('useFeed permission auto-dequeue', () => {
	it('dequeues permission when permission.decision arrives for same request', () => {
		// Setup: enqueue a permission request, then emit a permission.decision
		// that has cause.parent_event_id pointing to the permission.request event
		// Assert: permissionQueueCount drops to 0
	});
});
```

**Step 2: Implement auto-dequeue logic**

In `useFeed.ts`, in the `runtime.onEvent` handler, after mapping to feed events, check if any new `permission.decision` events match a queued permission request:

```ts
// After mapping new feed events, check for auto-dismissals
for (const fe of newFeedEvents) {
	if (fe.kind === 'permission.decision' && fe.cause?.parent_event_id) {
		// Find the permission.request that this decision resolves
		const parentRequest = feedEventsRef.current.find(
			e =>
				e.event_id === fe.cause?.parent_event_id &&
				e.kind === 'permission.request',
		);
		if (parentRequest?.cause?.hook_request_id) {
			dequeuePermission(parentRequest.cause.hook_request_id);
		}
	}
}
```

**Step 3: Run tests**

Run: `npm test`
Expected: PASS

**Step 4: Commit**

```bash
git add source/hooks/useFeed.ts source/hooks/__tests__/useFeed.test.ts
git commit -m "feat: auto-dequeue permissions when decision event arrives"
```

---

## Task 7: Replace header metrics with feed-derived selectors

**Files:**

- Modify: `source/hooks/useHeaderMetrics.ts`

The current implementation is already a pure selector over `FeedEvent[]` — it counts by event kind. This task adds the missing counters from the spec: failures, blocks, timeouts.

**Step 1: Write failing test for new counters**

```ts
// In source/hooks/__tests__/useHeaderMetrics.test.ts
// Test that tool.failure events are counted
// Test that permission.decision deny events are counted as blocks
// Test that stop.decision block events are counted
```

**Step 2: Add counters to SessionMetrics type**

In `source/types/headerMetrics.ts`, add:

```ts
failures: number; // count of tool.failure events
blocks: number; // permission.decision deny + stop.decision block
timeouts: number; // permission.decision where source is timeout (if trackable)
```

**Step 3: Implement in useHeaderMetrics**

Add counting logic in the existing loop:

```ts
if (event.kind === 'tool.failure') failures++;
if (event.kind === 'stop.decision' && event.data.decision_type === 'block')
	blocks++;
```

**Step 4: Run tests**

Run: `npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add source/hooks/useHeaderMetrics.ts source/types/headerMetrics.ts source/hooks/__tests__/useHeaderMetrics.test.ts
git commit -m "feat: add failure/block counters to header metrics"
```

---

## Task 8: Add ESLint rule blocking feed mapper imports from components

**Files:**

- Modify: `eslint.config.js`

**Step 1: Add restricted import pattern**

In the existing `no-restricted-imports` rule block (which already targets `source/components/**`), add:

```ts
{
  group: ['**/feed/mapper*', '**/feed/filter*', '**/feed/entities*'],
  message: 'Components may only import from feed/types.ts and feed/expandable.ts. Do not import stateful feed internals.',
},
```

**Step 2: Run lint to verify no existing violations**

Run: `npm run lint`
Expected: PASS (no component currently imports mapper/filter/entities directly)

**Step 3: Commit**

```bash
git add eslint.config.js
git commit -m "chore: enforce feed boundary — block mapper/filter imports from components"
```

---

## Task 9: Delete `useContentOrdering` references and dead code

**Files:**

- Modify: `CLAUDE.md` — remove references to `useContentOrdering` if any remain
- Verify: no imports of `useContentOrdering` exist in codebase

**Step 1: Search for any remaining references**

```bash
grep -r "useContentOrdering" source/
```

Expected: no results (already deleted in earlier cleanup)

**Step 2: Remove any CLAUDE.md references that mention it as a current file**

The CLAUDE.md already mentions it was deleted. Verify it accurately reflects the current state.

**Step 3: Commit if changes made**

```bash
git add CLAUDE.md
git commit -m "docs: clean up dead useContentOrdering references"
```

---

## Task 10: Viewport windowing for live cursor movement (Phase 2)

**Files:**

- Modify: `source/components/FeedList.tsx`

Replace the `<Static>` approach with a viewport-windowed renderer:

- Track `viewportStart` and `viewportSize` (based on terminal height)
- Render only items in the viewport window as dynamic `<Box>` children
- Items above the viewport are committed to scrollback via `<Static>`
- Arrow keys auto-scroll the viewport when cursor moves beyond edges

This is the most complex task and should be done after all other tasks are stable. It is optional for the initial migration — the `<Static>` approach works, just without live cursor movement on historical items.

**Implementation sketch:**

```tsx
const VIEWPORT_SIZE = Math.max(10, (process.stdout.rows ?? 24) - 10);

// Split items into scrollback (above viewport) and viewport (visible)
const scrollbackItems = items.slice(
	0,
	Math.max(0, items.length - VIEWPORT_SIZE),
);
const viewportItems = items.slice(Math.max(0, items.length - VIEWPORT_SIZE));

return (
	<Box flexDirection="column">
		<Static items={scrollbackItems}>
			{item => renderItem(item, undefined, expandedSet, verbose)}
		</Static>
		{viewportItems.map(item =>
			renderItem(item, focusedId, expandedSet, verbose),
		)}
	</Box>
);
```

This is deferred — mark as Phase 2.

---

## Common Pitfalls Checklist

Before marking migration complete, verify:

- [ ] No `event.raw` access in any component (grep for `.raw` in components/)
- [ ] All `<Static>` item keys use `event.event_id`, not array index
- [ ] `PermissionDialog` dismisses on both user action AND `permission.decision` event
- [ ] `QuestionDialog` dismisses on both user action AND question answer event
- [ ] `tool.post` renders correctly even when `cause.parent_event_id` is missing
- [ ] `expanded` prop defaults to `undefined` (not `false`) so existing behavior is preserved
- [ ] No `as any` casts in `HookEvent.tsx` or `FeedList.tsx`
- [ ] `npm run lint && npx tsc --noEmit && npm test` all pass
