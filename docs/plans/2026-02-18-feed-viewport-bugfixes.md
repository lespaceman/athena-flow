# Feed Viewport Bugfixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix three bugs found during code review: unbounded expand output, dead PostToolResult expanded branch, and width overflow in FeedList rows.

**Architecture:** Three independent, surgical fixes. Each touches 1-2 source files + tests. No new abstractions — just adding a line-cap constant, removing dead code, and threading a `parentWidth` prop through the existing layout system.

**Tech Stack:** React/Ink, TypeScript, vitest, ink-testing-library

---

### Task 1: Cap expanded JSON output in UnifiedToolCallEvent

**Problem:** When a `tool.pre` row is expanded, `JSON.stringify(toolInput, null, 2)` is dumped with no line limit. A large tool input (e.g., a Bash command writing a 500-line file) floods the viewport.

**Files:**

- Modify: `source/components/UnifiedToolCallEvent.tsx:54-58`
- Modify: `source/utils/truncate.ts` (if `truncateBlock` doesn't exist yet, add it)
- Test: `source/components/__tests__/UnifiedToolCallEvent.test.tsx` (create)

**Step 1: Write the failing test**

Create `source/components/__tests__/UnifiedToolCallEvent.test.tsx`:

```tsx
import React from 'react';
import {render} from 'ink-testing-library';
import {describe, it, expect} from 'vitest';
import UnifiedToolCallEvent from '../UnifiedToolCallEvent.js';
import type {FeedEvent} from '../../feed/types.js';

function stubToolPre(toolInput: Record<string, unknown>): FeedEvent {
	return {
		event_id: 'E1',
		seq: 1,
		ts: Date.now(),
		session_id: 's',
		run_id: 'r',
		kind: 'tool.pre',
		level: 'info',
		actor_id: 'agent:root',
		title: 'Bash(cmd)',
		data: {tool_name: 'Bash', tool_input: toolInput},
	} as unknown as FeedEvent;
}

describe('UnifiedToolCallEvent', () => {
	it('caps expanded JSON output to MAX_EXPANDED_LINES', () => {
		// Create input that produces >50 lines of JSON
		const bigInput: Record<string, string> = {};
		for (let i = 0; i < 100; i++) {
			bigInput[`key_${i}`] = `value_${i}`;
		}
		const event = stubToolPre(bigInput);

		const {lastFrame} = render(
			<UnifiedToolCallEvent event={event} expanded={true} />,
		);
		const frame = lastFrame() ?? '';
		const lines = frame.split('\n');

		// Should contain truncation indicator
		expect(frame).toContain('more lines');
		// Total lines should be well under 100 (header + capped JSON + truncation msg)
		expect(lines.length).toBeLessThan(60);
	});

	it('shows full JSON when within line limit', () => {
		const event = stubToolPre({command: 'ls -la'});

		const {lastFrame} = render(
			<UnifiedToolCallEvent event={event} expanded={true} />,
		);
		const frame = lastFrame() ?? '';
		expect(frame).not.toContain('more lines');
		expect(frame).toContain('ls -la');
	});
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/components/__tests__/UnifiedToolCallEvent.test.tsx`
Expected: FAIL — the first test fails because there's no line cap yet.

**Step 3: Implement the fix**

In `source/components/UnifiedToolCallEvent.tsx`, add a line cap to the expanded JSON block:

```tsx
// At top of file, add constant:
const MAX_EXPANDED_LINES = 40;

// Replace lines 54-58 with:
{
	(verbose || expanded) &&
		(() => {
			const jsonStr = JSON.stringify(toolInput, null, 2);
			const allLines = jsonStr.split('\n');
			const truncated = allLines.length > MAX_EXPANDED_LINES;
			const displayLines = truncated
				? allLines.slice(0, MAX_EXPANDED_LINES)
				: allLines;
			const omitted = allLines.length - displayLines.length;
			return (
				<Box paddingLeft={3} flexDirection="column">
					<Text dimColor>{displayLines.join('\n')}</Text>
					{truncated && <Text dimColor>({omitted} more lines)</Text>}
				</Box>
			);
		})();
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run source/components/__tests__/UnifiedToolCallEvent.test.tsx`
Expected: PASS

**Step 5: Run lint + typecheck**

Run: `npm run lint && npx tsc --noEmit`
Expected: PASS

**Step 6: Commit**

```bash
git add source/components/UnifiedToolCallEvent.tsx source/components/__tests__/UnifiedToolCallEvent.test.tsx
git commit -m "fix: cap expanded JSON output in UnifiedToolCallEvent to 40 lines"
```

---

### Task 2: Remove dead `expanded` branch from PostToolResult

**Problem:** `PostToolResult` accepts an `expanded` prop and uses it to set `collapseThreshold={expanded ? Infinity : undefined}`. But `tool.post` and `tool.failure` are not in `EXPANDABLE_KINDS`, so `expanded` is always `false` — this code path is dead.

**Decision:** Remove the dead code rather than adding `tool.post` to expandable kinds. Tool results already have their own collapse/expand mechanism via `:open <toolId>`. Adding them to the focus-navigate list would clutter it.

**Files:**

- Modify: `source/components/PostToolResult.tsx:9-13,50`
- Test: `source/components/__tests__/PostToolResult.test.tsx` (create)

**Step 1: Write the test confirming current behavior**

Create `source/components/__tests__/PostToolResult.test.tsx`:

```tsx
import React from 'react';
import {render} from 'ink-testing-library';
import {describe, it, expect} from 'vitest';
import PostToolResult from '../PostToolResult.js';
import type {FeedEvent} from '../../feed/types.js';

function stubToolPost(): FeedEvent {
	return {
		event_id: 'E1',
		seq: 1,
		ts: Date.now(),
		session_id: 's',
		run_id: 'r',
		kind: 'tool.post',
		level: 'info',
		actor_id: 'agent:root',
		title: 'Bash result',
		data: {
			tool_name: 'Bash',
			tool_input: {command: 'echo hello'},
			tool_response: {stdout: 'hello', stderr: '', exitCode: 0},
			tool_use_id: 't1',
		},
	} as unknown as FeedEvent;
}

describe('PostToolResult', () => {
	it('renders tool result without expanded prop', () => {
		const event = stubToolPost();
		const {lastFrame} = render(<PostToolResult event={event} />);
		const frame = lastFrame() ?? '';
		expect(frame).toContain('hello');
	});

	it('does not accept expanded prop after cleanup', () => {
		// Type-level check: PostToolResult should no longer have expanded in Props
		// This test just ensures it renders correctly without the prop
		const event = stubToolPost();
		const {lastFrame} = render(
			<PostToolResult event={event} verbose={false} />,
		);
		expect(lastFrame()).toContain('hello');
	});
});
```

**Step 2: Run test to confirm it passes with current code**

Run: `npx vitest run source/components/__tests__/PostToolResult.test.tsx`
Expected: PASS (confirming baseline)

**Step 3: Remove the dead code**

In `source/components/PostToolResult.tsx`:

1. Remove `expanded` from the Props type (line 12):

```tsx
type Props = {
	event: FeedEvent;
	verbose?: boolean;
};
```

2. Remove `expanded` from the destructured props (line 18):

```tsx
export default function PostToolResult({
	event,
	verbose,
}: Props): React.ReactNode {
```

3. Remove the `expanded` ternary on line 50, hardcode `undefined`:

```tsx
collapseThreshold = {undefined};
```

Actually, since `undefined` is the default for `collapseThreshold`, just remove the prop entirely:

```tsx
<ToolResultContainer
	previewLines={outputMeta?.previewLines}
	totalLineCount={outputMeta?.totalLineCount}
	toolId={event.data.tool_use_id}
>
```

4. Update `HookEvent.tsx` to stop passing `expanded` to PostToolResult (if it does). Check:

**Step 4: Update HookEvent.tsx caller**

In `source/components/HookEvent.tsx`, find where `PostToolResult` is called and remove the `expanded` prop.

**Step 5: Run tests**

Run: `npx vitest run source/components/__tests__/PostToolResult.test.tsx`
Expected: PASS

**Step 6: Run lint + typecheck**

Run: `npm run lint && npx tsc --noEmit`
Expected: PASS — typecheck will catch any remaining callers passing `expanded` to PostToolResult.

**Step 7: Commit**

```bash
git add source/components/PostToolResult.tsx source/components/HookEvent.tsx source/components/__tests__/PostToolResult.test.tsx
git commit -m "fix: remove dead expanded branch from PostToolResult"
```

---

### Task 3: Fix width overflow — account for FeedList row gutter

**Problem:** FeedList wraps each item in a row with a 2-char cursor indicator on the left (`'› '` or `'  '`) and a 2-char expand affordance on the right (` ▸`/` ▾`). Neither `UnifiedToolCallEvent` nor `ToolResultContainer` accounts for these 4 chars when computing `availableWidth` from `process.stdout.columns`.

**Solution:** Export a `FEEDLIST_ROW_OVERHEAD` constant from `FeedList.tsx` and pass `parentWidth={terminalWidth - FEEDLIST_ROW_OVERHEAD}` through `HookEvent` to child components. This follows the existing pattern where `SubagentEvent` passes `parentWidth` to `ToolResultContainer`.

**Files:**

- Modify: `source/components/FeedList.tsx:19-49` — export constant, pass `parentWidth` to `HookEvent`
- Modify: `source/components/HookEvent.tsx` — accept and forward `parentWidth`
- Modify: `source/components/UnifiedToolCallEvent.tsx:34-37` — use `parentWidth` instead of `process.stdout.columns`
- Modify: `source/components/PostToolResult.tsx` — pass `parentWidth` to `ToolResultContainer`
- Test: `source/components/__tests__/FeedList.test.tsx` (add test)

**Step 1: Write the failing test**

Add to `source/components/__tests__/FeedList.test.tsx`:

```tsx
it('passes parentWidth accounting for row gutter overhead', () => {
	// This is a structural test: we verify that HookEvent receives parentWidth
	// by checking that content doesn't overflow.
	// For now, we verify the constant is exported and correct.
	const {FEEDLIST_ROW_OVERHEAD} = await import('../FeedList.js');
	// 2 chars cursor left + 2 chars affordance right
	expect(FEEDLIST_ROW_OVERHEAD).toBe(4);
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/components/__tests__/FeedList.test.tsx`
Expected: FAIL — `FEEDLIST_ROW_OVERHEAD` is not exported yet.

**Step 3: Implement the fix**

In `source/components/FeedList.tsx`:

1. Add and export the constant:

```tsx
// Cursor indicator (2 chars: "› " or "  ") + expand affordance (2 chars: " ▸" or " ▾")
export const FEEDLIST_ROW_OVERHEAD = 4;
```

2. Update `renderItem` to accept and pass `parentWidth`:

```tsx
function renderItem(
	item: FeedItem,
	focusedId: string | undefined,
	expandedSet: ReadonlySet<string>,
	verbose?: boolean,
	parentWidth?: number,
): React.ReactNode {
	// ... message branch unchanged ...
	return (
		<Box key={event.event_id} flexDirection="row">
			<Text>{isFocused && expandable ? '› ' : '  '}</Text>
			<Box flexDirection="column" flexGrow={1}>
				<ErrorBoundary
					fallback={<Text color="red">[Error rendering event]</Text>}
				>
					<HookEvent
						event={event}
						verbose={verbose}
						expanded={expandedSet.has(event.event_id)}
						parentWidth={parentWidth}
					/>
				</ErrorBoundary>
			</Box>
			{expandable && (
				<Text dimColor>{expandedSet.has(event.event_id) ? ' ▾' : ' ▸'}</Text>
			)}
		</Box>
	);
}
```

3. In the `FeedList` component, compute and pass `parentWidth`:

```tsx
const terminalWidth = stdout?.columns ?? 80;
const contentWidth = terminalWidth - FEEDLIST_ROW_OVERHEAD;
```

Pass `contentWidth` as the last arg to `renderItem` in both the `<Static>` and viewport calls.

4. In `source/components/HookEvent.tsx`, accept `parentWidth` and forward it to `UnifiedToolCallEvent` and `PostToolResult`.

5. In `source/components/UnifiedToolCallEvent.tsx`, replace `process.stdout.columns ?? 80` with the `parentWidth` prop:

```tsx
type Props = {
	event: FeedEvent;
	verbose?: boolean;
	expanded?: boolean;
	parentWidth?: number;
};

// In the component:
const terminalWidth = parentWidth ?? process.stdout.columns ?? 80;
```

6. In `source/components/PostToolResult.tsx`, pass `parentWidth` to `ToolResultContainer`:

```tsx
type Props = {
	event: FeedEvent;
	verbose?: boolean;
	parentWidth?: number;
};

// In the component:
<ToolResultContainer
	previewLines={outputMeta?.previewLines}
	totalLineCount={outputMeta?.totalLineCount}
	toolId={event.data.tool_use_id}
	parentWidth={parentWidth}
>
```

**Step 4: Run tests**

Run: `npx vitest run source/components/__tests__/FeedList.test.tsx`
Expected: PASS

**Step 5: Run full test suite + lint + typecheck**

Run: `npm test && npm run lint && npx tsc --noEmit`
Expected: PASS

**Step 6: Commit**

```bash
git add source/components/FeedList.tsx source/components/HookEvent.tsx source/components/UnifiedToolCallEvent.tsx source/components/PostToolResult.tsx source/components/__tests__/FeedList.test.tsx
git commit -m "fix: account for FeedList row gutter in content width calculations"
```

---

### Task 4: Final verification

**Step 1: Run full test suite**

Run: `npm test`
Expected: All tests pass

**Step 2: Run lint + typecheck**

Run: `npm run lint && npx tsc --noEmit`
Expected: Clean

**Step 3: Build**

Run: `npm run build`
Expected: Clean build
