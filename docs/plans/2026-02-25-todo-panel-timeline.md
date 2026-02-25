# Todo Panel → Progress Timeline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the todo panel from a filtered task list into a progress timeline that shows all stages (completed, active, pending), with elapsed times, visual hierarchy, and natural ordering.

**Architecture:** Six incremental changes across the glyph registry, panel types, hook, and renderer. Each change is independently shippable. The core insight: add a `'failed'` status to `TodoPanelStatus`, track start timestamps in `useTodoPanel`, switch default to show-all with definition ordering, and update `buildBodyLines` to render elapsed times + status suffixes with the new visual hierarchy.

**Tech Stack:** Ink + React 19, vitest, TypeScript ESM, chalk

**Design mockup:** `docs/mockup.html` (Before/After terminal rendering)

---

### Task 1: Add `'failed'` status and `✗` glyph to the registry

Currently `TodoPanelStatus` is `'open' | 'doing' | 'blocked' | 'done'`. The spec needs `'failed'` as a distinct status (red ✗) separate from `'blocked'` (amber □). Also, `toTodoStatus` maps `failed → blocked` which loses the distinction.

**Files:**

- Modify: `source/feed/todoPanel.ts:5` (add `'failed'` to union)
- Modify: `source/feed/todoPanel.ts:17-28` (`toTodoStatus` — map `'failed'` → `'failed'`)
- Modify: `source/feed/todoPanel.ts:38-42` (`TodoGlyphColors` — add `failed`, `blocked`, `text`, `textMuted` fields)
- Modify: `source/feed/todoPanel.ts:44-56` (`colorForStatus` — add `failed`, `blocked` cases)
- Modify: `source/feed/todoPanel.ts:58-74` (`todoGlyphs` — pass new colors through)
- Modify: `source/glyphs/registry.ts:8-20` (`GlyphKey` — add `'todo.failed'`)
- Modify: `source/glyphs/registry.ts:94-101` (`GLYPH_REGISTRY` — add `todo.failed` entry)
- Test: `source/feed/todoPanel.test.ts`

**Step 1: Write the failing tests**

Add tests to `source/feed/todoPanel.test.ts`:

```typescript
import {describe, it, expect} from 'vitest';
import {toTodoStatus, type TodoPanelStatus} from './todoPanel.js';

describe('toTodoStatus', () => {
	it('maps failed to failed (not blocked)', () => {
		expect(toTodoStatus('failed')).toBe('failed');
	});
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run source/feed/todoPanel.test.ts`
Expected: FAIL — `toTodoStatus('failed')` returns `'blocked'`, not `'failed'`

**Step 3: Add `'failed'` to `TodoPanelStatus` union**

In `source/feed/todoPanel.ts:5`, change:

```typescript
export type TodoPanelStatus = 'open' | 'doing' | 'blocked' | 'done' | 'failed';
```

**Step 4: Update `toTodoStatus` to map `'failed'` correctly**

In `source/feed/todoPanel.ts:17-28`, add a case before the default:

```typescript
export function toTodoStatus(status: TodoItem['status']): TodoPanelStatus {
	switch (status) {
		case 'in_progress':
			return 'doing';
		case 'completed':
			return 'done';
		case 'failed':
			return 'failed';
		default:
			return 'open';
	}
}
```

**Step 5: Expand `TodoGlyphColors` with new status colors**

In `source/feed/todoPanel.ts`, replace `TodoGlyphColors`:

```typescript
export type TodoGlyphColors = {
	doing: string;
	done: string;
	failed: string;
	blocked: string;
	text: string;
	textMuted: string;
	default: string;
};
```

**Step 6: Update `colorForStatus` to handle new statuses**

```typescript
function colorForStatus(
	status: TodoPanelStatus,
	colors: TodoGlyphColors,
): string {
	switch (status) {
		case 'doing':
			return colors.doing;
		case 'done':
			return colors.done;
		case 'failed':
			return colors.failed;
		case 'blocked':
			return colors.blocked;
		default:
			return colors.default;
	}
}
```

**Step 7: Add `'todo.failed'` to `GlyphKey` and `GLYPH_REGISTRY`**

In `source/glyphs/registry.ts`, add to the `GlyphKey` union (after `'todo.blocked'`):

```typescript
| 'todo.failed'
```

In `GLYPH_REGISTRY` (after `todo.blocked` entry):

```typescript
'todo.failed': {unicode: '✗', ascii: '!'},
```

**Step 8: Update color mapping at call site in `app.tsx`**

Where `todo.colors` is constructed (around line 692–696), expand to:

```typescript
colors: {
	doing: theme.status.warning,
	done: theme.status.success,
	failed: theme.status.error,
	blocked: theme.status.warning,
	text: theme.text,
	textMuted: theme.textMuted,
	default: theme.status.neutral,
}
```

**Step 9: Run tests to verify they pass**

Run: `npx vitest run source/feed/todoPanel.test.ts`
Expected: PASS

**Step 10: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS — all `TodoPanelStatus` switch exhaustiveness checks still work because `'failed'` falls through default where needed.

**Step 11: Commit**

```bash
git add source/feed/todoPanel.ts source/glyphs/registry.ts source/feed/todoPanel.test.ts source/app.tsx
git commit -m "feat(todo): add 'failed' status with ✗ glyph, expand TodoGlyphColors"
```

---

### Task 2: Show all stages by default + natural definition ordering

The current default is `todoShowDone = false` and items are sorted by `STATUS_ORDER` (doing → open → done). The spec requires: show all items by default, in definition order (array index from `tasks`).

**Files:**

- Modify: `source/hooks/useTodoPanel.ts:11-16` (remove `STATUS_ORDER`)
- Modify: `source/hooks/useTodoPanel.ts:52` (flip `todoShowDone` default to `true`)
- Modify: `source/hooks/useTodoPanel.ts:75-82` (remove sort, keep filter only)
- Test: `source/hooks/useTodoPanel.test.ts` (if exists, otherwise inline verification)

**Step 1: Write the failing test**

Create or add to a test file for `useTodoPanel`. Since this is a hook, test the sorted output:

```typescript
// In a new or existing test for useTodoPanel
// Verify that items maintain definition order (not status-sorted)
// and that done items are visible by default
```

If no hook test exists, we verify via integration after the change.

**Step 2: Flip `todoShowDone` default**

In `source/hooks/useTodoPanel.ts:52`, change:

```typescript
const [todoShowDone, setTodoShowDone] = useState(true);
```

**Step 3: Remove STATUS_ORDER sort, preserve filter**

In `source/hooks/useTodoPanel.ts:75-82`, replace:

```typescript
const sortedItems = useMemo(() => {
	return todoShowDone
		? todoItems
		: todoItems.filter(todo => todo.status !== 'done');
}, [todoItems, todoShowDone]);
```

The `STATUS_ORDER` constant (lines 11-16) can be deleted entirely.

**Step 4: Run tests + typecheck**

Run: `npx vitest run source/ && npx tsc --noEmit`
Expected: PASS

**Step 5: Commit**

```bash
git add source/hooks/useTodoPanel.ts
git commit -m "feat(todo): show all stages by default in definition order"
```

---

### Task 3: Visual hierarchy — dim completed, brighten active, color failed/blocked

Update `buildBodyLines.ts` to apply the spec's three-tier visual hierarchy using chalk. This is the core rendering change.

**Files:**

- Modify: `source/utils/buildBodyLines.ts:174-186` (item rendering loop)
- Modify: `source/feed/todoPanel.ts:58-74` (`todoGlyphs` — add `styledText` method)
- Test: `source/feed/todoPanel.test.ts`

**Step 1: Write failing tests for styled text output**

Add tests that verify the `styledText` helper returns chalk-styled strings per status:

```typescript
describe('todoGlyphs with colors', () => {
	// Set chalk.level = 3 in beforeEach, restore in afterEach
	it('dims done glyph with chalk.dim', () => {
		const g = todoGlyphs(false, testColors);
		const glyph = g.statusGlyph('done');
		// Verify it contains ANSI dim escape
		expect(glyph).toContain('\x1b[2m');
	});
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run source/feed/todoPanel.test.ts`

**Step 3: Extend `todoGlyphs` return type with `styledRow` helper**

Add a `styledRow` method to `TodoGlyphs` that returns `{glyph, text, suffix, elapsed}` all pre-styled:

```typescript
export type TodoGlyphs = {
	statusGlyph: (status: TodoPanelStatus) => string;
	styledRow: (
		item: TodoPanelItem,
		opts: {elapsed?: string},
	) => {
		glyph: string;
		text: (raw: string) => string;
		suffix: string;
		elapsed: (raw: string) => string;
	};
	caret: string;
	dividerChar: string;
	scrollUp: string;
	scrollDown: string;
};
```

Implementation in `todoGlyphs()`:

```typescript
styledRow(item: TodoPanelItem, opts: {elapsed?: string} = {}) {
	if (!colors) {
		return {
			glyph: table[item.status],
			text: (raw: string) => raw,
			suffix: '',
			elapsed: (raw: string) => raw,
		};
	}
	const status = item.status;
	switch (status) {
		case 'done':
			return {
				glyph: chalk.dim(chalk.hex(colors.done)(table.done)),
				text: (raw: string) => chalk.hex(colors.textMuted)(raw),
				suffix: '',
				elapsed: (raw: string) => chalk.dim(chalk.hex(colors.textMuted)(raw)),
			};
		case 'doing':
			return {
				glyph: chalk.hex(colors.doing)(table.doing),
				text: (raw: string) => chalk.hex(colors.text)(raw),
				suffix: chalk.hex(colors.doing)('← active'),
				elapsed: () => '',
			};
		case 'failed':
			return {
				glyph: chalk.hex(colors.failed)(table.failed),
				text: (raw: string) => chalk.hex(colors.text)(raw),
				suffix: chalk.hex(colors.failed)('← failed'),
				elapsed: (raw: string) => chalk.dim(chalk.hex(colors.textMuted)(raw)),
			};
		case 'blocked':
			return {
				glyph: chalk.hex(colors.blocked)(table.blocked),
				text: (raw: string) => chalk.dim(chalk.hex(colors.blocked)(raw)),
				suffix: chalk.hex(colors.blocked)('← blocked'),
				elapsed: () => '',
			};
		default: // open
			return {
				glyph: chalk.hex(colors.textMuted)(table.open),
				text: (raw: string) => chalk.hex(colors.textMuted)(raw),
				suffix: '',
				elapsed: () => '',
			};
	}
},
```

**Step 4: Update `buildBodyLines.ts` item rendering loop**

Replace lines 174-186 with:

```typescript
for (let i = 0; i < renderSlots; i++) {
	const item = items[tScroll + i];
	if (!item) {
		bodyLines.push(fitAnsi('', innerWidth));
		continue;
	}
	const isFocused = todoFocus === 'todo' && tCursor === tScroll + i;
	const caret = isFocused ? g.caret : ' ';
	const row = g.styledRow(item, {elapsed: item.elapsed});

	const glyphStr = row.glyph;
	const suffixStr = row.suffix;
	const elapsedStr = item.elapsed ? row.elapsed(item.elapsed) : '';

	// Layout: [caret] [glyph]  [text...] [suffix] [elapsed]
	const fixedWidth = 4; // caret + space + glyph + 2 spaces
	const suffixWidth = suffixStr ? stripAnsi(suffixStr).length + 1 : 0;
	const elapsedWidth = elapsedStr ? stripAnsi(elapsedStr).length + 1 : 0;
	const maxTitleWidth = Math.max(
		1,
		innerWidth - fixedWidth - suffixWidth - elapsedWidth,
	);
	const title = row.text(fitAnsi(item.text, maxTitleWidth).trimEnd());

	let line = `${caret} ${glyphStr}  ${title}`;
	if (suffixStr) line += ` ${suffixStr}`;
	// Right-align elapsed time
	if (elapsedStr) {
		const currentLen = stripAnsi(line).length;
		const pad = Math.max(
			1,
			innerWidth - currentLen - stripAnsi(elapsedStr).length,
		);
		line += ' '.repeat(pad) + elapsedStr;
	}
	bodyLines.push(fitAnsi(line, innerWidth));
}
```

Note: `stripAnsi` may need to be imported (check if it exists in the project or use `strip-ansi` package).

**Step 5: Run tests + typecheck + lint**

Run: `npx vitest run source/ && npx tsc --noEmit && npm run lint`
Expected: PASS

**Step 6: Commit**

```bash
git add source/feed/todoPanel.ts source/utils/buildBodyLines.ts source/feed/todoPanel.test.ts
git commit -m "feat(todo): visual hierarchy — dim done, brighten active, color failed/blocked"
```

---

### Task 4: Elapsed time tracking in `useTodoPanel`

Track when each task transitions to `doing` and compute duration when it moves to `done`/`failed`. Store as a formatted string on `TodoPanelItem`.

**Files:**

- Modify: `source/feed/todoPanel.ts:7-15` (add `elapsed?: string` to `TodoPanelItem`)
- Modify: `source/hooks/useTodoPanel.ts` (add `startedAtMap` ref, compute elapsed on status change)
- Create: `source/utils/formatElapsed.ts` (pure utility)
- Test: `source/utils/formatElapsed.test.ts`

**Step 1: Write failing tests for `formatElapsed`**

Create `source/utils/formatElapsed.test.ts`:

```typescript
import {describe, it, expect} from 'vitest';
import {formatElapsed} from './formatElapsed.js';

describe('formatElapsed', () => {
	it('formats seconds under 60', () => {
		expect(formatElapsed(3000)).toBe('3s');
		expect(formatElapsed(42000)).toBe('42s');
	});
	it('formats minutes under 60', () => {
		expect(formatElapsed(128000)).toBe('2m08s');
		expect(formatElapsed(930000)).toBe('15m30s');
	});
	it('formats hours', () => {
		expect(formatElapsed(4920000)).toBe('1h22m');
	});
	it('handles zero', () => {
		expect(formatElapsed(0)).toBe('0s');
	});
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/utils/formatElapsed.test.ts`
Expected: FAIL — module not found

**Step 3: Implement `formatElapsed`**

Create `source/utils/formatElapsed.ts`:

```typescript
/**
 * Format a duration in milliseconds to a compact human string.
 * - Under 60s: `{n}s`
 * - 1–60 min: `{n}m{ss}s`
 * - Over 60 min: `{n}h{mm}m`
 */
export function formatElapsed(ms: number): string {
	const totalSeconds = Math.round(ms / 1000);
	if (totalSeconds < 60) return `${totalSeconds}s`;
	const totalMinutes = Math.floor(totalSeconds / 60);
	const secs = totalSeconds % 60;
	if (totalMinutes < 60)
		return `${totalMinutes}m${String(secs).padStart(2, '0')}s`;
	const hours = Math.floor(totalMinutes / 60);
	const mins = totalMinutes % 60;
	return `${hours}h${String(mins).padStart(2, '0')}m`;
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run source/utils/formatElapsed.test.ts`
Expected: PASS

**Step 5: Add `elapsed` field to `TodoPanelItem`**

In `source/feed/todoPanel.ts:7-15`:

```typescript
export type TodoPanelItem = {
	id: string;
	text: string;
	priority: 'P0' | 'P1' | 'P2';
	status: TodoPanelStatus;
	linkedEventId?: string;
	owner?: string;
	localOnly?: boolean;
	elapsed?: string; // Formatted duration string (e.g., '12s', '2m08s')
};
```

**Step 6: Track start times and compute elapsed in `useTodoPanel`**

In `source/hooks/useTodoPanel.ts`, add a `useRef` for tracking start timestamps. In the `todoItems` useMemo, compute elapsed:

```typescript
// After existing state declarations
const startedAtRef = useRef<Map<string, number>>(new Map());

const todoItems = useMemo((): TodoPanelItem[] => {
	const fromTasks = tasks.map((task, index) => {
		const id = `task-${index}-${task.content.replace(/[^a-zA-Z0-9]/g, '').slice(0, 16)}`;
		const status = toTodoStatus(task.status);
		return {
			id,
			text: task.content,
			priority: 'P1' as const,
			status,
			owner: 'main',
		};
	});
	const merged = [...fromTasks, ...extraTodos].map(todo => ({
		...todo,
		status: todoStatusOverrides[todo.id] ?? todo.status,
	}));

	// Track start times and compute elapsed
	const now = Date.now();
	const startedAt = startedAtRef.current;
	return merged.map(todo => {
		if (todo.status === 'doing' && !startedAt.has(todo.id)) {
			startedAt.set(todo.id, now);
		}
		let elapsed: string | undefined;
		if (
			(todo.status === 'done' || todo.status === 'failed') &&
			startedAt.has(todo.id)
		) {
			elapsed = formatElapsed(now - startedAt.get(todo.id)!);
		}
		return {...todo, elapsed};
	});
}, [tasks, extraTodos, todoStatusOverrides]);
```

Import `formatElapsed` at the top:

```typescript
import {formatElapsed} from '../utils/formatElapsed.js';
```

**Step 7: Run tests + typecheck**

Run: `npx vitest run source/ && npx tsc --noEmit`
Expected: PASS

**Step 8: Commit**

```bash
git add source/utils/formatElapsed.ts source/utils/formatElapsed.test.ts source/feed/todoPanel.ts source/hooks/useTodoPanel.ts
git commit -m "feat(todo): track elapsed time per stage, display on completed/failed tasks"
```

---

### Task 5: Update `STATUS_ORDER` in `useTodoPanel` for `'failed'` status

The `toggleTodoStatus` callback and any remaining references to `STATUS_ORDER` need to handle `'failed'`. Since we removed the sort in Task 2, this is about ensuring the toggle cycles correctly.

**Files:**

- Modify: `source/hooks/useTodoPanel.ts:138-146` (toggle should not toggle failed tasks to open — keep them failed)

**Step 1: Verify toggle behavior**

The existing toggle cycles `done ↔ open`. A `failed` task should not be togglable to `open` via spacebar — that would lose the failure signal. The toggle should skip `failed` items (or cycle `failed → done → open`).

Decision: **Skip toggle for `failed`** — failed status is set by the agent, not the user.

In `source/hooks/useTodoPanel.ts:138-146`:

```typescript
const toggleTodoStatus = useCallback((index: number) => {
	const selected = visibleTodoItemsRef.current[index];
	if (!selected || selected.status === 'failed') return; // Don't toggle failed
	setTodoStatusOverrides(prev => ({
		...prev,
		[selected.id]:
			(prev[selected.id] ?? selected.status) === 'done' ? 'open' : 'done',
	}));
}, []);
```

**Step 2: Run tests + typecheck**

Run: `npx vitest run source/ && npx tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
git add source/hooks/useTodoPanel.ts
git commit -m "fix(todo): prevent toggling failed tasks via keyboard"
```

---

### Task 6: Final integration — lint, typecheck, full test suite

**Step 1: Run full lint**

Run: `npm run lint`
Expected: PASS (fix any issues)

**Step 2: Run full typecheck**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 3: Run full test suite**

Run: `npx vitest run source/`
Expected: PASS

**Step 4: Manual verification**

Run `npm run build && npm run start` with a workflow that uses TodoWrite events. Verify:

- All stages visible (completed + active + pending)
- Completed stages show ✓ glyph (dimmed green) with elapsed time right-aligned
- Active stage shows ■ glyph (amber) with `← active` suffix
- Pending stages show □ glyph (muted)
- Failed stages (if any) show ✗ glyph (red) with `← failed` suffix
- Items appear in definition order, not sorted by status

**Step 5: Commit**

```bash
git add -A
git commit -m "chore(todo): lint and integration fixes for timeline panel"
```

---

## Summary of Changes by File

| File                                 | Change                                                                                                                |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `source/feed/todoPanel.ts`           | Add `'failed'` to status union, expand `TodoGlyphColors`, add `styledRow()` method, add `elapsed` to `TodoPanelItem`  |
| `source/glyphs/registry.ts`          | Add `'todo.failed'` glyph key + `✗`/`!` entry                                                                         |
| `source/hooks/useTodoPanel.ts`       | Default `todoShowDone=true`, remove `STATUS_ORDER` sort, track start timestamps, compute elapsed, guard failed toggle |
| `source/utils/buildBodyLines.ts`     | Use `styledRow()` for visual hierarchy, render suffix + right-aligned elapsed                                         |
| `source/utils/formatElapsed.ts`      | **New** — pure duration formatter                                                                                     |
| `source/app.tsx`                     | Expand `todo.colors` object with new fields                                                                           |
| `source/feed/todoPanel.test.ts`      | Tests for `toTodoStatus('failed')`, styled output                                                                     |
| `source/utils/formatElapsed.test.ts` | **New** — tests for duration formatting                                                                               |

## Not Implemented (Out of Scope per Spec)

- Progress bar in header (`████░░░ 5/8`)
- Spinner/pulsing active marker animation
- Auto-scroll-to-active for long lists (deferred to follow-up)
- Nested/hierarchical tasks
- Per-task detail expansion
