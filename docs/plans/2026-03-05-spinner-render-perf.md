# Spinner Render Performance Fix Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate the ~93% CPU usage caused by the spinner triggering expensive full-frame re-renders every 200ms.

**Architecture:** The spinner (`useSpinner`) lives in `AppContent`, firing `setState` every 200ms. This invalidates the `prefixBodyLines` useMemo (which includes `spinnerFrame` as a dependency), recomputing `buildBodyLines` → `fitAnsi` → `stringWidth` for the entire todo panel. Ink then diffs the full terminal output character-by-character via `ansi-tokenize`. Fix by: (1) slowing the spinner, (2) isolating the spinner line from the expensive memo, (3) disabling spinner for large feeds, (4) deleting the unused `TaskList` component that has its own redundant spinner.

**Tech Stack:** React 19, Ink 6.7, Vitest 3.0, TypeScript 5.7

---

### Task 1: Reduce spinner interval from 200ms to 500ms

**Files:**
- Modify: `src/ui/hooks/useSpinner.ts:4`
- Modify: `src/ui/hooks/useSpinner.test.ts:24-46`

**Step 1: Update test expectations for 500ms interval**

In `src/ui/hooks/useSpinner.test.ts`, change the test that validates timing:

```typescript
// Change test name and timing assertions
it('cycles through braille frames at 500ms intervals', () => {
    const {result} = renderHook(() => useSpinner(true));

    expect(result.current).toBe('\u280B');

    act(() => {
        vi.advanceTimersByTime(500);
    });
    expect(result.current).toBe('\u2819');

    act(() => {
        vi.advanceTimersByTime(500);
    });
    expect(result.current).toBe('\u2839');
});
```

Also update the wrap-around test:

```typescript
it('wraps around after last frame', () => {
    const {result} = renderHook(() => useSpinner(true));

    // Advance through all 10 frames (10 * 500ms = 5000ms)
    act(() => {
        vi.advanceTimersByTime(5000);
    });
    expect(result.current).toBe('\u280B'); // Back to first
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/hooks/useSpinner.test.ts`
Expected: FAIL — timing mismatch since implementation still uses 200ms.

**Step 3: Change the interval constant**

In `src/ui/hooks/useSpinner.ts`, line 4:

```typescript
const SPINNER_INTERVAL_MS = 500;
```

Also update the JSDoc on line 8:

```typescript
 * Cycles through frames at 500ms when active, returns '' when inactive.
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/ui/hooks/useSpinner.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/ui/hooks/useSpinner.ts src/ui/hooks/useSpinner.test.ts
git commit -m "perf: reduce spinner interval from 200ms to 500ms"
```

---

### Task 2: Isolate spinner line from `prefixBodyLines` memo

This is the highest-impact fix. Currently `spinnerFrame` is a dependency of the `prefixBodyLines` useMemo in `AppContent` (`src/app/shell/AppShell.tsx:696-735`). Every 500ms tick invalidates the entire memo, recomputing `buildBodyLines` which calls `fitAnsi`/`stringWidth` on every todo row. We'll split the todo header line (the one containing the spinner) into a separate memo so the expensive todo-item lines aren't recomputed on spinner ticks.

**Files:**
- Modify: `src/ui/layout/buildBodyLines.ts`
- Modify: `src/ui/layout/buildBodyLines.test.ts`
- Modify: `src/app/shell/AppShell.tsx`

**Step 1: Add `buildTodoHeaderLine` export to `buildBodyLines.ts`**

Add a new exported function that builds only the todo status header line (the one with the spinner glyph). This extracts lines 60-76 from `buildBodyLines`:

```typescript
/**
 * Build just the todo panel header line ("● WORKING  2/5 tasks done").
 * Separated so the spinner glyph can update independently of todo item rows.
 */
export function buildTodoHeaderLine(
    innerWidth: number,
    todo: Pick<TodoViewState, 'ascii' | 'appMode' | 'spinnerFrame' | 'colors' | 'doneCount' | 'totalCount'>,
    theme: Theme,
): string {
    const isWorking = todo.appMode === 'working';
    const idleGlyph = todo.ascii ? '*' : '\u25CF';
    const rawLeadGlyph = isWorking ? todo.spinnerFrame : idleGlyph;
    const leadColor = isWorking ? theme.status.warning : theme.status.success;
    const leadGlyph = chalk.hex(leadColor)(rawLeadGlyph);
    const statusWord = isWorking ? 'WORKING' : 'IDLE';
    const statusColor = isWorking ? todo.colors?.doing : theme.status.success;
    const coloredStatus = statusColor
        ? chalk.hex(statusColor)(statusWord)
        : statusWord;
    const stats =
        todo.totalCount > 0
            ? `  ${chalk.hex(theme.text)(`${todo.doneCount}/${todo.totalCount}`)} ${chalk.hex(theme.textMuted)('tasks done')}`
            : '';
    return fitAnsi(`${leadGlyph} ${coloredStatus}${stats}`, innerWidth);
}
```

**Step 2: Modify `buildBodyLines` to use `buildTodoHeaderLine`**

Replace lines 60-76 in `buildBodyLines` with a call to the new function:

```typescript
if (actualTodoRows > 0) {
    // ... destructuring stays the same ...
    bodyLines.push(buildTodoHeaderLine(innerWidth, todo, theme));
    // ... rest of the function (item rows, scroll indicators, divider) unchanged ...
}
```

**Step 3: Write test for `buildTodoHeaderLine`**

Add to `src/ui/layout/buildBodyLines.test.ts`:

```typescript
import {buildBodyLines, buildTodoHeaderLine} from './buildBodyLines';
// ... existing imports ...

describe('buildTodoHeaderLine', () => {
    it('shows IDLE with dot glyph when not working', () => {
        const line = buildTodoHeaderLine(80, {
            ascii: true,
            appMode: 'idle',
            spinnerFrame: '',
            doneCount: 2,
            totalCount: 5,
        }, defaultTheme);
        const plain = stripAnsi(line);
        expect(plain).toContain('IDLE');
        expect(plain).toContain('2/5');
    });

    it('shows WORKING with spinner glyph when working', () => {
        const line = buildTodoHeaderLine(80, {
            ascii: false,
            appMode: 'working',
            spinnerFrame: '\u280B',
            colors: {doing: '#facc15', done: '#888', failed: '#f00', blocked: '#facc15', text: '#fff', textMuted: '#888', default: '#888'},
            doneCount: 1,
            totalCount: 3,
        }, defaultTheme);
        const plain = stripAnsi(line);
        expect(plain).toContain('WORKING');
        expect(plain).toContain('\u280B');
    });
});
```

**Step 4: Run tests**

Run: `npx vitest run src/ui/layout/buildBodyLines.test.ts`
Expected: PASS

**Step 5: Update `AppShell.tsx` — split spinner out of `prefixBodyLines`**

In `src/app/shell/AppShell.tsx`, add import:

```typescript
import {buildBodyLines, buildTodoHeaderLine} from '../../ui/layout/buildBodyLines';
```

Replace the single `prefixBodyLines` useMemo (lines 696-735) with two memos:

```typescript
// Memo 1: Todo header line (depends on spinnerFrame — updates every 500ms)
const todoHeaderLine = useMemo(
    () =>
        actualTodoRows > 0
            ? buildTodoHeaderLine(innerWidth, {
                    ascii: useAscii,
                    appMode: appMode.type,
                    spinnerFrame,
                    colors: todoColors,
                    doneCount: todoPanel.doneCount,
                    totalCount: todoPanel.todoItems.length,
                }, theme)
            : null,
    [
        actualTodoRows,
        innerWidth,
        useAscii,
        appMode.type,
        spinnerFrame,
        todoColors,
        todoPanel.doneCount,
        todoPanel.todoItems.length,
        theme,
    ],
);

// Memo 2: Remaining body lines (does NOT depend on spinnerFrame)
const prefixBodyLines = useMemo(
    () =>
        buildBodyLines({
            innerWidth,
            todo: {
                actualTodoRows,
                todoPanel: {
                    todoScroll: todoPanel.todoScroll,
                    todoCursor: todoPanel.todoCursor,
                    visibleTodoItems: todoPanel.visibleTodoItems,
                },
                focusMode,
                ascii: useAscii,
                colors: todoColors,
                appMode: appMode.type,
                doneCount: todoPanel.doneCount,
                totalCount: todoPanel.todoItems.length,
                spinnerFrame: '', // placeholder — header line rendered separately
            },
            runOverlay: {actualRunOverlayRows, runSummaries, runFilter: 'all'},
            theme,
        }),
    [
        innerWidth,
        actualTodoRows,
        todoPanel.todoScroll,
        todoPanel.todoCursor,
        todoPanel.visibleTodoItems,
        focusMode,
        useAscii,
        todoColors,
        appMode.type,
        todoPanel.doneCount,
        todoPanel.todoItems.length,
        actualRunOverlayRows,
        runSummaries,
        theme,
    ],
);
```

**Step 6: Update the JSX render to insert `todoHeaderLine` before `prefixBodyLines`**

In the JSX (around line 793), change:

```tsx
{prefixBodyLines.map((line, index) => (
    <Text key={`body-${index}`}>{withBorderEdges(frameLine(line))}</Text>
))}
```

To:

```tsx
{todoHeaderLine !== null && (
    <Text key="todo-header">{withBorderEdges(frameLine(todoHeaderLine))}</Text>
)}
{prefixBodyLines.map((line, index) => (
    <Text key={`body-${index}`}>{withBorderEdges(frameLine(line))}</Text>
))}
```

**Step 7: Skip the header line in `buildBodyLines` when `spinnerFrame` is empty placeholder**

We need `buildBodyLines` to NOT emit the header line when it's being rendered separately. The simplest approach: check if `actualTodoRows > 0` still pushes the header line. Since we pass `spinnerFrame: ''`, the header line will have an empty glyph which is incorrect. Instead, modify `buildBodyLines` to accept an optional `skipHeader` flag:

In `buildBodyLines.ts`, add to `TodoViewState`:

```typescript
export type TodoViewState = {
    // ... existing fields ...
    skipHeader?: boolean;
};
```

Then in `buildBodyLines`, wrap the header push:

```typescript
if (actualTodoRows > 0) {
    // ... destructuring ...
    if (!todo.skipHeader) {
        bodyLines.push(buildTodoHeaderLine(innerWidth, todo, theme));
    }
    // ... rest unchanged ...
}
```

And in `AppShell.tsx`, pass `skipHeader: true` in the `prefixBodyLines` memo:

```typescript
todo: {
    // ... other fields ...
    spinnerFrame: '',
    skipHeader: true,
},
```

**Step 8: Run full test suite**

Run: `npx vitest run src/ui/layout/buildBodyLines.test.ts`
Run: `npm run typecheck`
Expected: PASS

**Step 9: Commit**

```bash
git add src/ui/layout/buildBodyLines.ts src/ui/layout/buildBodyLines.test.ts src/app/shell/AppShell.tsx
git commit -m "perf: isolate spinner line from prefixBodyLines memo"
```

---

### Task 3: Disable spinner animation for large feeds

When there are many feed entries, each Ink render cycle is more expensive because FeedGrid produces more `<Text>` nodes. Disable the spinner animation (show a static glyph) when the feed is large.

**Files:**
- Modify: `src/app/shell/AppShell.tsx:627-629`

**Step 1: Add feed size threshold to spinner activation**

In `src/app/shell/AppShell.tsx`, change the `useSpinner` call (line 627-629):

```typescript
const spinnerFrame = useSpinner(
    appMode.type === 'working' &&
    todoPanel.todoVisible &&
    !pagerActive &&
    filteredEntries.length < 500,
);
```

This disables the spinner animation (returns `''`) when the feed exceeds 500 entries. The `buildTodoHeaderLine` function already falls back to the static `idleGlyph` when `spinnerFrame` is empty AND `appMode` is working — wait, no it doesn't. We need a small tweak.

**Step 2: Handle the "working but no animation" case in `buildTodoHeaderLine`**

In `buildTodoHeaderLine`, change the glyph fallback so that when working but spinnerFrame is empty (disabled), we use the static dot:

```typescript
const rawLeadGlyph = isWorking
    ? (todo.spinnerFrame || (todo.ascii ? '*' : '\u25CF'))
    : (todo.ascii ? '*' : '\u25CF');
```

This ensures we still show WORKING status with a static glyph when animation is disabled.

**Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add src/app/shell/AppShell.tsx src/ui/layout/buildBodyLines.ts
git commit -m "perf: disable spinner animation for large feeds (>500 entries)"
```

---

### Task 4: Delete unused `TaskList` component

`TaskList` is not imported anywhere except its own test file. It contains its own `useSpinner` call which would be another render source if it were ever mounted. Remove it to prevent accidental reuse.

**Files:**
- Delete: `src/ui/components/TaskList.tsx`
- Delete: `src/ui/components/TaskList.test.tsx`

**Step 1: Verify TaskList is unused**

Run: `npx grep -r "TaskList" src/ --include="*.ts" --include="*.tsx" | grep -v "TaskList.tsx" | grep -v "TaskList.test"`

Expected: No results (only its own files reference it).

**Step 2: Delete the files**

```bash
rm src/ui/components/TaskList.tsx src/ui/components/TaskList.test.tsx
```

**Step 3: Run typecheck and tests**

Run: `npm run typecheck`
Run: `npm test`
Expected: PASS — nothing references these files.

**Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove unused TaskList component"
```

---

### Task 5: Final verification

**Step 1: Run full lint, typecheck, and test suite**

```bash
npm run typecheck
npm run lint
npm test
```

Expected: All PASS.

**Step 2: Run dead code detection**

```bash
npm run lint:dead
```

Expected: No new dead code introduced.

**Step 3: Manual smoke test**

Start the app and observe CPU usage:

```bash
npm run build && node dist/cli.js
```

Verify:
- Spinner animates at a visibly slower cadence (~500ms)
- Todo panel header updates without visible jank
- CPU usage during idle working state is noticeably lower than before

---

## Summary of changes

| File | Change | Impact |
|------|--------|--------|
| `src/ui/hooks/useSpinner.ts` | 200ms → 500ms | 2.5x fewer renders/sec |
| `src/ui/layout/buildBodyLines.ts` | Extract `buildTodoHeaderLine`, add `skipHeader` | Spinner ticks skip expensive todo-item recomputation |
| `src/app/shell/AppShell.tsx` | Split `prefixBodyLines` into two memos; add feed size threshold | Spinner-only updates are cheap; large feeds disable animation |
| `src/ui/components/TaskList.tsx` | Deleted (unused) | Remove dead code with redundant spinner |
| `src/ui/components/TaskList.test.tsx` | Deleted | Remove dead test |

**Expected CPU reduction:** From ~93% down to ~15-25% during working state. The combination of 2.5x fewer ticks, each tick only recomputing a single header line (not the full body), and disabling animation for large feeds addresses all three bottleneck layers (render frequency, render cost per frame, worst-case scaling).
