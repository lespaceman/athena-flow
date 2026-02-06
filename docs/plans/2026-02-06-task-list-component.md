# Task List Component Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a read-only, collapsible task progress display component that shows multi-step workflow state with animated spinners, replacing the existing `TodoWriteEvent` component.

**Architecture:** The new `TaskList` component is a standalone Ink component that accepts task data and renders an expandable/collapsible progress list. It replaces `TodoWriteEvent` in `app.tsx`, reusing the existing `ink-task-list` and `cli-spinners` dependencies. A `useTaskListToggle` hook manages the `t` key toggle. The task data still flows from `useContentOrdering` (which extracts TodoWrite events from hook events), but the rendering is fully specified by the new component.

**Tech Stack:** Ink 6, React 19, ink-task-list, cli-spinners, vitest, ink-testing-library

---

## Architecture Overview

```
useContentOrdering (extracts activeTodoList from events)
  │
  ▼
app.tsx renders <TaskList> (replaces <TodoWriteEvent>)
  │
  ├── TaskList.tsx         — Main component: header, toggle, collapsed/expanded
  │     ├── TaskItem.tsx   — Individual task row (state symbol + name)
  │     └── useSpinner.ts  — Braille spinner animation hook (80ms)
  │
  └── types/todo.ts        — Extended with 'failed' state
```

### Files to Create/Modify

| Action | File                                        | Purpose                                      |
| ------ | ------------------------------------------- | -------------------------------------------- |
| Create | `source/components/TaskList.tsx`            | Main TaskList component                      |
| Create | `source/components/TaskList.test.tsx`       | Tests for TaskList                           |
| Create | `source/hooks/useSpinner.ts`                | Braille spinner animation hook               |
| Create | `source/hooks/useSpinner.test.ts`           | Tests for useSpinner                         |
| Modify | `source/types/todo.ts`                      | Add `'failed'` to TodoStatus                 |
| Modify | `source/app.tsx`                            | Replace `<TodoWriteEvent>` with `<TaskList>` |
| Delete | `source/components/TodoWriteEvent.tsx`      | Replaced by TaskList                         |
| Delete | `source/components/TodoWriteEvent.test.tsx` | Replaced by TaskList tests                   |

---

### Task 1: Add `'failed'` state to TodoStatus type

**Files:**

- Modify: `source/types/todo.ts`

**Step 1: Write the failing test**

Add a type-level test to verify the `'failed'` state is accepted:

```typescript
// In a temporary check - the real test is the TypeScript compiler
// Verify that TodoItem accepts 'failed' status
const failedItem: TodoItem = {
	content: 'Process records',
	status: 'failed',
};
```

Since this is a type change, the "test" is that TypeScript compilation succeeds.

**Step 2: Update the type**

In `source/types/todo.ts`:

```typescript
export type TodoStatus = 'pending' | 'in_progress' | 'completed' | 'failed';
```

**Step 3: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (no errors)

**Step 4: Commit**

```bash
git add source/types/todo.ts
git commit -m "feat(types): add 'failed' status to TodoStatus"
```

---

### Task 2: Create `useSpinner` hook

**Files:**

- Create: `source/hooks/useSpinner.ts`
- Create: `source/hooks/useSpinner.test.ts`

**Step 1: Write the failing test**

Create `source/hooks/useSpinner.test.ts`:

```typescript
import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {renderHook, act} from '@testing-library/react';
import {useSpinner} from './useSpinner.js';

const BRAILLE_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

describe('useSpinner', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('returns first frame initially when active', () => {
		const {result} = renderHook(() => useSpinner(true));
		expect(result.current).toBe(BRAILLE_FRAMES[0]);
	});

	it('cycles through braille frames at 80ms intervals', () => {
		const {result} = renderHook(() => useSpinner(true));

		expect(result.current).toBe('⠋');

		act(() => {
			vi.advanceTimersByTime(80);
		});
		expect(result.current).toBe('⠙');

		act(() => {
			vi.advanceTimersByTime(80);
		});
		expect(result.current).toBe('⠹');
	});

	it('wraps around after last frame', () => {
		const {result} = renderHook(() => useSpinner(true));

		// Advance through all 10 frames (10 * 80ms = 800ms)
		act(() => {
			vi.advanceTimersByTime(800);
		});
		expect(result.current).toBe('⠋'); // Back to first
	});

	it('returns empty string and does not tick when inactive', () => {
		const {result} = renderHook(() => useSpinner(false));
		expect(result.current).toBe('');

		act(() => {
			vi.advanceTimersByTime(500);
		});
		expect(result.current).toBe('');
	});

	it('stops and resets when deactivated', () => {
		const {result, rerender} = renderHook(({active}) => useSpinner(active), {
			initialProps: {active: true},
		});

		act(() => {
			vi.advanceTimersByTime(160); // Advance 2 frames
		});
		expect(result.current).toBe('⠹');

		rerender({active: false});
		expect(result.current).toBe('');
	});
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/hooks/useSpinner.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Write minimal implementation**

Create `source/hooks/useSpinner.ts`:

```typescript
import {useState, useEffect} from 'react';

const BRAILLE_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const SPINNER_INTERVAL_MS = 80;

/**
 * Hook that returns an animated braille spinner character.
 * Cycles through frames at 80ms when active, returns '' when inactive.
 */
export function useSpinner(active: boolean): string {
	const [frameIndex, setFrameIndex] = useState(0);

	useEffect(() => {
		if (!active) {
			setFrameIndex(0);
			return;
		}

		const timer = setInterval(() => {
			setFrameIndex(i => (i + 1) % BRAILLE_FRAMES.length);
		}, SPINNER_INTERVAL_MS);

		return () => clearInterval(timer);
	}, [active]);

	if (!active) return '';
	return BRAILLE_FRAMES[frameIndex] ?? '⠋';
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run source/hooks/useSpinner.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add source/hooks/useSpinner.ts source/hooks/useSpinner.test.ts
git commit -m "feat: add useSpinner hook for braille animation"
```

---

### Task 3: Create `TaskList` component

**Files:**

- Create: `source/components/TaskList.tsx`
- Create: `source/components/TaskList.test.tsx`

**Step 1: Write the failing tests**

Create `source/components/TaskList.test.tsx`:

```typescript
import React from 'react';
import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {render} from 'ink-testing-library';
import TaskList from './TaskList.js';
import {type TodoItem} from '../types/todo.js';

describe('TaskList', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	const baseTasks: TodoItem[] = [
		{content: 'Setup environment', status: 'completed'},
		{content: 'Fetch data from API', status: 'completed'},
		{content: 'Processing records', status: 'in_progress', activeForm: 'Processing records...'},
		{content: 'Generate report', status: 'pending'},
		{content: 'Cleanup', status: 'pending'},
	];

	it('renders header with progress counter and all task items', () => {
		const {lastFrame} = render(<TaskList tasks={baseTasks} />);
		const frame = lastFrame() ?? '';

		// Header
		expect(frame).toContain('Tasks');
		expect(frame).toContain('2/5');

		// Task items
		expect(frame).toContain('Setup environment');
		expect(frame).toContain('Fetch data from API');
		expect(frame).toContain('Processing records');
		expect(frame).toContain('Generate report');
		expect(frame).toContain('Cleanup');

		// State symbols
		expect(frame).toContain('✓'); // completed
		expect(frame).toContain('·'); // pending
	});

	it('renders collapsed view with toggle indicator and current task', () => {
		const {lastFrame} = render(<TaskList tasks={baseTasks} collapsed />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('▶');
		expect(frame).toContain('Tasks');
		expect(frame).toContain('2/5');
		expect(frame).toContain('Processing records');

		// Should NOT show individual task items in collapsed mode
		expect(frame).not.toContain('Setup environment');
		expect(frame).not.toContain('Cleanup');
	});

	it('renders expanded view with toggle indicator', () => {
		const {lastFrame} = render(<TaskList tasks={baseTasks} collapsed={false} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('▼');
	});

	it('shows "Done" when all tasks completed in collapsed view', () => {
		const allDone: TodoItem[] = [
			{content: 'Step 1', status: 'completed'},
			{content: 'Step 2', status: 'completed'},
		];
		const {lastFrame} = render(<TaskList tasks={allDone} collapsed />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('2/2');
		expect(frame).toContain('✓');
		expect(frame).toContain('Done');
	});

	it('shows failed state with cross symbol and error text', () => {
		const withFailed: TodoItem[] = [
			{content: 'Setup', status: 'completed'},
			{content: 'Process records', status: 'failed'},
			{content: 'Report', status: 'pending'},
		];
		const {lastFrame} = render(<TaskList tasks={withFailed} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('✗');
		expect(frame).toContain('Process records');
		expect(frame).toContain('failed');
	});

	it('shows failed state in collapsed view', () => {
		const withFailed: TodoItem[] = [
			{content: 'Setup', status: 'completed'},
			{content: 'Process records', status: 'failed'},
			{content: 'Report', status: 'pending'},
		];
		const {lastFrame} = render(<TaskList tasks={withFailed} collapsed />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('✗');
		expect(frame).toContain('Failed');
		expect(frame).toContain('Process records');
	});

	it('renders empty state', () => {
		const {lastFrame} = render(<TaskList tasks={[]} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('Tasks');
		expect(frame).toContain('0/0');
	});

	it('handles single task', () => {
		const single: TodoItem[] = [
			{content: 'Only task', status: 'in_progress'},
		];
		const {lastFrame} = render(<TaskList tasks={single} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('0/1');
		expect(frame).toContain('Only task');
	});

	it('calls onToggle when provided', () => {
		const onToggle = vi.fn();
		const {stdin} = render(
			<TaskList tasks={baseTasks} onToggle={onToggle} />,
		);

		stdin.write('t');
		expect(onToggle).toHaveBeenCalled();
	});
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/components/TaskList.test.tsx`
Expected: FAIL with "Cannot find module"

**Step 3: Write the TaskList component**

Create `source/components/TaskList.tsx`:

```tsx
import React from 'react';
import {Box, Text, useInput} from 'ink';
import {useSpinner} from '../hooks/useSpinner.js';
import {type TodoItem} from '../types/todo.js';

type Props = {
	tasks: TodoItem[];
	collapsed?: boolean;
	onToggle?: () => void;
};

// ── State rendering constants ────────────────────────────────────────

const STATE_SYMBOLS = {
	completed: '✓',
	in_progress: '', // Replaced by spinner
	pending: '·',
	failed: '✗',
} as const;

const STATE_COLORS = {
	completed: 'green',
	in_progress: 'cyan',
	pending: 'gray',
	failed: 'red',
} as const;

// ── Sub-components ───────────────────────────────────────────────────

function TaskItem({
	task,
	spinnerFrame,
}: {
	task: TodoItem;
	spinnerFrame: string;
}) {
	const color = STATE_COLORS[task.status];
	const symbol =
		task.status === 'in_progress' ? spinnerFrame : STATE_SYMBOLS[task.status];
	const isDim = task.status === 'pending';
	const isFailed = task.status === 'failed';

	return (
		<Box>
			<Text color={color}>{symbol} </Text>
			<Text dimColor={isDim} color={isFailed ? 'red' : undefined}>
				{task.content}
			</Text>
			{isFailed && <Text color="red"> — failed</Text>}
		</Box>
	);
}

// ── Main component ──────────────────────────────────────────────────

export default function TaskList({tasks, collapsed = false, onToggle}: Props) {
	const hasInProgress = tasks.some(t => t.status === 'in_progress');
	const spinnerFrame = useSpinner(hasInProgress);

	useInput(input => {
		if (input === 't' && onToggle) {
			onToggle();
		}
	});

	const completedCount = tasks.filter(t => t.status === 'completed').length;
	const totalCount = tasks.length;
	const toggleIndicator = collapsed ? '▶' : '▼';

	const inProgressTask = tasks.find(t => t.status === 'in_progress');
	const failedTask = tasks.find(t => t.status === 'failed');
	const allDone = totalCount > 0 && completedCount === totalCount;

	// ── Collapsed view ──────────────────────────────────────────────

	if (collapsed) {
		let statusText: React.ReactNode;
		if (failedTask) {
			statusText = <Text color="red">✗ Failed: {failedTask.content}</Text>;
		} else if (allDone) {
			statusText = <Text color="green">✓ Done</Text>;
		} else if (inProgressTask) {
			statusText = (
				<Text color="cyan">
					{spinnerFrame} {inProgressTask.content}
				</Text>
			);
		}

		return (
			<Box marginBottom={1}>
				<Text dimColor>{toggleIndicator} </Text>
				<Text bold>Tasks</Text>
				<Text dimColor>
					{' '}
					({completedCount}/{totalCount})
				</Text>
				{statusText && <Text> </Text>}
				{statusText}
			</Box>
		);
	}

	// ── Expanded view ───────────────────────────────────────────────

	return (
		<Box flexDirection="column" marginBottom={1}>
			<Box>
				<Text dimColor>{toggleIndicator} </Text>
				<Text bold>Tasks</Text>
				<Text dimColor>
					{' '}
					({completedCount}/{totalCount})
				</Text>
			</Box>
			<Box flexDirection="column" paddingLeft={2}>
				{tasks.map((task, i) => (
					<TaskItem
						key={`${i}-${task.content}`}
						task={task}
						spinnerFrame={spinnerFrame}
					/>
				))}
			</Box>
		</Box>
	);
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run source/components/TaskList.test.tsx`
Expected: PASS

**Step 5: Run lint and typecheck**

Run: `npm run lint && npx tsc --noEmit`
Expected: PASS

**Step 6: Commit**

```bash
git add source/components/TaskList.tsx source/components/TaskList.test.tsx
git commit -m "feat: add TaskList component with expanded/collapsed views"
```

---

### Task 4: Integrate TaskList into App, replace TodoWriteEvent

**Files:**

- Modify: `source/app.tsx`
- Delete: `source/components/TodoWriteEvent.tsx`
- Delete: `source/components/TodoWriteEvent.test.tsx`

**Step 1: Update app.tsx**

Replace the `TodoWriteEvent` import and usage:

1. Remove: `import TodoWriteEvent from './components/TodoWriteEvent.js';`
2. Add: `import TaskList from './components/TaskList.js';`
3. Add state and handler for collapsed toggle:

```typescript
const [taskListCollapsed, setTaskListCollapsed] = useState(false);
const toggleTaskList = useCallback(() => {
	setTaskListCollapsed(c => !c);
}, []);
```

4. Replace the rendering section. Change:

```tsx
{
	activeTodoList && <TodoWriteEvent event={activeTodoList} />;
}
```

To:

```tsx
{
	activeTodoList &&
		(() => {
			const payload = activeTodoList.payload;
			if (!isPreToolUseEvent(payload)) return null;
			const input = payload.tool_input as TodoWriteInput;
			const todos = Array.isArray(input.todos) ? input.todos : [];
			return (
				<TaskList
					tasks={todos}
					collapsed={taskListCollapsed}
					onToggle={toggleTaskList}
				/>
			);
		})();
}
```

5. Add imports for `isPreToolUseEvent` and `TodoWriteInput`:

```typescript
import {isPreToolUseEvent} from './types/hooks/index.js';
import {type TodoWriteInput} from './types/todo.js';
```

**Step 2: Delete old files**

```bash
rm source/components/TodoWriteEvent.tsx source/components/TodoWriteEvent.test.tsx
```

**Step 3: Verify no other imports of TodoWriteEvent exist**

Run: `grep -r "TodoWriteEvent" source/`
Expected: No results

**Step 4: Run all tests**

Run: `npm test`
Expected: PASS (TodoWriteEvent tests removed, TaskList tests pass)

**Step 5: Run lint and typecheck**

Run: `npm run lint && npx tsc --noEmit`
Expected: PASS

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: replace TodoWriteEvent with TaskList component

Integrates the new collapsible TaskList into app.tsx and removes the
old TodoWriteEvent. The TaskList supports expanded/collapsed toggle
with 't' key, animated braille spinner, and failed state display."
```

---

### Task 5: Format and final verification

**Step 1: Run formatter**

Run: `npm run format`

**Step 2: Run full lint + typecheck + test suite**

Run: `npm run lint && npx tsc --noEmit && npm test`
Expected: All PASS

**Step 3: Commit any formatting changes**

```bash
git add -A
git commit -m "style: format with prettier"
```

---

## Summary of Changes

| File                                        | Action   | Description                                                       |
| ------------------------------------------- | -------- | ----------------------------------------------------------------- |
| `source/types/todo.ts`                      | Modified | Added `'failed'` to `TodoStatus`                                  |
| `source/hooks/useSpinner.ts`                | Created  | Braille spinner animation hook (80ms interval)                    |
| `source/hooks/useSpinner.test.ts`           | Created  | Tests for spinner hook                                            |
| `source/components/TaskList.tsx`            | Created  | Main TaskList component (expanded/collapsed, toggle, states)      |
| `source/components/TaskList.test.tsx`       | Created  | Tests for TaskList component                                      |
| `source/app.tsx`                            | Modified | Replaced `<TodoWriteEvent>` with `<TaskList>`, added toggle state |
| `source/components/TodoWriteEvent.tsx`      | Deleted  | Replaced by TaskList                                              |
| `source/components/TodoWriteEvent.test.tsx` | Deleted  | Replaced by TaskList tests                                        |
