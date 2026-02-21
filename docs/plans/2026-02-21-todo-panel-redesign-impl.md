# TODO Panel Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace bracket-glyph TODO panel with Unicode-first, ASCII-fallback design using clean status glyphs and smarter space management.

**Architecture:** Refactor in-place within the existing `buildBodyLines` string pipeline. New glyph function with ascii param, new header/item format, scroll affordances, space-aware done-dropping. Sort items as doing→open/blocked→done.

**Tech Stack:** Ink + React 19, vitest, TypeScript ESM

---

### Task 1: Add `--ascii` CLI flag and ascii mode detection

**Files:**
- Modify: `source/cli.tsx:66-98` (add flag)
- Modify: `source/app.tsx:38-50` (add prop), `source/app.tsx:577` (compute ascii)

**Step 1: Add `--ascii` flag to meow config in `source/cli.tsx`**

In the `flags` object (around line 66), add:

```typescript
ascii: {
	type: 'boolean',
	default: false,
},
```

Pass it to `<App>`:

```typescript
ascii={cli.flags.ascii}
```

**Step 2: Add `ascii` prop to App and compute `useAscii`**

In `source/app.tsx`, add `ascii?: boolean` to the `Props` type. Inside the `MainApp` component (near the `hasColor` line ~577), compute:

```typescript
const useAscii = props.ascii || !hasColor || !isUtf8Locale();
```

Add a simple helper (top of file or in `source/utils/format.ts`):

```typescript
function isUtf8Locale(): boolean {
	const lang = process.env['LANG'] ?? process.env['LC_ALL'] ?? '';
	return /utf-?8/i.test(lang);
}
```

Thread `useAscii` into `buildBodyLines` calls via the `todo` state object (add `ascii: boolean` to `TodoViewState`).

**Step 3: Commit**

```bash
git add source/cli.tsx source/app.tsx
git commit -m "feat(todo): add --ascii CLI flag and ascii mode detection"
```

---

### Task 2: Redesign glyph function with Unicode/ASCII variants

**Files:**
- Modify: `source/feed/todoPanel.ts`
- Modify: `source/feed/todoPanel.test.ts`

**Step 1: Write the failing tests**

Replace the `symbolForTodoStatus` test in `source/feed/todoPanel.test.ts`:

```typescript
describe('glyphForTodoStatus', () => {
	it('returns Unicode glyphs by default', () => {
		expect(glyphForTodoStatus('doing')).toBe('⟳');
		expect(glyphForTodoStatus('open')).toBe('○');
		expect(glyphForTodoStatus('done')).toBe('✓');
		expect(glyphForTodoStatus('blocked')).toBe('○');
	});

	it('returns ASCII glyphs when ascii=true', () => {
		expect(glyphForTodoStatus('doing', true)).toBe('~');
		expect(glyphForTodoStatus('open', true)).toBe('-');
		expect(glyphForTodoStatus('done', true)).toBe('x');
		expect(glyphForTodoStatus('blocked', true)).toBe('-');
	});
});

describe('todoCaret', () => {
	it('returns Unicode caret by default', () => {
		expect(todoCaret(false)).toBe('▶');
	});

	it('returns ASCII caret when ascii=true', () => {
		expect(todoCaret(true)).toBe('>');
	});
});

describe('todoDivider', () => {
	it('returns Unicode divider by default', () => {
		expect(todoDivider(40, false)).toBe('─'.repeat(40));
	});

	it('returns ASCII divider when ascii=true', () => {
		expect(todoDivider(40, true)).toBe('-'.repeat(40));
	});
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run source/feed/todoPanel.test.ts`
Expected: FAIL — functions not defined

**Step 3: Implement the new glyph functions**

In `source/feed/todoPanel.ts`, replace `symbolForTodoStatus` and add new exports:

```typescript
export function glyphForTodoStatus(status: TodoPanelStatus, ascii = false): string {
	if (ascii) {
		switch (status) {
			case 'doing': return '~';
			case 'done': return 'x';
			default: return '-'; // open, blocked
		}
	}
	switch (status) {
		case 'doing': return '⟳';
		case 'done': return '✓';
		default: return '○'; // open, blocked
	}
}

export function todoCaret(ascii = false): string {
	return ascii ? '>' : '▶';
}

export function todoDivider(width: number, ascii = false): string {
	return (ascii ? '-' : '─').repeat(width);
}

export function todoScrollUp(ascii = false): string {
	return ascii ? '^' : '▲';
}

export function todoScrollDown(ascii = false): string {
	return ascii ? 'v' : '▼';
}
```

Keep `symbolForTodoStatus` temporarily for backward compat (remove in Task 4 when buildBodyLines is updated).

**Step 4: Run tests to verify they pass**

Run: `npx vitest run source/feed/todoPanel.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add source/feed/todoPanel.ts source/feed/todoPanel.test.ts
git commit -m "feat(todo): add Unicode/ASCII glyph functions for todo panel"
```

---

### Task 3: Add sorted items to useTodoPanel

**Files:**
- Modify: `source/hooks/useTodoPanel.ts`

**Step 1: Add `sortedItems` computed property**

In `useTodoPanel`, add a `useMemo` after `visibleTodoItems` that sorts items into doing→open/blocked→done order:

```typescript
const sortedItems = useMemo(() => {
	const statusOrder: Record<TodoPanelStatus, number> = {
		doing: 0,
		open: 1,
		blocked: 1,
		done: 2,
	};
	return [...visibleTodoItems].sort(
		(a, b) => (statusOrder[a.status] ?? 1) - (statusOrder[b.status] ?? 1),
	);
}, [visibleTodoItems]);
```

**Step 2: Replace `visibleTodoItems` with `sortedItems` in the return**

Change the return object: replace `visibleTodoItems` value with `sortedItems` but keep the property name `visibleTodoItems` so callers don't need to change:

```typescript
visibleTodoItems: sortedItems,
```

Also update the ref: `visibleTodoItemsRef.current = sortedItems;`

And update the cursor clamp effect to use `sortedItems.length`.

**Step 3: Compute `remainingCount` (non-done items)**

```typescript
const remainingCount = todoItems.filter(todo => todo.status !== 'done').length;
```

Add `remainingCount` to the return type and object.

**Step 4: Commit**

```bash
git add source/hooks/useTodoPanel.ts
git commit -m "feat(todo): sort items doing→open→done and expose remainingCount"
```

---

### Task 4: Redesign buildBodyLines TODO rendering

**Files:**
- Modify: `source/utils/buildBodyLines.ts`
- Modify: `source/utils/buildBodyLines.ts` — update `TodoViewState` type

**Step 1: Update TodoViewState type**

Add `ascii: boolean` and `remainingCount: number` to `TodoViewState`. Remove `todoShowDone` since the new design always shows done (space permitting). Add `remainingCount` to the todoPanel sub-object:

```typescript
export type TodoViewState = {
	actualTodoRows: number;
	todoPanel: {
		todoScroll: number;
		todoCursor: number;
		remainingCount: number;
		visibleTodoItems: TodoPanelItem[];
	};
	focusMode: string;
	ascii: boolean;
};
```

Remove unused fields: `openCount`, `doingCount`, `doneCount`, `blockedCount`, `todoShowDone`, `runLabel`.

**Step 2: Rewrite the TODO section in buildBodyLines**

Replace lines 127-146 with the new rendering logic:

```typescript
if (actualTodoRows > 0) {
	const {todoScroll: tScroll, todoCursor: tCursor, remainingCount, visibleTodoItems: items} = tp;
	const ascii = todo.ascii;

	// Header line: "TODO" left, "N remaining" right
	const headerLeft = 'TODO';
	const headerRight = `${remainingCount} remaining`;
	const headerGap = Math.max(1, innerWidth - headerLeft.length - headerRight.length);
	bodyLines.push(fit(`${headerLeft}${' '.repeat(headerGap)}${headerRight}`, innerWidth));

	const itemSlots = actualTodoRows - 2; // minus header and divider
	const totalItems = items.length;
	const hasScrollUp = tScroll > 0;
	const hasScrollDown = tScroll + itemSlots < totalItems;

	// Scroll affordances consume item slots
	let renderSlots = itemSlots;
	if (hasScrollUp) renderSlots--;
	if (hasScrollDown) renderSlots--;

	if (hasScrollUp) {
		bodyLines.push(fit(todoScrollUp(ascii), innerWidth));
	}

	for (let i = 0; i < renderSlots; i++) {
		const item = items[tScroll + i];
		if (!item) {
			bodyLines.push(fit('', innerWidth));
			continue;
		}
		const isFocused = todoFocus === 'todo' && tCursor === tScroll + i;
		const caret = isFocused ? todoCaret(ascii) : ' ';
		const glyph = glyphForTodoStatus(item.status, ascii);
		const prefix = `${caret} ${glyph}  `;
		const maxTitleWidth = innerWidth - prefix.length;
		const title = maxTitleWidth > 3
			? fitAnsi(item.text, maxTitleWidth).trimEnd()
			: item.text.slice(0, Math.max(1, maxTitleWidth));
		bodyLines.push(fit(`${prefix}${title}`, innerWidth));
	}

	if (hasScrollDown) {
		const moreCount = totalItems - (tScroll + renderSlots);
		bodyLines.push(fit(`${todoScrollDown(ascii)}  +${moreCount} more`, innerWidth));
	}

	// Divider line
	bodyLines.push(fit(todoDivider(innerWidth, ascii), innerWidth));
}
```

Update imports at top of file: replace `symbolForTodoStatus` import with `glyphForTodoStatus, todoCaret, todoDivider, todoScrollUp, todoScrollDown`.

**Step 3: Update app.tsx to pass new fields**

In the `buildBodyLines` call in `source/app.tsx`, update the `todo` object to match the new `TodoViewState`:
- Add `ascii: useAscii`
- Add `remainingCount` from todoPanel
- Remove `runLabel`, `todoShowDone`, and the individual count fields

**Step 4: Run full test suite**

Run: `npm test`
Expected: PASS (existing todoPanel.test.ts updated in Task 2 should still pass)

**Step 5: Run lint and typecheck**

Run: `npm run lint` and `npx tsc --noEmit`
Expected: PASS

**Step 6: Commit**

```bash
git add source/utils/buildBodyLines.ts source/app.tsx source/feed/todoPanel.ts
git commit -m "feat(todo): redesign TODO panel with Unicode glyphs, scroll affordances, and simplified header"
```

---

### Task 5: Update useLayout for space-aware done-dropping

**Files:**
- Modify: `source/hooks/useLayout.ts`

**Step 1: Make TODO panel height dynamic**

Change the height calculation to account for the new format (header + items + divider = items + 2):

```typescript
const TODO_PANEL_MIN_ROWS = 3; // header + 1 item + divider
const TODO_PANEL_MAX_ROWS = 12; // generous max

const todoItemCount = todoPanel.visibleTodoItems.length;
const todoRowsTarget = todoPanel.todoVisible
	? Math.min(TODO_PANEL_MAX_ROWS, 2 + Math.max(1, todoItemCount)) // header + items + divider
	: 0;
```

The rest of the space allocation logic (remainingRows subtraction) stays the same.

**Step 2: Commit**

```bash
git add source/hooks/useLayout.ts
git commit -m "feat(todo): dynamic panel height with generous max for scroll"
```

---

### Task 6: Remove old symbolForTodoStatus and clean up

**Files:**
- Modify: `source/feed/todoPanel.ts` (remove `symbolForTodoStatus`)
- Modify: `source/utils/buildBodyLines.ts` (remove old import if still present)
- Modify: `source/feed/todoPanel.test.ts` (remove old test)

**Step 1: Remove `symbolForTodoStatus` from `todoPanel.ts`**

Delete the function entirely.

**Step 2: Remove any remaining imports of `symbolForTodoStatus`**

Search across codebase and remove.

**Step 3: Remove the old test**

In `todoPanel.test.ts`, remove the `symbolForTodoStatus` describe block.

**Step 4: Run full test suite, lint, typecheck**

Run: `npm test && npm run lint && npx tsc --noEmit`
Expected: all PASS

**Step 5: Commit**

```bash
git add -u
git commit -m "refactor(todo): remove deprecated symbolForTodoStatus"
```

---

### Task 7: Final verification

**Step 1: Build**

Run: `npm run build`
Expected: PASS

**Step 2: Manual smoke test**

Run: `npm run start` and verify:
- TODO panel renders with Unicode glyphs (`⟳`, `○`, `✓`, `▶`)
- Header shows `TODO  N remaining`
- Items sorted: in-progress first, then todo, then done (dim)
- Scroll affordances appear when items overflow
- Divider renders as `─` repeated line
- With `NO_COLOR=1`, falls back to ASCII (`~`, `-`, `x`, `>`, `-` divider)

**Step 3: Run full suite one more time**

Run: `npm test && npm run lint && npx tsc --noEmit`
Expected: all PASS
