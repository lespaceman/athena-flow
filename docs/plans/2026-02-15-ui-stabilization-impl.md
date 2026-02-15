# Phase 1: UI Stabilization — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate rendering flicker, enforce 1-line event headers, bound dynamic region to 4 lines, introduce safe tool output collapsing, consolidate header to 1 line.

**Architecture:** Bottom-up fix — each task is independently testable and shippable. Tasks 1-3 fix core flickering and event model. Tasks 4-6 enforce visual constraints. Tasks 7-9 add hybrid collapse with `:open` command. Tasks 10-12 consolidate header and clean up shortcuts. Task 13 enforces footer discipline. Task 14 validates everything.

**Tech Stack:** React 19 + Ink, vitest, TypeScript ESM

**Key design constraint:** Tool output preview/collapse decisions use pre-computed `string[]` arrays, NOT React tree measurement. See design doc §7.

---

### Task 1: Formalize Event Immutability — Remove In-Place Updates

**Files:**

- Modify: `source/hooks/useContentOrdering.ts:175-176, 396-427`
- Test: `source/hooks/useContentOrdering.test.ts`

The deferred promotion exists because events mutate (e.g., a PreToolUse event gets a `postToolEvent` merged onto it later). The fix is two-fold: remove deferred promotion AND accept that events in Static may show "Running..." until a separate completion event appears.

**Step 1: Update test helper to NOT double-render**

In `source/hooks/useContentOrdering.test.ts:13-18`, remove the extra `rerender()`:

```typescript
function callHook(opts: {messages: Message[]; events: HookEventDisplay[]}) {
	const {result} = renderHook(() => useContentOrdering(opts));
	return result.current;
}
```

**Step 2: Run tests to identify breakage**

Run: `npx vitest run source/hooks/useContentOrdering.test.ts`

Note which tests fail — they depended on deferred promotion.

**Step 3: Remove pendingPromotionRef and simplify promotion**

In `source/hooks/useContentOrdering.ts`:

1. Delete `const pendingPromotionRef = useRef<Set<string>>(new Set());` (line 176)
2. Replace lines 396-427 (the promotion logic) with:

```typescript
const prevStableIds = new Set(stableOrderRef.current);
const stableItems: ContentItem[] = [];

// Retain existing order for previously-stable items
for (const id of stableOrderRef.current) {
	const item = itemById.get(id);
	if (item && isStable(item)) {
		stableItems.push(item);
	}
}

// Immediately promote newly-stable items (no deferred cycle)
for (const item of contentItems) {
	if (isStable(item) && !prevStableIds.has(item.data.id)) {
		stableItems.push(item);
	}
}

stableOrderRef.current = stableItems.map(i => i.data.id);

const stableIdSet = new Set(stableItems.map(i => i.data.id));
const dynamicItems = contentItems.filter(
	item => !stableIdSet.has(item.data.id),
);
```

**Step 4: Run tests, fix any that assumed double-render**

Run: `npx vitest run source/hooks/useContentOrdering.test.ts`

Expected: All PASS.

**Step 5: Commit**

```bash
git add source/hooks/useContentOrdering.ts source/hooks/useContentOrdering.test.ts
git commit -m "fix: remove deferred Static promotion to eliminate flicker

Events are now promoted to <Static> immediately when stable,
removing the pendingPromotionRef one-cycle delay that caused
visible render-dynamic-then-reappear flicker."
```

---

### Task 2: Throttle useHeaderMetrics to 1 Hz

**Files:**

- Modify: `source/hooks/useHeaderMetrics.ts`
- Test: `source/hooks/useHeaderMetrics.test.ts`

**Step 1: Write a failing test using fake timers**

Use `vi.useFakeTimers()` for deterministic behavior — real-time `Date.now()` tests are brittle:

```typescript
it('throttles recomputation within 1s window', () => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));

	const events1 = [makeSessionStartEvent()];
	const events2 = [...events1, makePreToolUseEvent()];

	const {result, rerender} = renderHook(
		({events}) => useHeaderMetrics(events),
		{initialProps: {events: events1}},
	);

	const first = result.current;

	// Advance only 500ms (within throttle window)
	vi.advanceTimersByTime(500);
	rerender({events: events2});
	expect(result.current).toBe(first);

	// Advance past throttle window
	vi.advanceTimersByTime(600);
	rerender({events: events2});
	expect(result.current).not.toBe(first);
	expect(result.current.toolCallCount).toBe(1);

	vi.useRealTimers();
});
```

**Step 2: Run to verify failure**

Run: `npx vitest run source/hooks/useHeaderMetrics.test.ts -t "throttles"`

Expected: FAIL — `useMemo` recomputes on every `events` change.

**Step 3: Add ref-based throttle**

In `useHeaderMetrics.ts`, wrap the `useMemo` with a ref-based time gate:

```typescript
import {useMemo, useRef} from 'react';

const THROTTLE_MS = 1000;

export function useHeaderMetrics(events: HookEventDisplay[]): SessionMetrics {
	const lastComputeRef = useRef<number>(0);
	const cachedRef = useRef<SessionMetrics | null>(null);

	return useMemo(() => {
		const now = Date.now();
		if (
			cachedRef.current !== null &&
			now - lastComputeRef.current < THROTTLE_MS
		) {
			return cachedRef.current;
		}
		// ... existing computation (lines 26-112 unchanged) ...
		cachedRef.current = result;
		lastComputeRef.current = now;
		return result;
	}, [events]);
}
```

**Step 4: Run tests**

Run: `npx vitest run source/hooks/useHeaderMetrics.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add source/hooks/useHeaderMetrics.ts source/hooks/useHeaderMetrics.test.ts
git commit -m "perf: throttle useHeaderMetrics to 1 Hz to reduce redraw churn"
```

---

### Task 3: Replace Ctrl+S with F9 for StatsPanel Toggle

**Files:**

- Modify: `source/app.tsx:272-279`
- Test: Verify manually or update existing tests

`Ctrl+S` is XOFF flow control in many terminals and causes phantom freezes.

**Step 1: Change the keybinding in app.tsx**

In `source/app.tsx`, replace the `useInput` handler (lines 272-279):

```typescript
useInput(
	(_input, key) => {
		// F9 toggles stats panel (avoids Ctrl+S flow control conflict)
		if (key.f9) {
			setStatsExpanded(prev => !prev);
		}
	},
	{isActive: !dialogActive},
);
```

Note: Check if Ink's `useInput` supports `key.f9`. If not, check for the raw escape sequence. Ink's key object may not have F-key support natively — in that case, match on the raw input string `\x1b[20~` (F9 in most terminals).

**Step 2: Update any references to Ctrl+S in constants/tips**

In `source/components/Header/constants.ts:25`, change the tip:

```typescript
export const TIPS = [
	'Type a prompt to start a session',
	'Use /help for available commands',
	'Press F9 for session stats',
];
```

**Step 3: Run lint and type check**

Run: `npm run lint && npm run build`

Expected: PASS

**Step 4: Commit**

```bash
git add source/app.tsx source/components/Header/constants.ts
git commit -m "fix: replace Ctrl+S with F9 for StatsPanel toggle

Ctrl+S conflicts with XOFF flow control in many terminals,
causing phantom freezes. F9 is safe and rarely conflicts."
```

---

### Task 4: Create truncateLine Utility (ANSI-safe)

**Files:**

- Create: `source/utils/truncate.ts`
- Create: `source/utils/truncate.test.ts`

**Important:** Terminal strings contain ANSI escape codes (e.g. `\x1b[31m` for red) that are invisible but inflate `.length`. We MUST use `string-width` (already an Ink transitive dependency) to measure visible column width, and `strip-ansi` to safely slice. Do NOT use `.length` or `.slice()` directly on ANSI-containing strings.

**Step 1: Write failing tests**

```typescript
// source/utils/truncate.test.ts
import {describe, it, expect} from 'vitest';
import {truncateLine} from './truncate.js';

describe('truncateLine', () => {
	it('returns string unchanged if within width', () => {
		expect(truncateLine('hello', 80)).toBe('hello');
	});

	it('truncates plain text with ellipsis when exceeding width', () => {
		const long = 'a'.repeat(100);
		const result = truncateLine(long, 50);
		// Visible width should be 50
		expect(result).toHaveLength(50);
		expect(result.endsWith('…')).toBe(true);
	});

	it('handles ANSI escape codes correctly', () => {
		// \x1b[31m = red, \x1b[39m = reset — invisible chars
		const ansi = '\x1b[31m' + 'a'.repeat(100) + '\x1b[39m';
		const result = truncateLine(ansi, 50);
		// Must NOT cut in the middle of an escape sequence
		// Visible width of result should be ≤50
		const stringWidth = (await import('string-width')).default;
		expect(stringWidth(result)).toBeLessThanOrEqual(50);
	});

	it('handles empty string', () => {
		expect(truncateLine('', 80)).toBe('');
	});

	it('handles width smaller than ellipsis', () => {
		expect(truncateLine('hello world', 1)).toBe('…');
	});

	it('handles CJK wide characters', () => {
		// CJK characters are 2 columns wide
		const cjk = '你好世界测试'; // 6 chars × 2 cols = 12 visible width
		const result = truncateLine(cjk, 8);
		const stringWidth = (await import('string-width')).default;
		expect(stringWidth(result)).toBeLessThanOrEqual(8);
	});
});
```

**Step 2: Run to verify failure**

Run: `npx vitest run source/utils/truncate.test.ts`

Expected: FAIL — module not found.

**Step 3: Implement with string-width**

```typescript
// source/utils/truncate.ts
import stringWidth from 'string-width';

/**
 * Truncate a string to fit within a given visible column width.
 * Uses string-width for ANSI-safe measurement (handles escape codes,
 * CJK double-width characters, emoji, etc.).
 * Appends '…' if truncation occurs.
 */
export function truncateLine(text: string, maxWidth: number): string {
	if (stringWidth(text) <= maxWidth) return text;
	if (maxWidth <= 1) return '…';

	// Binary search for the longest prefix whose visible width + '…' fits
	let lo = 0;
	let hi = text.length;
	while (lo < hi) {
		const mid = Math.ceil((lo + hi) / 2);
		if (stringWidth(text.slice(0, mid)) <= maxWidth - 1) {
			lo = mid;
		} else {
			hi = mid - 1;
		}
	}
	return text.slice(0, lo) + '…';
}
```

Note: `string-width` is already available as a transitive dependency of Ink. Check if it needs to be added as a direct dependency in `package.json`. If so, run `npm install string-width`.

**Step 4: Run tests**

Run: `npx vitest run source/utils/truncate.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add source/utils/truncate.ts source/utils/truncate.test.ts
git commit -m "feat: add ANSI-safe truncateLine utility using string-width

Correctly handles ANSI escape codes, CJK double-width chars,
and emoji. Uses binary search over string-width for efficiency."
```

---

### Task 5: Enforce 1-Line Headers in UnifiedToolCallEvent

**Files:**

- Modify: `source/components/UnifiedToolCallEvent.tsx:132-142`
- Test: `source/components/UnifiedToolCallEvent.test.tsx`

**Step 1: Write failing test for truncation**

```typescript
it('truncates header line to terminal width', () => {
	const originalColumns = process.stdout.columns;
	Object.defineProperty(process.stdout, 'columns', {value: 40, writable: true});

	const {lastFrame} = render(
		<UnifiedToolCallEvent
			event={makeEvent({toolName: 'Bash', toolInput: {command: 'a'.repeat(200)}})}
		/>
	);

	const lines = lastFrame()!.split('\n');
	expect(stripAnsi(lines[0]!).length).toBeLessThanOrEqual(40);

	Object.defineProperty(process.stdout, 'columns', {value: originalColumns, writable: true});
});
```

**Step 2: Run to verify failure**

Run: `npx vitest run source/components/UnifiedToolCallEvent.test.tsx -t "truncates header"`

Expected: FAIL

**Step 3: Add truncation**

In `UnifiedToolCallEvent.tsx`, import and apply:

```typescript
import {truncateLine} from '../utils/truncate.js';

// Before return, compute truncated params:
const terminalWidth = process.stdout.columns ?? 80;
const bulletWidth = 2; // "● "
const nameWidth = parsed.displayName.length;
const availableForParams = terminalWidth - bulletWidth - nameWidth;
const truncatedParams = truncateLine(
	inlineParams,
	Math.max(availableForParams, 10),
);
```

Replace `{inlineParams}` with `{truncatedParams}` in the JSX.

**Step 4: Run tests**

Run: `npx vitest run source/components/UnifiedToolCallEvent.test.tsx`

Expected: PASS

**Step 5: Commit**

```bash
git add source/components/UnifiedToolCallEvent.tsx source/components/UnifiedToolCallEvent.test.tsx
git commit -m "fix: truncate tool call headers to terminal width"
```

---

### Task 6: Rewrite SubagentEvent as Compact Block + Hide Child Events from Main Feed

Subagents render as a 2-3 line compact block (matching Claude Code's native rendering). Child tool calls are completely hidden from the main feed.

**Files:**

- Modify: `source/components/SubagentEvent.tsx` (rewrite)
- Modify: `source/hooks/useContentOrdering.ts:48-62` (exclude child events)
- Test: new/updated tests

**Step 1: Write failing test — child events excluded from main stream**

In `source/hooks/useContentOrdering.test.ts`:

```typescript
it('excludes child events (with parentSubagentId) from the main content stream', () => {
	const result = callHook({
		messages: [],
		events: [
			makeEvent({
				id: 'parent-start',
				hookName: 'SubagentStart',
				status: 'passthrough',
				payload: makeSubagentStartPayload({
					agentId: 'a1',
					agentType: 'Explore',
				}),
			}),
			makeEvent({
				id: 'child-tool',
				hookName: 'PreToolUse',
				toolName: 'Glob',
				parentSubagentId: 'a1',
				status: 'passthrough',
				payload: makePreToolUsePayload({toolName: 'Glob'}),
			}),
		],
	});
	const allIds = [...result.stableItems, ...result.dynamicItems].map(
		i => i.data.id,
	);
	expect(allIds).toContain('parent-start');
	expect(allIds).not.toContain('child-tool');
});
```

**Step 2: Run to verify failure**

Run: `npx vitest run source/hooks/useContentOrdering.test.ts -t "excludes child events"`

Expected: FAIL — child events currently pass through.

**Step 3: Add `parentSubagentId` filter to shouldExcludeFromMainStream**

In `source/hooks/useContentOrdering.ts`, add at the top of `shouldExcludeFromMainStream`:

```typescript
function shouldExcludeFromMainStream(event: HookEventDisplay): boolean {
	// Child events belong to their parent subagent's feed, not the main stream
	if (event.parentSubagentId) return true;

	if (event.hookName === 'SessionEnd') return true;
	// ... rest unchanged ...
}
```

**Step 4: Run content ordering tests**

Run: `npx vitest run source/hooks/useContentOrdering.test.ts`

Expected: Some existing tests that assert child events appear in the stream will fail. Update them to expect exclusion instead.

**Step 5: Write failing test — compact SubagentEvent rendering**

```typescript
describe('SubagentEvent compact block', () => {
	it('renders 2-line block: header + summary when completed', () => {
		const event = makeSubagentStartEvent({
			agentType: 'Explore',
			taskDescription: 'Explore key source files',
			stopEvent: makeSubagentStopEvent({agentType: 'Explore'}),
		});
		const {lastFrame} = render(<SubagentEvent event={event} childMetrics={{toolCount: 7, duration: 19000}} />);
		const frame = lastFrame()!;
		expect(frame).toContain('Explore');
		expect(frame).toContain('Explore key source files');
		expect(frame).toContain('Done');
		expect(frame).toContain('7 tool uses');
		expect(frame).not.toMatch(/[╭╮╰╯│─]/); // no borders
	});

	it('renders running state with spinner', () => {
		const event = makeSubagentStartEvent({agentType: 'Explore'});
		const {lastFrame} = render(<SubagentEvent event={event} childMetrics={{toolCount: 3, duration: 5000}} />);
		expect(lastFrame()).toContain('Running');
	});
});
```

**Step 6: Rewrite SubagentEvent.tsx**

```typescript
import React from 'react';
import {Box, Text} from 'ink';
import {
	type HookEventDisplay,
	isSubagentStartEvent,
} from '../types/hooks/index.js';
import {useTheme} from '../theme/index.js';
import {useSpinner} from '../hooks/useSpinner.js';
import {truncateLine} from '../utils/truncate.js';

type ChildMetrics = {
	toolCount: number;
	duration: number; // ms
};

type Props = {
	event: HookEventDisplay;
	childMetrics?: ChildMetrics;
};

function formatDuration(ms: number): string {
	const secs = Math.round(ms / 1000);
	return secs < 60 ? `${secs}s` : `${Math.floor(secs / 60)}m${secs % 60}s`;
}

export default function SubagentEvent({event, childMetrics}: Props): React.ReactNode {
	const theme = useTheme();
	if (!isSubagentStartEvent(event.payload)) return null;

	const payload = event.payload;
	const isCompleted = Boolean(event.stopEvent);
	const spinnerFrame = useSpinner(!isCompleted);
	const terminalWidth = process.stdout.columns ?? 80;

	// Line 1: ● AgentType(description) ModelName
	const description = event.taskDescription
		? `(${event.taskDescription})`
		: '';
	const headerText = `${payload.agent_type}${description}`;
	const headerTruncated = truncateLine(headerText, terminalWidth - 4);

	// Line 2: └ Done/Running (N tool uses · Xs)
	const toolCount = childMetrics?.toolCount ?? 0;
	const duration = childMetrics?.duration ?? 0;
	const summaryParts: string[] = [];
	if (toolCount > 0) summaryParts.push(`${toolCount} tool uses`);
	if (duration > 0) summaryParts.push(formatDuration(duration));
	const summaryDetail = summaryParts.length > 0
		? ` (${summaryParts.join(' · ')})`
		: '';

	return (
		<Box flexDirection="column" marginBottom={1}>
			<Box>
				<Text color={theme.accentSecondary} bold>● </Text>
				<Text color={theme.accentSecondary} bold>{headerTruncated}</Text>
			</Box>
			<Box paddingLeft={2}>
				<Text dimColor>└ </Text>
				{isCompleted ? (
					<Text color={theme.status.success}>Done{summaryDetail}</Text>
				) : (
					<Text color={theme.status.info}>{spinnerFrame} Running{summaryDetail}</Text>
				)}
			</Box>
			{isCompleted && (
				<Box paddingLeft={2}>
					<Text dimColor>(:open {payload.agent_id} to expand)</Text>
				</Box>
			)}
		</Box>
	);
}
```

**Step 7: Pass childMetrics from app.tsx or compute in SubagentEvent**

The child metrics (tool count, duration) need to be computed. Two options:

**Option A (simpler):** Compute in `useContentOrdering` and attach to the SubagentStart event as a new field `childMetrics` on `HookEventDisplay`.

**Option B:** Pass the full events array to SubagentEvent and let it compute. More encapsulated but couples the component to the event store.

Prefer **Option A** — add `childMetrics` to `HookEventDisplay`:

```typescript
// In display.ts:
childMetrics?: {toolCount: number; duration: number};
```

In `useContentOrdering.ts`, when merging stopEvent onto SubagentStart, also compute:

```typescript
// After merging stopEvent onto item.data:
const childToolCount = events.filter(
	e =>
		e.parentSubagentId === item.data.payload.agent_id &&
		e.hookName === 'PreToolUse',
).length;
const startTime = item.data.timestamp.getTime();
const endTime = stopEvent?.timestamp.getTime() ?? Date.now();
item.data = {
	...item.data,
	stopEvent,
	childMetrics: {toolCount: childToolCount, duration: endTime - startTime},
};
```

**Step 8: Run all tests**

Run: `npx vitest run source/hooks/useContentOrdering.test.ts && npx vitest run source/components/HookEvent.test.tsx`

Expected: PASS

**Step 9: Commit**

```bash
git add source/components/SubagentEvent.tsx source/hooks/useContentOrdering.ts source/hooks/useContentOrdering.test.ts source/types/hooks/display.ts source/components/HookEvent.test.tsx
git commit -m "feat: compact SubagentEvent block + hide child events from main feed

Subagents render as 2-3 line compact blocks (header + summary + expand hint).
Child tool calls with parentSubagentId are excluded from the main stream.
Child metrics (tool count, duration) computed in useContentOrdering."
```

---

### Task 7: Add Preview Metadata to Tool Extractors

**Files:**

- Modify: `source/utils/toolExtractors.ts`
- Test: existing extractor tests or new tests

This is the key design constraint: preview/collapse decisions use pre-computed `string[]`, not React tree measurement.

**Step 1: Extend RenderableOutput type**

Add `previewLines` and `totalLineCount` to the `RenderableOutput` discriminated union:

```typescript
type RenderableOutputBase = {
	previewLines: string[]; // first N lines as plain strings
	totalLineCount: number; // total lines if fully rendered
};

export type RenderableOutput =
	| (RenderableOutputBase & {
			type: 'code';
			content: string;
			language?: string;
			maxLines?: number;
	  })
	| (RenderableOutputBase & {
			type: 'diff';
			oldText: string;
			newText: string;
			maxLines?: number;
	  })
	| (RenderableOutputBase & {type: 'list'; items: string[]; maxItems?: number})
	| (RenderableOutputBase & {type: 'text'; content: string; maxLines?: number});
```

**Step 2: Update each extractor to compute preview metadata**

Each extractor in the `EXTRACTORS` registry must return `previewLines` (first 5 lines of the content split by newline) and `totalLineCount`. For example:

```typescript
// For 'code' type:
const lines = content.split('\n');
return {
	type: 'code',
	content,
	language,
	previewLines: lines.slice(0, 5),
	totalLineCount: lines.length,
};
```

**Step 3: Write test for preview metadata**

```typescript
it('returns previewLines and totalLineCount for code output', () => {
	const output = extractToolOutput(
		'Bash',
		{command: 'ls'},
		{
			stdout: 'line1\nline2\nline3\nline4\nline5\nline6\nline7',
		},
	);
	expect(output.previewLines).toHaveLength(5);
	expect(output.totalLineCount).toBe(7);
});
```

**Step 4: Run tests**

Run: `npx vitest run source/utils/toolExtractors.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add source/utils/toolExtractors.ts source/utils/toolExtractors.test.ts
git commit -m "feat: add previewLines/totalLineCount to RenderableOutput

Preview/collapse decisions use pre-computed string arrays,
not React tree measurement, for deterministic behavior."
```

---

### Task 8: Add Collapse Support to ToolResultContainer

**Important:** Do NOT use Ink's `<Box height={N}>` to clip content — Ink's `height` prop sets a minimum height in many cases and clipping is unreliable across terminal/Ink versions. Instead, when collapsed, render ONLY the `previewLines` strings and skip the `children` entirely. The collapse decision happens BEFORE React rendering, not via CSS-like clipping.

**Files:**

- Modify: `source/components/ToolOutput/ToolResultContainer.tsx`
- Test: `source/components/ToolOutput/ToolResultContainer.test.tsx`

**Step 1: Write failing tests**

```typescript
describe('collapse behavior', () => {
	it('renders all content when previewLines not provided', () => {
		const {lastFrame} = render(
			<ToolResultContainer>
				<Text>full content</Text>
			</ToolResultContainer>
		);
		expect(lastFrame()).toContain('full content');
	});

	it('renders preview and expand hint when collapsed', () => {
		const {lastFrame} = render(
			<ToolResultContainer
				previewLines={['line 1', 'line 2']}
				totalLineCount={20}
				toolId="t42"
			>
				<Text>full content that should NOT appear</Text>
			</ToolResultContainer>
		);
		expect(lastFrame()).toContain('line 1');
		expect(lastFrame()).toContain('line 2');
		expect(lastFrame()).toContain(':open t42');
		expect(lastFrame()).not.toContain('full content that should NOT appear');
	});

	it('renders full content when totalLineCount is within threshold', () => {
		const {lastFrame} = render(
			<ToolResultContainer
				previewLines={['line 1', 'line 2']}
				totalLineCount={3}
				collapseThreshold={5}
			>
				<Text>full content</Text>
			</ToolResultContainer>
		);
		expect(lastFrame()).toContain('full content');
		expect(lastFrame()).not.toContain(':open');
	});
});
```

**Step 2: Run to verify failure**

Run: `npx vitest run source/components/ToolOutput/ToolResultContainer.test.tsx -t "collapse"`

Expected: FAIL — props don't exist.

**Step 3: Implement collapse logic**

```typescript
type Props = {
	children: React.ReactNode | ((availableWidth: number) => React.ReactNode);
	dimGutter?: boolean;
	gutterColor?: string;
	parentWidth?: number;
	previewLines?: string[];
	totalLineCount?: number;
	toolId?: string;
	collapseThreshold?: number; // default: 5
};

const DEFAULT_COLLAPSE_THRESHOLD = 5;

export default function ToolResultContainer({
	children,
	dimGutter = true,
	gutterColor,
	parentWidth,
	previewLines,
	totalLineCount,
	toolId,
	collapseThreshold = DEFAULT_COLLAPSE_THRESHOLD,
}: Props): React.ReactNode {
	if (children == null) return null;

	const baseWidth = parentWidth ?? process.stdout.columns ?? 80;
	const availableWidth = Math.max(baseWidth - TOTAL_OVERHEAD, 20);

	const shouldCollapse =
		previewLines !== undefined &&
		totalLineCount !== undefined &&
		totalLineCount > collapseThreshold;

	if (shouldCollapse) {
		const remaining = totalLineCount - previewLines.length;
		return (
			<Box paddingLeft={LEFT_MARGIN}>
				<Box width={GUTTER_WIDTH} flexShrink={0}>
					<Text dimColor={dimGutter} color={gutterColor}>{'\u23bf'} </Text>
				</Box>
				<Box flexDirection="column" width={availableWidth}>
					{previewLines.map((line, i) => (
						<Text key={i}>{line}</Text>
					))}
					<Text dimColor>
						(+{remaining} lines{toolId ? `, :open ${toolId} to expand` : ''})
					</Text>
				</Box>
			</Box>
		);
	}

	const content =
		typeof children === 'function' ? children(availableWidth) : children;
	if (content == null) return null;

	return (
		<Box paddingLeft={LEFT_MARGIN}>
			<Box width={GUTTER_WIDTH} flexShrink={0}>
				<Text dimColor={dimGutter} color={gutterColor}>{'\u23bf'} </Text>
			</Box>
			<Box flexDirection="column" width={availableWidth}>
				{content}
			</Box>
		</Box>
	);
}
```

**Step 4: Run tests**

Run: `npx vitest run source/components/ToolOutput/ToolResultContainer.test.tsx`

Expected: PASS

**Step 5: Commit**

```bash
git add source/components/ToolOutput/ToolResultContainer.tsx source/components/ToolOutput/ToolResultContainer.test.tsx
git commit -m "feat: add deterministic collapse to ToolResultContainer

Uses pre-computed previewLines/totalLineCount from extractors
rather than measuring React tree height."
```

---

### Task 9: Wire Collapse into UnifiedToolCallEvent + Add :open Command

**Files:**

- Modify: `source/components/UnifiedToolCallEvent.tsx:103-119`
- Create: `source/commands/builtins/open.ts`
- Modify: `source/commands/builtins/index.ts`
- Create: `source/commands/__tests__/open.test.ts`

**Step 1: Pass preview metadata through UnifiedToolCallEvent**

In `UnifiedToolCallEvent.tsx`, where the success `responseNode` is built (around line 103), extract preview metadata from the tool output and pass to `ToolResultContainer`:

```typescript
import {extractToolOutput} from '../../utils/toolExtractors.js';

// Inside the component, before building responseNode:
const outputMeta = resolvedPost && isPostToolUseEvent(resolvedPost)
	? extractToolOutput(toolName, toolInput, resolvedPost.tool_response)
	: null;

// Then in the success branch:
} else if (resolvedPost) {
	bulletColor = statusColors.passthrough;
	responseNode = (
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
						isPostToolUseEvent(resolvedPost)
							? resolvedPost.tool_response
							: undefined
					}
					availableWidth={availableWidth}
				/>
			)}
		</ToolResultContainer>
	);
}
```

**Step 2: Write failing test for :open command**

```typescript
// source/commands/__tests__/open.test.ts
import {describe, it, expect, vi} from 'vitest';
import {openCommand} from '../builtins/open.js';

describe('open command', () => {
	it('has correct name and category', () => {
		expect(openCommand.name).toBe('open');
		expect(openCommand.category).toBe('hook');
	});

	it('calls hookServer.expandToolOutput with toolId', () => {
		const expandToolOutput = vi.fn();
		openCommand.execute({
			args: {toolId: 't42'},
			hookServer: {expandToolOutput} as any,
		});
		expect(expandToolOutput).toHaveBeenCalledWith('t42');
	});
});
```

**Step 3: Implement :open command**

```typescript
// source/commands/builtins/open.ts
import {type HookCommand} from '../types.js';

export const openCommand: HookCommand = {
	name: 'open',
	description: 'Expand a collapsed tool output into the event stream',
	category: 'hook',
	aliases: ['o'],
	args: [
		{
			name: 'toolId',
			description: 'The tool use ID to expand (or "last")',
			required: true,
		},
	],
	execute(ctx) {
		const toolId = ctx.args.toolId;
		if (!toolId) return;
		ctx.hookServer.expandToolOutput(toolId);
	},
};
```

**Step 4: Register in builtins/index.ts**

Add `import {openCommand} from './open.js';` and add `openCommand` to the `builtins` array.

**Step 5: Add `expandToolOutput` to UseHookServerResult**

**5a. Add method signature to `source/types/server.ts`:**

In the `UseHookServerResult` type, add:

```typescript
/** Append a full tool output expansion block to the event stream. Idempotent per toolId. */
expandToolOutput: (toolId: string) => void;
```

**5b. Implement in `source/hooks/useHookServer.ts`:**

Add a ref to track already-expanded toolIds, and implement the callback:

```typescript
const expandedToolIdsRef = useRef<Set<string>>(new Set());

const expandToolOutput = useCallback(
	(toolId: string) => {
		// Resolve "last" to the most recent tool event's toolUseId
		const resolvedId =
			toolId === 'last'
				? [...events].reverse().find(e => e.toolUseId)?.toolUseId
				: toolId;

		if (!resolvedId) return;

		// Idempotent: skip if already expanded
		if (expandedToolIdsRef.current.has(resolvedId)) return;
		expandedToolIdsRef.current.add(resolvedId);

		// Find the original PostToolUse event with this toolUseId
		const postEvent = events.find(
			e =>
				(e.hookName === 'PostToolUse' || e.hookName === 'PostToolUseFailure') &&
				e.toolUseId === resolvedId,
		);
		// Also find the PreToolUse for tool name/input
		const preEvent = events.find(
			e =>
				(e.hookName === 'PreToolUse' || e.hookName === 'PermissionRequest') &&
				e.toolUseId === resolvedId,
		);

		if (!postEvent && !preEvent) return;

		// Create a synthetic expansion event
		const expansionEvent: HookEventDisplay = {
			id: `expansion-${resolvedId}`,
			requestId: `expansion-${resolvedId}`,
			timestamp: new Date(),
			hookName: 'Expansion' as any, // Synthetic type — HookEvent.tsx must handle it
			toolName: preEvent?.toolName,
			payload: postEvent?.payload ?? preEvent?.payload ?? {},
			status: 'passthrough',
			toolUseId: resolvedId,
		};

		setEvents(prev => [...prev, expansionEvent]);
	},
	[events],
);
```

**5c. Add `Expansion` rendering to HookEvent.tsx:**

In `HookEvent.tsx`, add a case before the fallback:

```typescript
if (event.hookName === 'Expansion') {
	return <ExpansionBlock event={event} />;
}
```

Create `source/components/ExpansionBlock.tsx` — renders the full tool output without collapse, prefixed with a separator:

```typescript
export default function ExpansionBlock({event}: {event: HookEventDisplay}) {
	const toolName = event.toolName ?? 'Unknown';
	const toolInput = isPreToolUseEvent(event.payload)
		? event.payload.tool_input : {};
	const toolResponse = isPostToolUseEvent(event.payload)
		? event.payload.tool_response : undefined;

	return (
		<Box flexDirection="column" marginBottom={1}>
			<Text dimColor>── tool output {event.toolUseId} ──</Text>
			<ToolResultContainer>
				{width => (
					<ToolOutputRenderer
						toolName={toolName}
						toolInput={toolInput}
						toolResponse={toolResponse}
						availableWidth={width}
					/>
				)}
			</ToolResultContainer>
			<Text dimColor>── end ──</Text>
		</Box>
	);
}
```

**Step 6: Run tests**

Run: `npx vitest run source/commands/__tests__/open.test.ts && npx vitest run source/components/UnifiedToolCallEvent.test.tsx`

Expected: PASS

**Step 7: Commit**

```bash
git add source/components/UnifiedToolCallEvent.tsx source/commands/builtins/open.ts source/commands/builtins/index.ts source/commands/__tests__/open.test.ts source/types/server.ts source/hooks/useHookServer.ts
git commit -m "feat: wire hybrid collapse into tool events and add :open command

Tool outputs >5 lines show a 2-line preview with :open hint.
:open <toolId> appends full output as a static expansion block."
```

---

### Task 10: Consolidate Header + StatusLine into 1 Line

**Files:**

- Modify: `source/components/Header/Header.tsx`
- Test: `source/components/Header/Header.test.tsx`

**Step 1: Write failing test**

```typescript
it('renders as a single line with state and metrics', () => {
	const {lastFrame} = render(
		<Header
			version="0.1.0"
			modelName="opus"
			projectDir="/home/user/project"
			terminalWidth={120}
			claudeState="working"
			spinnerFrame="⠋"
			toolCallCount={23}
			contextSize={148000}
			isServerRunning={true}
		/>
	);
	const lines = lastFrame()!.split('\n').filter(l => l.trim());
	expect(lines.length).toBe(1);
	expect(lines[0]).toContain('ATHENA');
});
```

**Step 2: Run to verify failure**

Run: `npx vitest run source/components/Header/Header.test.tsx -t "single line"`

Expected: FAIL — current header is multi-line with borders/logo.

**Step 3: Rewrite Header**

Replace `Header.tsx` with a 1-line component that merges StatusLine data:

```typescript
import React from 'react';
import {Box, Text} from 'ink';
import {formatTokens, formatModelName} from '../../utils/formatters.js';
import type {ClaudeState} from '../../types/headerMetrics.js';
import {getStateColors, STATE_LABELS} from './constants.js';
import {useTheme} from '../../theme/index.js';

type Props = {
	version: string;
	modelName: string | null;
	projectDir: string;
	terminalWidth: number;
	claudeState: ClaudeState;
	spinnerFrame: string;
	toolCallCount: number;
	contextSize: number | null;
	isServerRunning: boolean;
};

export default function Header({
	version,
	modelName,
	terminalWidth,
	claudeState,
	spinnerFrame,
	toolCallCount,
	contextSize,
	isServerRunning,
}: Props) {
	const theme = useTheme();
	const stateColors = getStateColors(theme);

	return (
		<Box width={terminalWidth} justifyContent="space-between">
			<Box>
				<Text bold color={theme.accent}>ATHENA</Text>
				<Text dimColor> v{version}</Text>
				<Text dimColor> | </Text>
				<Text color={stateColors[claudeState]}>
					{spinnerFrame ? `${spinnerFrame} ` : ''}{STATE_LABELS[claudeState]}
				</Text>
			</Box>
			<Box>
				<Text>{formatModelName(modelName)}</Text>
				<Text dimColor> | tools:</Text><Text>{toolCallCount}</Text>
				<Text dimColor> | ctx:</Text><Text>{formatTokens(contextSize)}</Text>
				<Text dimColor> | </Text>
				<Text color={isServerRunning ? theme.status.success : theme.status.error}>●</Text>
			</Box>
		</Box>
	);
}
```

**Step 4: Move Header outside `<Static>` in app.tsx**

This is a significant rendering model change. Currently Header is the first item in `allStaticItems` (rendered once via `<Static>`). Moving it outside enables live updates but changes the component tree.

**4a. Remove header from allStaticItems (app.tsx:281-285):**

```typescript
// BEFORE:
type StaticItem = {type: 'header'; id: string} | (typeof stableItems)[number];
const allStaticItems: StaticItem[] = [
	{type: 'header', id: 'header'},
	...stableItems,
];

// AFTER:
const allStaticItems = stableItems;
```

**4b. Remove the header case from the Static render function (app.tsx:292-301):**

```typescript
// BEFORE: has if (item.type === 'header') { return <Header .../>; }
// AFTER: remove that branch entirely, only render messages and hook events
```

**4c. Add Header as a dynamic component BEFORE `<Static>` (app.tsx:~288):**

```typescript
return (
	<Box flexDirection="column">
		{/* Header renders outside Static for live updates */}
		<Header
			version={version}
			modelName={modelName}
			projectDir={projectDir}
			terminalWidth={terminalWidth}
			claudeState={claudeState}
			spinnerFrame={spinnerFrame}
			toolCallCount={metrics.totalToolCallCount}
			contextSize={tokenUsage.contextSize}
			isServerRunning={isServerRunning}
		/>

		{/* Static items — stable events/messages (no longer includes header) */}
		<Static items={allStaticItems}>
			{item =>
				item.type === 'message' ? (
					<Message key={item.data.id} message={item.data} />
				) : (
					<ErrorBoundary key={item.data.id} fallback={<Text color="red">[Error]</Text>}>
						<HookEvent event={item.data} verbose={verbose} />
					</ErrorBoundary>
				)
			}
		</Static>
		{/* ... rest unchanged ... */}
	</Box>
);
```

**Step 5: Remove StatusLine render from footer area (app.tsx:392-402)**

Delete the `<StatusLine>` JSX and its import at the top of the file.

**Step 6: Update existing Header tests**

Existing `Header.test.tsx` likely asserts on border characters (`╭╮╰╯`), logo lines (`▄██████▄`), and the "Welcome back!" text. These will ALL break. Update them:

- Remove assertions about borders, logo, tips
- Add assertions for the new 1-line format: `ATHENA`, state label, model, tools count, context size, server indicator

**Step 7: Run tests**

Run: `npx vitest run source/components/Header/Header.test.tsx && npx vitest run`

Expected: PASS (after test updates)

**Step 7: Commit**

```bash
git add source/components/Header/Header.tsx source/app.tsx source/components/Header/Header.test.tsx
git commit -m "refactor: consolidate Header+StatusLine into single 1-line Header

Header now renders outside <Static> for live updates.
Merges state, model, tools, context, and server status into 1 line."
```

---

### Task 11: Remove Old StatusLine Component

**Files:**

- Delete: `source/components/Header/StatusLine.tsx`
- Delete: `source/components/Header/StatusLine.test.tsx`

**Step 1: Search for remaining references**

Run: `grep -r "StatusLine" source/ --include="*.ts" --include="*.tsx" -l`

Remove all imports.

**Step 2: Delete files**

```bash
git rm source/components/Header/StatusLine.tsx source/components/Header/StatusLine.test.tsx
```

**Step 3: Run full test suite**

Run: `npx vitest run`

Expected: PASS

**Step 4: Commit**

```bash
git commit -m "chore: remove old StatusLine component (merged into Header)"
```

---

### Task 12: Add :tasks Command (Replaces Multi-Line TaskList)

**Files:**

- Create: `source/commands/builtins/tasks.ts`
- Modify: `source/commands/builtins/index.ts`
- Create: `source/commands/__tests__/tasks.test.ts`

**Step 1: Write failing test**

```typescript
import {describe, it, expect, vi} from 'vitest';
import {tasksCommand} from '../builtins/tasks.js';

describe('tasks command', () => {
	it('has correct name and category', () => {
		expect(tasksCommand.name).toBe('tasks');
		expect(tasksCommand.category).toBe('hook');
	});
});
```

**Step 2: Implement**

```typescript
// source/commands/builtins/tasks.ts
import {type HookCommand} from '../types.js';

export const tasksCommand: HookCommand = {
	name: 'tasks',
	description: 'Print full task list as a snapshot into the event stream',
	category: 'hook',
	aliases: ['todo'],
	execute(ctx) {
		ctx.hookServer.printTaskSnapshot();
	},
};
```

**Step 3: Register in builtins/index.ts**

**Step 4: Implement `printTaskSnapshot` on hook server**

Similar to `expandToolOutput` — creates a synthetic event with formatted task list and appends to the event stream.

**Step 5: Run tests**

Run: `npx vitest run source/commands/__tests__/tasks.test.ts`

Expected: PASS

**Step 6: Commit**

```bash
git add source/commands/builtins/tasks.ts source/commands/builtins/index.ts source/commands/__tests__/tasks.test.ts
git commit -m "feat: add :tasks command for full task list snapshot"
```

---

### Task 13: Footer Height Discipline — TaskList as 1-Line Summary

**Files:**

- Modify: `source/components/TaskList.tsx`
- Modify: `source/app.tsx`
- Test: `source/components/TaskList.test.tsx`

**Step 1: Write failing test**

```typescript
it('always renders as a single line summary', () => {
	const tasks = [
		{content: 'Task 1', status: 'completed' as const},
		{content: 'Task 2', status: 'in_progress' as const, activeForm: 'Working on task 2'},
		{content: 'Task 3', status: 'pending' as const},
	];
	const {lastFrame} = render(<TaskList tasks={tasks} />);
	const lines = lastFrame()!.split('\n').filter(l => l.trim());
	expect(lines.length).toBe(1);
});

it('returns null when dialogActive', () => {
	const tasks = [{content: 'Task 1', status: 'pending' as const}];
	const {lastFrame} = render(<TaskList tasks={tasks} dialogActive={true} />);
	expect(lastFrame()).toBe('');
});
```

**Step 2: Simplify TaskList to always-collapsed single line**

Remove the expanded view entirely. The full list is now accessed via `:tasks` command. Remove `collapsed`/`onToggle` props and the `Ctrl+T` keybinding:

```typescript
export default function TaskList({
	tasks,
	dialogActive,
}: {tasks: TodoItem[]; dialogActive?: boolean}) {
	const theme = useTheme();
	const hasInProgress = tasks.some(t => t.status === 'in_progress');
	const spinnerFrame = useSpinner(hasInProgress);

	if (tasks.length === 0 || dialogActive) return null;

	const completedCount = tasks.filter(t => t.status === 'completed').length;
	const totalCount = tasks.length;
	const inProgressTask = tasks.find(t => t.status === 'in_progress');
	const failedTask = tasks.find(t => t.status === 'failed');
	const allDone = completedCount === totalCount;

	let statusText: React.ReactNode;
	if (failedTask) {
		statusText = <Text color={theme.status.error}>✗ {failedTask.content}</Text>;
	} else if (allDone) {
		statusText = <Text color={theme.status.success}>✓ Done</Text>;
	} else if (inProgressTask) {
		statusText = (
			<Text color={theme.status.info}>
				{spinnerFrame} {inProgressTask.activeForm ?? inProgressTask.content}
			</Text>
		);
	}

	return (
		<Box>
			<Text bold>Tasks</Text>
			<Text dimColor> ({completedCount}/{totalCount})</Text>
			{statusText && <Text> </Text>}
			{statusText}
		</Box>
	);
}
```

**Step 3: Update app.tsx — remove collapsed state and Ctrl+T toggle**

Remove `taskListCollapsed`, `toggleTaskList`, and update `<TaskList>` props.

**Step 4: Run tests**

Run: `npx vitest run source/components/TaskList.test.tsx && npx vitest run`

Expected: PASS

**Step 5: Commit**

```bash
git add source/components/TaskList.tsx source/components/TaskList.test.tsx source/app.tsx
git commit -m "refactor: TaskList is now always a 1-line summary

Full task list is accessible via :tasks command. This enforces
the strict 4-line footer budget in non-dialog state."
```

---

### Task 14: Full Validation — Type Check, Lint, Tests

**Step 1: Type check**

Run: `npm run build`

Expected: No errors.

**Step 2: Lint**

Run: `npm run lint`

Expected: No errors.

**Step 3: Full test suite**

Run: `npm test`

Expected: All PASS.

**Step 4: Commit fixes if needed**

```bash
git add -A && git commit -m "chore: fix lint and type errors from UI stabilization"
```

---

## Task Dependency Graph

```
Task 1 (remove deferred promotion) ← independent
Task 2 (throttle header metrics)   ← independent
Task 3 (Ctrl+S → F9)               ← independent
Task 4 (truncateLine utility)       ← independent
Task 5 (1-line headers)             ← depends on Task 4
Task 6 (compact SubagentEvent)      ← depends on Task 4
Task 7 (preview metadata)           ← independent
Task 8 (collapse in container)      ← depends on Task 7
Task 9 (wire collapse + :open)      ← depends on Tasks 7, 8
Task 10 (consolidate Header)        ← depends on Task 4
Task 11 (remove StatusLine)         ← depends on Task 10
Task 12 (:tasks command)            ← independent
Task 13 (TaskList 1-line)           ← depends on Task 12
Task 14 (full validation)           ← depends on all
```

Parallelizable groups:

- **Group A:** Tasks 1, 2, 3, 4, 7, 12 (all independent)
- **Group B:** Tasks 5, 6, 8, 10, 13 (depend on Group A items)
- **Group C:** Tasks 9, 11 (depend on Group B items)
- **Group D:** Task 14 (depends on all)
