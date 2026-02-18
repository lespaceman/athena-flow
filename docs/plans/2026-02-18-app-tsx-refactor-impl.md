# app.tsx Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Decompose the 1833-line `source/app.tsx` into modular, testable units (~300-400 lines remaining) while fixing 6 identified bugs.

**Architecture:** Extract pure functions into `source/utils/format.ts` and `source/feed/timeline.ts` + `todoPanel.ts`. Extract stateful logic into custom hooks (`useFeedNavigation`, `useTodoPanel`, `useCommandMode`, `useFeedKeyboard`, `useTodoKeyboard`). Wire existing `DashboardFrame` + `DashboardInput` components. Consolidate duplicate `toAscii`/`fit` functions.

**Tech Stack:** React 19, Ink, TypeScript, vitest

---

### Task 1: Extract `source/utils/format.ts` with tests

**Files:**
- Create: `source/utils/format.ts`
- Create: `source/utils/format.test.ts`

**Step 1: Create `source/utils/format.ts`**

Move these functions verbatim from `source/app.tsx` (lines 90-163, 404-428, and label functions 110-163):

```typescript
// source/utils/format.ts

export function toAscii(value: string): string {
	return value.replace(/[^\x20-\x7e]/g, '?');
}

export function compactText(value: string, max: number): string {
	const clean = toAscii(value).replace(/\s+/g, ' ').trim();
	if (max <= 0) return '';
	if (clean.length <= max) return clean;
	if (max <= 3) return clean.slice(0, max);
	return `${clean.slice(0, max - 3)}...`;
}

export function fit(text: string, width: number): string {
	const clean = toAscii(text);
	if (width <= 0) return '';
	if (clean.length <= width) return clean.padEnd(width, ' ');
	if (width <= 3) return clean.slice(0, width);
	return `${clean.slice(0, width - 3)}...`;
}

export function formatClock(timestamp: number): string {
	const d = new Date(timestamp);
	const hh = String(d.getHours()).padStart(2, '0');
	const mm = String(d.getMinutes()).padStart(2, '0');
	const ss = String(d.getSeconds()).padStart(2, '0');
	return `${hh}:${mm}:${ss}`;
}

export function formatCount(value: number | null): string {
	if (value === null) return '--';
	return value.toLocaleString('en-US');
}

export function formatSessionLabel(sessionId: string | undefined): string {
	if (!sessionId) return 'S-';
	const tail = sessionId.replace(/[^a-zA-Z0-9]/g, '').slice(-4);
	return `S${tail || '-'}`;
}

export function formatRunLabel(runId: string | undefined): string {
	if (!runId) return 'R-';
	const direct = runId.match(/^(R\d+)$/i);
	if (direct) return direct[1]!.toUpperCase();
	const tail = runId.replace(/[^a-zA-Z0-9]/g, '').slice(-4);
	return `R${tail || '-'}`;
}

export function actorLabel(actorId: string): string {
	if (actorId === 'user') return 'USER';
	if (actorId === 'agent:root') return 'AGENT';
	if (actorId === 'system') return 'SYSTEM';
	if (actorId.startsWith('subagent:')) {
		return `SA-${compactText(actorId.slice('subagent:'.length), 8)}`;
	}
	return compactText(actorId.toUpperCase(), 12);
}

export function summarizeValue(value: unknown): string {
	if (typeof value === 'string') return compactText(JSON.stringify(value), 28);
	if (typeof value === 'number' || typeof value === 'boolean') {
		return String(value);
	}
	if (value === null || value === undefined) return String(value);
	if (Array.isArray(value)) return `[${value.length}]`;
	if (typeof value === 'object') return '{...}';
	return compactText(String(value), 20);
}

export function summarizeToolInput(input: Record<string, unknown>): string {
	const pairs = Object.entries(input)
		.slice(0, 2)
		.map(([key, value]) => `${key}=${summarizeValue(value)}`);
	return pairs.join(' ');
}

export function formatInputBuffer(
	value: string,
	cursorOffset: number,
	width: number,
	showCursor: boolean,
	placeholder: string,
): string {
	if (width <= 0) return '';
	if (value.length === 0) {
		if (!showCursor) return fit(placeholder, width);
		return fit(`|${placeholder}`, width);
	}

	if (!showCursor) {
		return fit(value, width);
	}

	const withCursor =
		value.slice(0, cursorOffset) + '|' + value.slice(cursorOffset);
	if (withCursor.length <= width) return withCursor.padEnd(width, ' ');

	const desiredStart = Math.max(0, cursorOffset + 1 - Math.floor(width * 0.65));
	const start = Math.min(desiredStart, withCursor.length - width);
	return fit(withCursor.slice(start, start + width), width);
}
```

**Step 2: Write tests for `source/utils/format.test.ts`**

```typescript
import {describe, it, expect} from 'vitest';
import {
	toAscii,
	compactText,
	fit,
	formatClock,
	formatCount,
	formatSessionLabel,
	formatRunLabel,
	actorLabel,
	summarizeValue,
	summarizeToolInput,
	formatInputBuffer,
} from './format.js';

describe('toAscii', () => {
	it('passes through printable ASCII', () => {
		expect(toAscii('hello world')).toBe('hello world');
	});
	it('replaces non-printable chars with ?', () => {
		expect(toAscii('hello\x01world')).toBe('hello?world');
	});
	it('replaces emoji with ?', () => {
		expect(toAscii('test🎉')).toBe('test??');
	});
});

describe('compactText', () => {
	it('returns empty for max <= 0', () => {
		expect(compactText('hello', 0)).toBe('');
	});
	it('returns text as-is when shorter than max', () => {
		expect(compactText('hi', 10)).toBe('hi');
	});
	it('truncates with ellipsis', () => {
		expect(compactText('hello world this is long', 10)).toBe('hello w...');
	});
	it('collapses whitespace', () => {
		expect(compactText('hello   world', 20)).toBe('hello world');
	});
	it('truncates without ellipsis when max <= 3', () => {
		expect(compactText('abcdef', 3)).toBe('abc');
	});
});

describe('fit', () => {
	it('pads short text', () => {
		expect(fit('hi', 5)).toBe('hi   ');
	});
	it('truncates long text with ellipsis', () => {
		expect(fit('hello world', 8)).toBe('hello...');
	});
	it('returns empty for width 0', () => {
		expect(fit('hello', 0)).toBe('');
	});
	it('returns exact width text unchanged', () => {
		expect(fit('abc', 3)).toBe('abc');
	});
});

describe('formatClock', () => {
	it('formats timestamp as HH:MM:SS', () => {
		// 2024-01-15 14:30:45 UTC
		const ts = new Date(2024, 0, 15, 14, 30, 45).getTime();
		expect(formatClock(ts)).toBe('14:30:45');
	});
	it('zero-pads single digits', () => {
		const ts = new Date(2024, 0, 1, 1, 2, 3).getTime();
		expect(formatClock(ts)).toBe('01:02:03');
	});
});

describe('formatCount', () => {
	it('returns -- for null', () => {
		expect(formatCount(null)).toBe('--');
	});
	it('formats number', () => {
		expect(formatCount(1234)).toBe('1,234');
	});
});

describe('formatSessionLabel', () => {
	it('returns S- for undefined', () => {
		expect(formatSessionLabel(undefined)).toBe('S-');
	});
	it('returns last 4 alphanumeric chars', () => {
		expect(formatSessionLabel('abc-1234')).toBe('S1234');
	});
});

describe('formatRunLabel', () => {
	it('returns R- for undefined', () => {
		expect(formatRunLabel(undefined)).toBe('R-');
	});
	it('returns direct match for R-number pattern', () => {
		expect(formatRunLabel('R42')).toBe('R42');
	});
	it('returns last 4 chars for other IDs', () => {
		expect(formatRunLabel('run-abcd-efgh')).toBe('Refgh');
	});
});

describe('actorLabel', () => {
	it('maps known actors', () => {
		expect(actorLabel('user')).toBe('USER');
		expect(actorLabel('agent:root')).toBe('AGENT');
		expect(actorLabel('system')).toBe('SYSTEM');
	});
	it('formats subagent with SA- prefix', () => {
		expect(actorLabel('subagent:myworker')).toBe('SA-myworker');
	});
});

describe('summarizeValue', () => {
	it('handles strings', () => {
		expect(summarizeValue('hello')).toBe('"hello"');
	});
	it('handles numbers', () => {
		expect(summarizeValue(42)).toBe('42');
	});
	it('handles arrays', () => {
		expect(summarizeValue([1, 2, 3])).toBe('[3]');
	});
	it('handles objects', () => {
		expect(summarizeValue({a: 1})).toBe('{...}');
	});
	it('handles null', () => {
		expect(summarizeValue(null)).toBe('null');
	});
});

describe('summarizeToolInput', () => {
	it('shows first 2 key-value pairs', () => {
		const result = summarizeToolInput({a: 1, b: 'hi', c: true});
		expect(result).toBe('a=1 b="hi"');
	});
});

describe('formatInputBuffer', () => {
	it('returns empty for width 0', () => {
		expect(formatInputBuffer('test', 0, 0, true, 'placeholder')).toBe('');
	});
	it('shows placeholder with cursor when empty', () => {
		expect(formatInputBuffer('', 0, 20, true, 'Type...')).toBe(
			'|Type...             ',
		);
	});
	it('shows placeholder without cursor when inactive', () => {
		expect(formatInputBuffer('', 0, 20, false, 'Type...')).toBe(
			'Type...             ',
		);
	});
});
```

**Step 3: Run tests to verify they pass**

Run: `npx vitest run source/utils/format.test.ts`
Expected: All tests PASS

**Step 4: Commit**

```bash
git add source/utils/format.ts source/utils/format.test.ts
git commit -m "refactor: extract formatting utilities to source/utils/format.ts"
```

---

### Task 2: Extract `source/feed/todoPanel.ts` with tests

**Files:**
- Create: `source/feed/todoPanel.ts`
- Create: `source/feed/todoPanel.test.ts`

**Step 1: Create `source/feed/todoPanel.ts`**

Move from `app.tsx` lines 47-81 (types) and 430-454 (functions):

```typescript
// source/feed/todoPanel.ts
import {type TodoItem} from '../types/todo.js';

export type TodoPanelStatus = 'open' | 'doing' | 'blocked' | 'done';

export type TodoPanelItem = {
	id: string;
	text: string;
	priority: 'P0' | 'P1' | 'P2';
	status: TodoPanelStatus;
	linkedEventId?: string;
	owner?: string;
	localOnly?: boolean;
};

export function toTodoStatus(status: TodoItem['status']): TodoPanelStatus {
	switch (status) {
		case 'in_progress':
			return 'doing';
		case 'completed':
			return 'done';
		case 'failed':
			return 'blocked';
		default:
			return 'open';
	}
}

export function symbolForTodoStatus(status: TodoPanelStatus): string {
	switch (status) {
		case 'done':
			return '[x]';
		case 'doing':
			return '[>]';
		case 'blocked':
			return '[!]';
		default:
			return '[ ]';
	}
}
```

**Step 2: Write tests**

```typescript
import {describe, it, expect} from 'vitest';
import {toTodoStatus, symbolForTodoStatus} from './todoPanel.js';

describe('toTodoStatus', () => {
	it('maps in_progress to doing', () => {
		expect(toTodoStatus('in_progress')).toBe('doing');
	});
	it('maps completed to done', () => {
		expect(toTodoStatus('completed')).toBe('done');
	});
	it('maps failed to blocked', () => {
		expect(toTodoStatus('failed')).toBe('blocked');
	});
	it('maps pending to open', () => {
		expect(toTodoStatus('pending')).toBe('open');
	});
});

describe('symbolForTodoStatus', () => {
	it('maps all statuses', () => {
		expect(symbolForTodoStatus('done')).toBe('[x]');
		expect(symbolForTodoStatus('doing')).toBe('[>]');
		expect(symbolForTodoStatus('blocked')).toBe('[!]');
		expect(symbolForTodoStatus('open')).toBe('[ ]');
	});
});
```

**Step 3: Run tests**

Run: `npx vitest run source/feed/todoPanel.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add source/feed/todoPanel.ts source/feed/todoPanel.test.ts
git commit -m "refactor: extract todo panel types and helpers to source/feed/todoPanel.ts"
```

---

### Task 3: Extract `source/feed/timeline.ts` with tests

**Files:**
- Create: `source/feed/timeline.ts`
- Create: `source/feed/timeline.test.ts`

**Step 1: Create `source/feed/timeline.ts`**

Move from `app.tsx` lines 52-63 (TimelineEntry), 65-71 (RunSummary), 165-402 (event functions), 456-491 (formatFeedLine, formatFeedHeaderLine, toRunStatus):

```typescript
// source/feed/timeline.ts
import {type FeedEvent} from './types.js';
import {type Message as MessageType} from '../types/index.js';
import {
	compactText,
	fit,
	formatClock,
	formatRunLabel,
	summarizeToolInput,
} from '../utils/format.js';

export type RunStatus = 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';

export type TimelineEntry = {
	id: string;
	ts: number;
	runId?: string;
	op: string;
	actor: string;
	summary: string;
	searchText: string;
	error: boolean;
	expandable: boolean;
	details: string;
};

export type RunSummary = {
	runId: string;
	title: string;
	status: RunStatus;
	startedAt: number;
	endedAt?: number;
};

// Move eventOperation, eventSummary, expansionForEvent, isEventError,
// isEventExpandable, deriveRunTitle verbatim from app.tsx lines 165-402.
// (Full code omitted for brevity — copy verbatim from app.tsx)

export function eventOperation(event: FeedEvent): string {
	// ... exact copy from app.tsx lines 165-216
}

export function eventSummary(event: FeedEvent): string {
	// ... exact copy from app.tsx lines 218-298
}

export function expansionForEvent(event: FeedEvent): string {
	// ... exact copy from app.tsx lines 300-345
}

export function isEventError(event: FeedEvent): boolean {
	// ... exact copy from app.tsx lines 347-361
}

export function isEventExpandable(event: FeedEvent): boolean {
	// ... exact copy from app.tsx lines 363-373
}

export function deriveRunTitle(
	currentPromptPreview: string | undefined,
	feedEvents: FeedEvent[],
	messages: MessageType[],
): string {
	// ... exact copy from app.tsx lines 375-402
}

export function formatFeedLine(
	entry: TimelineEntry,
	width: number,
	focused: boolean,
	expanded: boolean,
	matched: boolean,
): string {
	// ... exact copy from app.tsx lines 456-472
}

export function formatFeedHeaderLine(width: number): string {
	// ... exact copy from app.tsx lines 474-480
}

export function toRunStatus(
	event: Extract<FeedEvent, {kind: 'run.end'}>,
): RunStatus {
	// ... exact copy from app.tsx lines 482-491
}
```

**Step 2: Write tests** — focus on the pure functions with mock FeedEvent objects.

Test at minimum:
- `eventOperation` returns correct op strings for each event kind
- `isEventError` correctly identifies error events
- `isEventExpandable` returns true for the right event kinds
- `formatFeedLine` produces correct width output with focus/expand/match indicators
- `formatFeedHeaderLine` matches expected column layout
- `toRunStatus` maps run.end statuses correctly
- `deriveRunTitle` falls back through prompt preview → feed events → messages → 'Untitled run'

**Step 3: Run tests**

Run: `npx vitest run source/feed/timeline.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add source/feed/timeline.ts source/feed/timeline.test.ts
git commit -m "refactor: extract timeline entry mapping to source/feed/timeline.ts"
```

---

### Task 4: Update `DashboardFrame.tsx` to import from `utils/format.ts`

**Files:**
- Modify: `source/components/DashboardFrame.tsx:23-34` (remove duplicate `toAscii` and `fit`)

**Step 1: Replace local `toAscii` and `fit` with imports**

In `DashboardFrame.tsx`, remove lines 23-34 (the local `toAscii` and `fit` functions) and add:

```typescript
import {toAscii, fit} from '../utils/format.js';
```

Also remove the local `renderLine` function (line 36-38) and replace calls with inline `\`|${fit(content, innerWidth)}|\`` or import if used elsewhere.

**Step 2: Do the same for `DashboardInput.tsx`**

In `DashboardInput.tsx`, remove lines 18-29 (local `toAscii` and `fit`) and add the import.

**Step 3: Run existing tests**

Run: `npx vitest run source/components/DashboardFrame.test.ts source/components/DashboardInput.test.ts`
Expected: PASS (no behavior change)

**Step 4: Run full build**

Run: `npm run build`
Expected: SUCCESS

**Step 5: Commit**

```bash
git add source/components/DashboardFrame.tsx source/components/DashboardInput.tsx
git commit -m "refactor: consolidate toAscii/fit into utils/format.ts, remove duplicates"
```

---

### Task 5: Extract `source/hooks/useFeedNavigation.ts`

**Files:**
- Create: `source/hooks/useFeedNavigation.ts`

**Step 1: Create the hook**

Extract from `app.tsx` the feed navigation state and computed values:
- State: `feedCursor`, `tailFollow`, `expandedId`, `detailScroll`, `feedViewportStart`
- Effects: cursor clamping (line 874-878), tail-follow (880-883), expanded collapse on filter (901-905), detail scroll reset (897-899)
- Actions: `moveFeedCursor`, `jumpToTail`, `jumpToTop`, `toggleExpandedAtCursor`, `scrollDetail`

The hook signature:

```typescript
type UseFeedNavigationProps = {
	filteredEntries: TimelineEntry[];
	feedContentRows: number;
};

type UseFeedNavigationResult = {
	feedCursor: number;
	tailFollow: boolean;
	expandedId: string | null;
	detailScroll: number;
	feedViewportStart: number;
	visibleFeedEntries: TimelineEntry[];
	moveFeedCursor: (delta: number) => void;
	jumpToTail: () => void;
	jumpToTop: () => void;
	toggleExpandedAtCursor: () => void;
	scrollDetail: (delta: number) => void;
	setExpandedId: (id: string | null) => void;
	setTailFollow: (follow: boolean) => void;
	setFeedCursor: (cursor: number | ((prev: number) => number)) => void;
};
```

**Step 2: Run full test suite**

Run: `npm test`
Expected: PASS (hook is created but not yet wired)

**Step 3: Commit**

```bash
git add source/hooks/useFeedNavigation.ts
git commit -m "refactor: extract useFeedNavigation hook for feed viewport state"
```

---

### Task 6: Extract `source/hooks/useTodoPanel.ts`

**Files:**
- Create: `source/hooks/useTodoPanel.ts`

**Step 1: Create the hook**

Extract todo-related state from `app.tsx`:
- State: `todoVisible`, `todoShowDone`, `todoCursor`, `todoScroll`, `extraTodos`, `todoStatusOverrides`
- Computed: `todoItems` (from tasks + extraTodos + overrides), `visibleTodoItems`, counts
- Effects: cursor clamping (886-889), scroll adjustment (1311-1324), focus fallback (907-914)
- Actions for command mode: `toggleVisibility`, `toggleShowDone`, `setFocusTodo`, `addTodo`

```typescript
type UseTodoPanelProps = {
	tasks: TodoItem[];
	focusMode: FocusMode;
	setFocusMode: (mode: FocusMode) => void;
};
```

**Step 2: Run full test suite**

Run: `npm test`
Expected: PASS

**Step 3: Commit**

```bash
git add source/hooks/useTodoPanel.ts
git commit -m "refactor: extract useTodoPanel hook for todo panel state"
```

---

### Task 7: Extract `source/hooks/useCommandMode.ts`

**Files:**
- Create: `source/hooks/useCommandMode.ts`

**Step 1: Create the command dispatch function**

Extract `runCommand` from `app.tsx` lines 940-1051. Design it as a pure function that returns action objects instead of calling setState directly:

```typescript
type CommandAction =
	| {type: 'toggle-todo'}
	| {type: 'toggle-todo-done'}
	| {type: 'focus-todo'}
	| {type: 'add-todo'; priority: 'P0' | 'P1' | 'P2'; text: string}
	| {type: 'show-run-overlay'}
	| {type: 'filter-run'; runId: string}
	| {type: 'filter-all-runs'}
	| {type: 'jump-to-tail'}
	| {type: 'jump-to-event'; eventId: string}
	| {type: 'toggle-errors'}
	| {type: 'unknown'; command: string};

export function parseCommand(command: string): CommandAction {
	// ... parse and return action
}
```

This makes the command parsing testable without React.

**Step 2: Write tests for `parseCommand`**

```typescript
describe('parseCommand', () => {
	it('parses :todo', () => {
		expect(parseCommand(':todo')).toEqual({type: 'toggle-todo'});
	});
	it('parses :todo add p0 Fix bug', () => {
		expect(parseCommand(':todo add p0 Fix bug')).toEqual({
			type: 'add-todo',
			priority: 'P0',
			text: 'Fix bug',
		});
	});
	// ... etc for all commands
});
```

**Step 3: Run tests**

Run: `npx vitest run source/hooks/useCommandMode.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add source/hooks/useCommandMode.ts source/hooks/useCommandMode.test.ts
git commit -m "refactor: extract command mode parsing to useCommandMode"
```

---

### Task 8: Extract keyboard hooks

**Files:**
- Create: `source/hooks/useFeedKeyboard.ts`
- Create: `source/hooks/useTodoKeyboard.ts`

**Step 1: Create `useFeedKeyboard.ts`**

Extract feed-focus key handling from `app.tsx` lines 1415-1553 (the `// Feed focus` section of `useInput`). The hook accepts callbacks for all the actions it can trigger:

```typescript
type UseFeedKeyboardProps = {
	isActive: boolean;
	expandedEntry: TimelineEntry | null;
	feedNavigation: UseFeedNavigationResult;
	searchMatches: number[];
	searchMatchPos: number;
	setSearchMatchPos: (fn: (prev: number) => number) => void;
	setSearchQuery: (q: string) => void;
	setShowRunOverlay: (show: boolean) => void;
	cycleFocus: () => void;
	pageStep: number;
	detailPageStep: number;
	maxDetailScroll: number;
	setFocusMode: (mode: FocusMode) => void;
	setInputMode: (mode: InputMode) => void;
	setInputValue: (value: string) => void;
};
```

**Step 2: Create `useTodoKeyboard.ts`**

Extract todo-focus key handling from `app.tsx` lines 1359-1413.

**Step 3: Run full test suite**

Run: `npm test`
Expected: PASS

**Step 4: Commit**

```bash
git add source/hooks/useFeedKeyboard.ts source/hooks/useTodoKeyboard.ts
git commit -m "refactor: extract keyboard handlers to dedicated hooks"
```

---

### Task 9: Wire everything together in `app.tsx`

**Files:**
- Modify: `source/app.tsx` (major rewrite — the big integration step)

**Step 1: Rewrite `app.tsx`**

Replace the 1833-line file with the orchestrator version:
- Import all extracted modules
- `AppContent` wires hooks together and builds props for `DashboardFrame`
- Remove all inline utility functions, types, and rendering logic
- Fix Bug 1-5 during integration:
  - Bug 1 (indentation): fixed by extracting body-line assembly
  - Bug 2 (dead visibleIndexSet): don't reproduce the dead code
  - Bug 3 (mixed timestamps): normalize in `stableItems` with `getTime()` at creation
  - Bug 4 (dead prop): remove `claudeCodeVersion` from `Props`
  - Bug 5 (duplicate utils): already consolidated in Task 4

Target: ~300-400 lines.

**Step 2: Run full test suite**

Run: `npm test`
Expected: All existing tests PASS

**Step 3: Run lint**

Run: `npm run lint`
Expected: PASS (or fix any lint issues)

**Step 4: Run build**

Run: `npm run build`
Expected: SUCCESS

**Step 5: Commit**

```bash
git add source/app.tsx
git commit -m "refactor: slim app.tsx to orchestrator wiring extracted hooks and components"
```

---

### Task 10: Final verification

**Step 1: Run full test suite + lint + build**

```bash
npm test && npm run lint && npm run build
```
Expected: All PASS

**Step 2: Verify line count**

```bash
wc -l source/app.tsx
```
Expected: ~300-400 lines

**Step 3: Commit any remaining fixups**

```bash
git add -A
git commit -m "refactor: final cleanup after app.tsx modularization"
```
