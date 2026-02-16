# Static Feed Phase 2: Independent Events — No Pairing

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate PreToolUse↔PostToolUse pairing so every hook event is its own independent static line. No merging, no waiting, no `dynamicItem`.

**Architecture:** Every event goes directly to `stableItems` immediately (no completeness checks). PreToolUse renders as `● Tool(params)`, PostToolUse renders as `⎿ result` — two separate lines. Remove `isItemComplete`, `dynamicItem`, `postToolEvent` field, and the entire pairing state machine. Create a `PostToolResult` component for standalone PostToolUse rendering.

**Tech Stack:** Ink `<Static>`, React, TypeScript, vitest

---

## What Gets Removed

- `isItemComplete()` function and all references
- `dynamicItem` from `UseContentOrderingResult` and `app.tsx`
- `postToolEvent` field from `HookEventDisplay`
- The entire PreToolUse↔PostToolUse pairing logic (Pass 1 & Pass 2 in `useContentOrdering`)
- `pairedPostIds` filtering logic
- `resolvePostPayload()` in `UnifiedToolCallEvent.tsx`
- `isPending` / "Running…" state in `UnifiedToolCallEvent.tsx`

## What Gets Created

- `PostToolResult` component — renders standalone PostToolUse/PostToolUseFailure as `⎿ result`

---

### Task 1: Create PostToolResult component

**Files:**

- Create: `source/components/PostToolResult.tsx`
- Test: `source/components/PostToolResult.test.tsx`

**Step 1: Write failing test**

```tsx
// source/components/PostToolResult.test.tsx
/** @vitest-environment jsdom */
import {describe, it, expect} from 'vitest';
import React from 'react';
import {render} from 'ink-testing-library';
import PostToolResult from './PostToolResult.js';
import {ThemeProvider, defaultTheme} from '../theme/index.js';
import type {HookEventDisplay} from '../types/hooks/index.js';

function makePostEvent(
	overrides: Partial<HookEventDisplay> = {},
): HookEventDisplay {
	return {
		id: 'post-1',
		timestamp: new Date(),
		hookName: 'PostToolUse',
		toolName: 'Bash',
		payload: {
			hook_event_name: 'PostToolUse',
			session_id: 's1',
			transcript_path: '/tmp/t.jsonl',
			cwd: '/project',
			tool_name: 'Bash',
			tool_input: {command: 'echo hi'},
			tool_response: {stdout: 'hi\n', stderr: '', exitCode: 0},
		},
		status: 'passthrough',
		...overrides,
	};
}

describe('PostToolResult', () => {
	it('renders tool output for PostToolUse events', () => {
		const event = makePostEvent();
		const {lastFrame} = render(
			<ThemeProvider value={defaultTheme}>
				<PostToolResult event={event} />
			</ThemeProvider>,
		);
		expect(lastFrame()).toBeTruthy();
	});

	it('renders error text for PostToolUseFailure events', () => {
		const event = makePostEvent({
			hookName: 'PostToolUseFailure',
			payload: {
				hook_event_name: 'PostToolUseFailure',
				session_id: 's1',
				transcript_path: '/tmp/t.jsonl',
				cwd: '/project',
				tool_name: 'Bash',
				tool_input: {command: 'bad'},
				error: 'command not found',
			},
		});
		const {lastFrame} = render(
			<ThemeProvider value={defaultTheme}>
				<PostToolResult event={event} />
			</ThemeProvider>,
		);
		expect(lastFrame()).toContain('command not found');
	});

	it('returns null for non-PostToolUse events', () => {
		const event = makePostEvent({
			hookName: 'PreToolUse',
			payload: {
				hook_event_name: 'PreToolUse',
				session_id: 's1',
				transcript_path: '/tmp/t.jsonl',
				cwd: '/project',
				tool_name: 'Bash',
				tool_input: {command: 'echo'},
			},
		});
		const {lastFrame} = render(
			<ThemeProvider value={defaultTheme}>
				<PostToolResult event={event} />
			</ThemeProvider>,
		);
		expect(lastFrame()).toBe('');
	});
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/components/PostToolResult.test.tsx`
Expected: FAIL — module not found

**Step 3: Create PostToolResult component**

```tsx
// source/components/PostToolResult.tsx
import React from 'react';
import {Box} from 'ink';
import {Text} from 'ink';
import {
	type HookEventDisplay,
	type PostToolUseEvent,
	isPostToolUseEvent,
	isPostToolUseFailureEvent,
} from '../types/hooks/index.js';
import {
	getStatusColors,
	getPostToolText,
	StderrBlock,
} from './hookEventUtils.js';
import {ToolOutputRenderer, ToolResultContainer} from './ToolOutput/index.js';
import {extractToolOutput} from '../utils/toolExtractors.js';
import {useTheme} from '../theme/index.js';

type Props = {
	event: HookEventDisplay;
	verbose?: boolean;
	isNested?: boolean;
};

export default function PostToolResult({
	event,
	verbose,
	isNested,
}: Props): React.ReactNode {
	const theme = useTheme();
	const statusColors = getStatusColors(theme);
	const payload = event.payload;

	if (!isPostToolUseEvent(payload) && !isPostToolUseFailureEvent(payload)) {
		return null;
	}

	const toolName = (payload as {tool_name: string}).tool_name;
	const toolInput = (payload as {tool_input: Record<string, unknown>})
		.tool_input;
	const isFailed = isPostToolUseFailureEvent(payload);

	if (isFailed) {
		const errorText = getPostToolText(payload) || 'Unknown error';
		return (
			<Box flexDirection="column" paddingLeft={isNested ? 2 : 0}>
				<ToolResultContainer
					gutterColor={statusColors.blocked}
					dimGutter={false}
				>
					<Text color={statusColors.blocked}>{errorText}</Text>
				</ToolResultContainer>
				<StderrBlock result={event.result} />
			</Box>
		);
	}

	const outputMeta = isPostToolUseEvent(payload)
		? extractToolOutput(
				toolName,
				toolInput,
				(payload as PostToolUseEvent).tool_response,
			)
		: null;

	return (
		<Box flexDirection="column" paddingLeft={isNested ? 2 : 0}>
			<ToolResultContainer
				previewLines={outputMeta?.previewLines}
				totalLineCount={outputMeta?.totalLineCount}
				toolId={event.toolUseId}
			>
				{availableWidth => (
					<ToolOutputRenderer
						toolName={toolName}
						toolInput={toolInput}
						toolResponse={
							isPostToolUseEvent(payload)
								? (payload as PostToolUseEvent).tool_response
								: undefined
						}
						availableWidth={availableWidth}
					/>
				)}
			</ToolResultContainer>
			{verbose && (
				<Box paddingLeft={3}>
					<Text dimColor>{getPostToolText(payload)}</Text>
				</Box>
			)}
			<StderrBlock result={event.result} />
		</Box>
	);
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run source/components/PostToolResult.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add source/components/PostToolResult.tsx source/components/PostToolResult.test.tsx
git commit -m "feat: add PostToolResult component for standalone post-tool rendering"
```

---

### Task 2: Route PostToolUse/PostToolUseFailure to PostToolResult in HookEvent

**Files:**

- Modify: `source/components/HookEvent.tsx`
- Test: `source/components/HookEvent.test.tsx`

**Step 1: Write failing test**

Add test that PostToolUse events render via PostToolResult (not UnifiedToolCallEvent):

```tsx
it('renders PostToolUse via PostToolResult', () => {
	const event = makeEvent({
		hookName: 'PostToolUse',
		toolName: 'Bash',
		status: 'passthrough',
		payload: {
			hook_event_name: 'PostToolUse',
			session_id: 's1',
			transcript_path: '/tmp/t.jsonl',
			cwd: '/project',
			tool_name: 'Bash',
			tool_input: {command: 'echo hi'},
			tool_response: {stdout: 'hi', stderr: '', exitCode: 0},
		},
	});
	const {lastFrame} = render(
		<ThemeProvider value={defaultTheme}>
			<HookEvent event={event} />
		</ThemeProvider>,
	);
	// Should render tool output, not a bullet line
	expect(lastFrame()).toBeTruthy();
});
```

**Step 2: Run test to verify current behavior**

Run: `npx vitest run source/components/HookEvent.test.tsx`

**Step 3: Split PostToolUse routing from PreToolUse in HookEvent.tsx**

Replace the unified PreToolUse/PostToolUse block (lines 59-72) with:

```tsx
import PostToolResult from './PostToolResult.js';

// PreToolUse/PermissionRequest → tool call header (● Tool params)
if (isPreToolUseEvent(payload) || isPermissionRequestEvent(payload)) {
	return (
		<UnifiedToolCallEvent
			event={event}
			verbose={verbose}
			isNested={Boolean(event.parentSubagentId)}
		/>
	);
}

// PostToolUse/PostToolUseFailure → standalone result (⎿ output)
if (isPostToolUseEvent(payload) || isPostToolUseFailureEvent(payload)) {
	return (
		<PostToolResult
			event={event}
			verbose={verbose}
			isNested={Boolean(event.parentSubagentId)}
		/>
	);
}
```

**Step 4: Run tests**

Run: `npx vitest run source/components/HookEvent.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add source/components/HookEvent.tsx source/components/HookEvent.test.tsx
git commit -m "feat: route PostToolUse to PostToolResult, separate from PreToolUse"
```

---

### Task 3: Strip UnifiedToolCallEvent of all post-tool and pending logic

**Files:**

- Modify: `source/components/UnifiedToolCallEvent.tsx`
- Test: `source/components/UnifiedToolCallEvent.test.tsx`

**Step 1: Update tests — remove expectations about postToolEvent merging**

In `UnifiedToolCallEvent.test.tsx`, remove or update any tests that pass `postToolEvent` on the event or expect "Running…" text. PreToolUse now ONLY renders the `● Tool(params)` header line. The tool result is a separate PostToolResult component.

**Step 2: Simplify UnifiedToolCallEvent**

Remove:

- `resolvePostPayload()` function
- `isPostPayload()` function
- `isPending` logic (lines 71-76)
- All `resolvedPost` / `outputMeta` / `responseNode` branches for completed/failed results
- The `event.postToolEvent` StderrBlock

The component becomes a simple header renderer:

```tsx
import React from 'react';
import {Box, Text} from 'ink';
import {
	type HookEventDisplay,
	isPreToolUseEvent,
	isPermissionRequestEvent,
} from '../types/hooks/index.js';
import {parseToolName, formatInlineParams} from '../utils/toolNameParser.js';
import {truncateLine} from '../utils/truncate.js';
import {getStatusColors, StderrBlock} from './hookEventUtils.js';
import {useTheme} from '../theme/index.js';

type Props = {
	event: HookEventDisplay;
	verbose?: boolean;
	isNested?: boolean;
};

const BULLET = '\u25cf'; // ●

export default function UnifiedToolCallEvent({
	event,
	verbose,
	isNested,
}: Props): React.ReactNode {
	const theme = useTheme();
	const statusColors = getStatusColors(theme);
	const payload = event.payload;

	if (!isPreToolUseEvent(payload) && !isPermissionRequestEvent(payload))
		return null;

	const toolName = (payload as {tool_name: string}).tool_name;
	const toolInput = (payload as {tool_input: Record<string, unknown>})
		.tool_input;

	const parsed = parseToolName(toolName);
	const inlineParams = formatInlineParams(toolInput);

	const terminalWidth = process.stdout.columns ?? 80;
	const bulletWidth = 2;
	const nameWidth = parsed.displayName.length;
	const availableForParams = terminalWidth - bulletWidth - nameWidth;
	const truncatedParams = truncateLine(
		inlineParams,
		Math.max(availableForParams, 10),
	);

	const bulletColor =
		event.status === 'blocked'
			? statusColors.blocked
			: statusColors.passthrough;

	return (
		<Box flexDirection="column" paddingLeft={isNested ? 2 : 0}>
			<Box>
				<Text color={bulletColor}>{BULLET} </Text>
				<Text color={bulletColor} bold>
					{parsed.displayName}
				</Text>
				<Text dimColor>{truncatedParams}</Text>
			</Box>
			{verbose && (
				<Box paddingLeft={3}>
					<Text dimColor>{JSON.stringify(toolInput, null, 2)}</Text>
				</Box>
			)}
			{event.status === 'blocked' && (
				<Box paddingLeft={3}>
					<Text color={statusColors.blocked}>User rejected</Text>
				</Box>
			)}
			<StderrBlock result={event.result} />
		</Box>
	);
}
```

**Step 3: Run tests**

Run: `npx vitest run source/components/UnifiedToolCallEvent.test.tsx`
Expected: PASS

**Step 4: Commit**

```bash
git add source/components/UnifiedToolCallEvent.tsx source/components/UnifiedToolCallEvent.test.tsx
git commit -m "refactor: strip UnifiedToolCallEvent to header-only, no post-tool logic"
```

---

### Task 4: Remove pairing logic and dynamicItem from useContentOrdering

**Files:**

- Modify: `source/hooks/useContentOrdering.ts`
- Test: `source/hooks/useContentOrdering.test.ts`

**Step 1: Update tests**

- Remove the entire `describe('tool event pairing')` block (tests for merging PostToolUse onto PreToolUse)
- Remove `describe('stable/dynamic split')` tests for `dynamicItem` — everything is now stable
- Update tests that check `dynamicItem` to expect `null` always
- Update tests that check for paired PostToolUse being hidden — PostToolUse now appears as its own item
- Add test: PostToolUse for non-Task tools appears in stream (was previously hidden when paired)

**Step 2: Rewrite useContentOrdering — remove all pairing**

The new hook becomes dramatically simpler:

```typescript
export function useContentOrdering({
	messages,
	events,
}: UseContentOrderingOptions): UseContentOrderingResult {
	// Convert SessionEnd events into synthetic assistant messages
	const sessionEndMessages: ContentItem[] = events
		.filter(
			e =>
				e.hookName === 'SessionEnd' && e.transcriptSummary?.lastAssistantText,
		)
		.map(e => ({
			type: 'message' as const,
			data: {
				id: `session-end-${e.id}`,
				role: 'assistant' as const,
				content: e.transcriptSummary!.lastAssistantText!,
				timestamp: e.timestamp,
			},
		}));

	const hookItems: ContentItem[] = events
		.filter(e => !shouldExcludeFromMainStream(e))
		.map(e => ({type: 'hook' as const, data: e}));

	const tasks = aggregateTaskEvents(events);

	const stableItems: ContentItem[] = [
		...messages.map(m => ({type: 'message' as const, data: m})),
		...hookItems,
		...sessionEndMessages,
	].sort((a, b) => getItemTime(a) - getItemTime(b));

	return {stableItems, tasks};
}
```

**Step 3: Update UseContentOrderingResult type**

```typescript
type UseContentOrderingResult = {
	/** All items — immediately stable, render once via Ink <Static>. */
	stableItems: ContentItem[];
	/** Aggregated task list. */
	tasks: TodoItem[];
};
```

**Step 4: Remove `isItemComplete` export and function**

Delete the entire `isItemComplete` function.

**Step 5: Update shouldExcludeFromMainStream**

Remove the exclusion of PostToolUse for non-Task tools. The PostToolUse for Task should still be excluded (SubagentStop shows it). Keep exclusions for:

- `SessionEnd` (rendered as synthetic messages)
- `PostToolUse` for `Task` tool
- Task management tools (TaskCreate, TaskUpdate, etc.)

**Step 6: Run tests**

Run: `npx vitest run source/hooks/useContentOrdering.test.ts`
Expected: PASS

**Step 7: Commit**

```bash
git add source/hooks/useContentOrdering.ts source/hooks/useContentOrdering.test.ts
git commit -m "refactor: remove PreToolUse↔PostToolUse pairing, every event is independent"
```

---

### Task 5: Remove dynamicItem from app.tsx and postToolEvent from display.ts

**Files:**

- Modify: `source/app.tsx`
- Modify: `source/types/hooks/display.ts`

**Step 1: Update app.tsx destructuring**

```tsx
const {stableItems, tasks} = useContentOrdering({messages, events});
```

**Step 2: Remove the dynamic item rendering block**

Delete lines 323-334 (the `{dynamicItem && ...}` block).

**Step 3: Remove `postToolEvent` from HookEventDisplay**

In `source/types/hooks/display.ts`, remove the `postToolEvent` field (lines 35-41).

**Step 4: Run full build + lint + tests**

Run: `npm run build && npm run lint && npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add source/app.tsx source/types/hooks/display.ts
git commit -m "refactor: remove dynamicItem and postToolEvent field"
```

---

### Task 6: Update CLAUDE.md documentation

**Files:**

- Modify: `CLAUDE.md`

**Step 1: Update architectural notes**

- Remove bullet about `Ink <Static> is write-once` needing state changes before stability
- Remove bullet about `PreToolUse ↔ PostToolUse pairing`
- Add note: "Every hook event is an independent static line — no pairing between Pre and PostToolUse"
- Update `useContentOrdering` description: "Pure transformation: events → stableItems (all items are immediately stable)"
- Remove `dynamicItem` references

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for independent-events architecture"
```

---

## Summary of Changes

| File                         | Change                                                                |
| ---------------------------- | --------------------------------------------------------------------- |
| `PostToolResult.tsx`         | **NEW** — renders standalone PostToolUse/Failure as `⎿ result`        |
| `PostToolResult.test.tsx`    | **NEW** — tests for PostToolResult                                    |
| `HookEvent.tsx`              | Route PostToolUse to PostToolResult instead of UnifiedToolCallEvent   |
| `UnifiedToolCallEvent.tsx`   | Strip to header-only: `● Tool(params)`, no post-tool or pending logic |
| `useContentOrdering.ts`      | Remove all pairing logic, `isItemComplete`, `dynamicItem`             |
| `useContentOrdering.test.ts` | Remove pairing tests, update stable/dynamic tests                     |
| `app.tsx`                    | Remove dynamicItem rendering block                                    |
| `display.ts`                 | Remove `postToolEvent` field from `HookEventDisplay`                  |
| `CLAUDE.md`                  | Update architectural docs                                             |

## Key Insight

The previous design treated PreToolUse + PostToolUse as one logical unit that had to be assembled before rendering. The new design treats them as two independent timeline entries — like a log. This eliminates all stateful waiting, pairing logic, temporal fallbacks, and the concept of "incomplete" items. Every event renders immediately, permanently.
