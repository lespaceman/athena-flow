# app.tsx Refactor Design

**Date**: 2026-02-18
**Goal**: Decompose the 1833-line `source/app.tsx` into modular, testable units while fixing identified bugs.

## Problem

`app.tsx` contains ~7 distinct concerns in a single file:
1. ~30 pure utility functions (string formatting, label generation)
2. FeedEvent → TimelineEntry mapping (event classification, summarization, expansion)
3. Todo panel types & logic
4. Run summaries derivation
5. Keyboard input handling (~230 lines, 3 focus modes with nested conditionals)
6. Command mode parsing (`:todo`, `:run`, `:jump`, `:errors`, `:tail`)
7. ASCII frame rendering (body line assembly)

Additionally, `DashboardFrame.tsx` and `DashboardInput.tsx` exist as extracted components but **app.tsx doesn't use them** — it re-implements frame rendering inline.

## Bugs & Gaps

1. **Indentation/scoping fragility (lines 1666-1705)**: Feed rendering block has inconsistent indent levels inside an else branch. Works syntactically but fragile for future edits.
2. **Dead `visibleIndexSet` check**: The overscan set always contains viewport indices, making the `visibleIndexSet.has(idx)` check always true.
3. **Mixed timestamp types in `stableItems`**: Messages use `Date` objects, feed events use `number`. Comparison works via `getTime()` but is fragile.
4. **Dead `claudeCodeVersion` prop**: Listed in `Props` type, omitted in `AppContent`, never used.
5. **No tests** for any of the ~30 pure utility functions.
6. **Duplicated `toAscii`/`fit`** in both `app.tsx` and `DashboardFrame.tsx`.

## Approach

Wire app.tsx to use existing `DashboardFrame` + `DashboardInput` components. Extract pure functions and hooks into focused modules.

## New Files

### `source/utils/format.ts` (~80 lines)
General-purpose string formatting utilities:
- `toAscii(value)` — strip non-printable chars
- `compactText(value, max)` — truncate with ellipsis
- `fit(text, width)` — pad or truncate to exact width
- `formatClock(timestamp)` — HH:MM:SS
- `formatCount(value)` — locale-formatted number or `--`
- `formatSessionLabel(sessionId)` — `S{tail4}`
- `formatRunLabel(runId)` — `R{tail4}` or direct match
- `actorLabel(actorId)` — USER/AGENT/SYSTEM/SA-*
- `summarizeValue(value)` — compact display of any value
- `summarizeToolInput(input)` — first 2 key=value pairs
- `formatInputBuffer(value, cursor, width, showCursor, placeholder)` — input line with cursor

### `source/feed/timeline.ts` (~200 lines)
Feed-event-to-timeline mapping (compliant with feed boundary rule — imports only `feed/types.ts`):
- Types: `TimelineEntry`, `RunStatus`, `RunSummary`
- `eventOperation(event)` — classify event kind to op string
- `eventSummary(event)` — one-line summary per event kind
- `expansionForEvent(event)` — JSON detail payload
- `isEventError(event)` — error classification
- `isEventExpandable(event)` — expandability check
- `formatFeedLine(entry, width, focused, expanded, matched)` — render one feed row
- `formatFeedHeaderLine(width)` — column header row
- `toRunStatus(event)` — run.end → SUCCEEDED/FAILED/CANCELLED
- `deriveRunTitle(promptPreview, feedEvents, messages)` — run title from context

### `source/feed/todoPanel.ts` (~40 lines)
- Types: `TodoPanelItem`, `TodoPanelStatus`
- `toTodoStatus(status)` — TodoItem.status → TodoPanelStatus
- `symbolForTodoStatus(status)` — `[x]`, `[>]`, `[!]`, `[ ]`

### `source/hooks/useFeedNavigation.ts` (~80 lines)
Feed viewport state management:
- State: `feedCursor`, `tailFollow`, `expandedId`, `detailScroll`
- Computed: `feedViewportStart`, `visibleFeedEntries`, `detailLines`
- Actions: `moveFeedCursor`, `jumpToTail`, `jumpToTop`, `toggleExpandedAtCursor`, `scrollDetail`

### `source/hooks/useTodoPanel.ts` (~60 lines)
Todo panel state:
- State: `todoVisible`, `todoShowDone`, `todoCursor`, `todoScroll`, `extraTodos`, `todoStatusOverrides`
- Computed: `todoItems`, `visibleTodoItems`, `todoCounts`
- Actions: `toggleTodo`, `addTodo`, `cycleTodoStatus`

### `source/hooks/useCommandMode.ts` (~120 lines)
Command parsing and execution:
- `runCommand(command, ctx)` — dispatch `:todo`, `:run`, `:jump`, `:tail`, `:errors`
- Returns structured actions rather than calling setState directly (inversion of control)

### `source/hooks/useFeedKeyboard.ts` (~80 lines)
Feed-focus keyboard handler:
- Arrow navigation, page up/down, home/end
- Enter to expand, Escape to collapse
- `n`/`N` for search navigation
- `Ctrl+L` to clear search and jump to tail

### `source/hooks/useTodoKeyboard.ts` (~60 lines)
Todo-focus keyboard handler:
- Arrow navigation
- Space to toggle done
- Enter to jump to linked event
- `a` to open add-todo input

## Modified Files

### `source/app.tsx` → ~300-400 lines
- Import and wire all extracted hooks
- Pass computed data as props to `DashboardFrame`
- Keep `AppContent`, `App`, error fallback components
- Remove all inline utility functions and frame rendering

### `source/components/DashboardFrame.tsx`
- Import `fit`/`toAscii` from `source/utils/format.ts` (remove duplicates)
- Adapt props to accept body sections: todo panel lines, run overlay lines, feed lines, detail view lines (already string-based, minimal change)

### `source/components/DashboardInput.tsx`
- Verify compatibility with current input rendering; wire into app.tsx

## Bug Fixes During Refactor

1. Remove dead `visibleIndexSet` logic
2. Fix indentation in feed rendering block
3. Normalize timestamp comparison in `stableItems` (convert Date to number at creation)
4. Remove dead `claudeCodeVersion` prop from `Props` type
5. Consolidate duplicate `toAscii`/`fit` into `utils/format.ts`

## Testing Strategy

- Unit tests for `source/utils/format.ts` (all pure functions)
- Unit tests for `source/feed/timeline.ts` (event mapping functions)
- Unit tests for `source/feed/todoPanel.ts`
- Existing component tests should continue passing (no behavior change)
- Run `npm test`, `npm run lint`, `npm run build` after each extraction step

## Non-Goals

- Changing visual output or behavior
- Restructuring the component hierarchy beyond DashboardFrame/Input wiring
- Adding new features
