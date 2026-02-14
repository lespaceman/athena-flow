# Phase 1: UI Stabilization Design (Final)

**Date:** 2026-02-15
**Status:** Approved
**Scope:** Eliminate flicker/jank, enforce 1-line headers, bound dynamic region, introduce safe tool output collapsing. Phase 2 will add feeds/radar/todo.

## 1) Hard Constraints for Phase 1

Even in Phase 1, we enforce a strict layout budget except during dialogs.

1. Header: exactly 1 line (always)
2. Event stream: append-only, rendered via `<Static>` (always)
3. Footer (non-dialog): max **4 lines total**
4. Footer (dialog active): may expand, but capped at **12 lines**; if terminal height is too small, dialog switches to compact mode (see §5).

## 2) Decisions

| Question | Decision |
|----------|----------|
| Dialog height vs footer budget | Dialogs may exceed 4-line footer, but are capped at 12 lines and must degrade gracefully on small terminals |
| Tool output inline vs collapsed | Temporary hybrid: preview inline (≤5 lines) in Static; larger outputs collapsed with `:open` expansion |
| Stability first vs full spec | Stability first; feeds/radar/todo belong to Phase 2 |
| Header/footer restructure | Incremental: merge Header+StatusLine into 1 line; footer discipline enforced in `app.tsx` without a new AppShell |

## 3) Event Model Rule (removes "stability ambiguity")

Phase 1 formalizes one simple rule to support immediate Static promotion:

* **All UI items in the event stream are immutable events.**
* Tool lifecycle is represented as separate events:
  * `ToolStart` (optional)
  * `ToolEnd` (required)
* No event is "updated". If a tool transitions RUNNING→DONE, that's a new event line.

This removes the need for "wait until stable".

## 4) Fix Flicker/Jank

### Problem
`useContentOrdering` defers promoting content into `<Static>` via `pendingPromotionRef`, causing visible "render dynamic → disappear → reappear" flicker.

### Fix
- Remove deferred promotion. **Promote immediately** to `<Static>` on the same render tick the content is created.
- Any "live" or rapidly changing UI must not be part of the event stream (it belongs in the footer only).
- Batch any non-essential dynamic updates:
  - Dynamic UI updates: cap at **8 Hz**
  - Header metrics: cap at **1 Hz**

### Files
- `source/hooks/useContentOrdering.ts`
- `source/app.tsx`
- `source/hooks/useHeaderMetrics.ts`

## 5) Footer Height Discipline (Phase 1 version)

### Non-dialog state (max 4 lines)

Footer contains:
1. Optional 1-line "Task/TODO summary" (collapsed only — single line always)
2. CommandInput (1 line)
3. Optional 1–2 lines of hints/status (only if needed, but total ≤4)

No multi-line TaskList panel in Phase 1. Full task list is shown via command (`:tasks`) as an appended static snapshot.

### Dialog state (exception, capped)

- Footer may expand to show the dialog UI, capped at **12 lines**.
- During dialog:
  - CommandInput is disabled but still visible (1 line) to preserve muscle memory.
  - Task/TODO summary is hidden.

### Small terminal fallback

If terminal height is insufficient:
- Dialog switches to compact mode (single-line prompt + numeric options), and prints the detailed context into the static stream.

### Files
- `source/app.tsx`
- `source/components/TaskList.tsx` (converted to a 1-line summary; full list via `:tasks` snapshot command)

## 6) Enforce 1-Line Event Headers

### Problem
`UnifiedToolCallEvent` and `SubagentEvent` headers wrap due to long tool args.

### Fix
- Introduce `truncateLine(text, terminalWidth)` and apply to all event headers.
- Flatten `SubagentEvent` (no borders, no nested containers). Child items are separate event lines with indentation only.
- Verbose JSON only via `--verbose` (not required for Phase 1 stability).

### Files
- `source/components/UnifiedToolCallEvent.tsx`
- `source/components/SubagentEvent.tsx`
- `source/utils/truncate.ts` (new)

## 7) Tool Output Collapsing (hybrid, stability-safe)

### Requirement
Tool output can be arbitrarily tall; must not push the UI around.

### Policy
- Tool output is rendered into the event stream only, never into a growing dynamic footer region.
- Preview rule:
  - ≤5 lines: render inline (in Static, under the tool event or as immediate subsequent lines)
  - \>5 lines: render a 2-line preview + hint `(+N lines, :open <toolId>)`
- `:open <toolId>` appends the full output as a new static block. De-duplicate per toolId per session.

### Implementation constraint (important)

Do NOT "measure" rendered React trees to count lines. Instead:
- Tool outputs must expose a **pre-render representation** for preview purposes: `string[] previewLines` and `totalLineCount`.
- The full renderer can still produce rich output when expanded, but preview/collapse decisions must be deterministic and cheap.

### Files
- `source/components/ToolOutput/ToolResultContainer.tsx` (accepts previewLines/totalLineCount)
- `source/components/ToolOutput/ToolOutputRenderer.tsx` (returns structured preview metadata)
- `source/utils/toolExtractors.ts` (extractors return preview metadata alongside RenderableOutput)
- `source/commands/builtins/open.ts` (new `:open`)
- `source/hooks/useContentOrdering.ts` (support appending expansion blocks)

## 8) Consolidate Header to 1 Line

### Fix
Merge Header + StatusLine into a single 1-line header:

```
ATHENA state:WORKING model:opus ctx:148k tools:23 server:ready
```

Rules:
- Update at 1 Hz max.
- Remove `StatusLine` component; its data flows into Header.
- Detailed metrics view remains available but must not use conflicting shortcuts (see §9).

### Files
- `source/components/Header/Header.tsx`
- `source/components/Header/StatusLine.tsx` (merged then removed)
- `source/app.tsx`

## 9) Shortcuts and Commands (must not interfere with native shortcuts)

### Rule
Avoid bindings that commonly conflict with terminals, shells, readline, or editors.

Do not use:
- `Ctrl+S` (flow control / save conflict)
- `Ctrl+Z` (suspend)
- `Ctrl+C` (interrupt)
- `Ctrl+R` (reverse search)
- `Ctrl+W` (delete word)
- `Ctrl+P/N` (history navigation in many shells)
- `Tab` (completion)
- `Alt+Arrow` (word navigation)

### Phase 1 shortcuts (minimal)
- `Esc` = cancel dialog / close overlays (safe, expected)
- `:` opens command mode implicitly by typing commands (already the case)
- Everything else via commands to reduce keybinding risk.

Commands introduced in Phase 1:
- `:open <toolId>`
- `:open last`
- `:tasks` (prints a snapshot into the static stream)

Metrics panel toggle:
- Use `F9` (default) to toggle StatsPanel (rare conflict). Must be configurable.

## 10) Out of Scope (Phase 2)

- Feeds (MAIN vs agent feeds)
- RadarStrip
- Pinned TodoStrip per-feed
- Feed switching keybindings and `:feed` / `:todo` / `:feeds`
- AppShell wrapper component

## 11) Acceptance Criteria (Phase 1)

- No visible flicker caused by dynamic→static promotion.
- Header is always 1 line.
- Event headers never wrap (truncate applied).
- Subagent boxes removed; no bordered containers in stream.
- Tool outputs >5 lines are collapsed by default; full content accessible via `:open`.
- Footer is ≤4 lines during normal operation; dialogs may expand but are capped at 12 lines and degrade on small terminals.
- No default shortcut uses `Ctrl+S` / `Tab` / `Alt+Arrow` / other common terminal conflicts.
