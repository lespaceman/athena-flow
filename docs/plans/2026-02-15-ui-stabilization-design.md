# Phase 1: UI Stabilization Design

**Date:** 2026-02-15
**Status:** Approved
**Scope:** Fix rendering stability, enforce layout constraints, prepare for Phase 2 (feeds/radar)

## Context

The ATHENA CLI v1 spec defines hard invariants: 1-line header, max 4-line footer, append-only event stream, 1-line event headers. The current UI violates most of these — events render multi-line, the footer has no height budget, and flickering occurs due to deferred Static promotion in `useContentOrdering`.

This design covers Phase 1: stabilize the rendering before implementing the full spec (feeds, radar, etc.) in Phase 2.

## Decisions Made

| Question | Decision |
|----------|----------|
| Dialog height vs 4-line footer | Dialogs are exceptions — footer can temporarily grow when a dialog is active |
| Tool output inline vs collapsed | Hybrid: short output (≤5 lines) inline, long output collapsed with `:open` |
| Full spec vs stability first | Stability first — feeds, radar, todo strip come in Phase 2 |
| Header/footer restructure | Incremental — consolidate Header to 1 line, keep current footer position |

## Section 1: Fix Flickering / Jank

### Problem
`useContentOrdering` uses a deferred-promotion mechanism (`pendingPromotionRef`) that waits one render cycle before moving items to `<Static>`. During this gap, items render in the dynamic region then vanish and re-appear in Static — visible flicker.

### Fix
- **Remove deferred promotion** — promote to Static immediately when stable. A brief "Running..." in Static is acceptable; flickering is not.
- **Throttle dynamic region updates** — batch to ~4-8 Hz max.
- **Throttle `useHeaderMetrics`** — 1 Hz update cadence to prevent redraw jitter.

### Files
- `source/hooks/useContentOrdering.ts`
- `source/app.tsx`
- `source/hooks/useHeaderMetrics.ts`

## Section 2: Enforce 1-Line Event Headers

### Problem
`UnifiedToolCallEvent` and `SubagentEvent` can produce multi-line headers when tool names + params are long.

### Fix
- **Truncate header lines** to terminal width via `truncateLine(text, terminalWidth)` helper.
- **Flatten SubagentEvent** — remove bordered box, render child events as indented 1-line entries. The bordered box is the source of width-overflow bugs (see CLAUDE.md note on `borderStyle="round"` overhead).
- Verbose JSON dumps only shown with `--verbose` flag (not a stability concern).

### Files
- `source/components/UnifiedToolCallEvent.tsx`
- `source/components/SubagentEvent.tsx`
- `source/utils/truncate.ts` (new)

## Section 3: Hybrid Tool Output Collapse

### Problem
Tool results (code blocks, diffs, file lists) can be arbitrarily tall, pushing dynamic content off-screen.

### Fix
- **Threshold**: Output > 5 lines → show 2-line preview + `(+N lines, :open <toolId> to expand)` hint.
- **`:open <toolId>` command**: Appends full output as a new static block in the event stream. De-duplicated per toolId per session.
- **Short output (≤5 lines)**: Renders inline as today, no change.
- **Implementation**: `ToolResultContainer` gains `maxPreviewLines` prop. `ToolOutputRenderer` returns measurable output, container counts lines to decide collapse vs inline.

### Files
- `source/components/ToolOutput/ToolResultContainer.tsx`
- `source/components/ToolOutput/ToolOutputRenderer.tsx`
- `source/commands/` (new `:open` command)
- `source/hooks/useContentOrdering.ts` (expansion block support)

## Section 4: Consolidate Header to 1 Line

### Problem
`Header` and `StatusLine` are separate components. Together they consume 2+ lines.

### Fix
- **Merge into single 1-line Header**:
  ```
  ATHENA state:WORKING model:opus ctx:148k tools:23 ● server:ready
  ```
- **Rate-limit to 1 Hz**.
- **Remove `StatusLine`** as a separate component — its data feeds into the merged Header.
- **Keep `StatsPanel`** (Ctrl+S toggle) for detailed metrics.

### Files
- `source/components/Header/Header.tsx`
- `source/components/Header/StatusLine.tsx` (merge into Header, then remove)
- `source/app.tsx`

## Section 5: Footer Height Discipline

### Problem
The footer region has no height budget.

### Fix
- **Non-dialog state**: Footer = CommandInput (1 line) + TaskList (collapsed: 1 line, expanded: up to 4 lines). Max ~5 lines.
- **Dialog state**: Footer = Dialog (8-10 lines, exception) + CommandInput (disabled, 1 line). TaskList hidden during dialogs.
- No new Footer wrapper component — enforce discipline via conditional rendering in `app.tsx`.

### Files
- `source/app.tsx`
- `source/components/TaskList.tsx`

## Risk Assessment

| Change | Risk | Impact |
|--------|------|--------|
| Remove deferred promotion | Medium | Eliminates main flicker source |
| Throttle header/metrics | Low | Reduces redraw churn |
| 1-line event headers | Low | Cleaner event stream |
| Flatten SubagentEvent | Medium | Eliminates width overflow bugs |
| Hybrid tool output collapse | Medium | Controls event stream height |
| Merge Header + StatusLine | Low | Simpler layout |
| Footer height discipline | Low | Predictable dynamic region |

## Out of Scope (Phase 2)

- Feed system (MAIN/agent feeds)
- RadarStrip
- TodoStrip (pinned per-feed)
- Feed switching keybindings (F2/F3)
- `:feed`, `:todo`, `:feeds` commands
- AppShell wrapper component
