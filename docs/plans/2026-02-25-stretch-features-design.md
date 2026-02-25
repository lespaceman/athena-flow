# Stretch Features X1-X4 Design

## Reference

Mockup: `docs/mockup.html` (AFTER section)

## X1: Context Budget Progress Bar

**Current:** `renderHeaderLines.ts:26-33` renders `Ctx: 0k / 200k` as plain text.
**Target:** `Ctx: [████░░░░░░] 28k / 200k` — visual bar with color thresholds (green < 70%, yellow 70-90%, red > 90%).

**Fix:** The `renderContextBar()` utility in `contextBar.ts` already implements this. Replace the plain text construction in `renderHeaderLines.ts` with a call to `renderContextBar(model.context.used, model.context.max, barWidth, hasColor)`.

**Color thresholds from `contextBar.ts`:** green < 70%, yellow 70-90%, red > 90%. These use hardcoded chalk colors. To align with theme, update to use `theme.contextBar.{low,medium,high}` from the theme system.

**Files:** `source/utils/renderHeaderLines.ts`

## X2: Contextual Input Prompt

**Current:** `buildFrameLines.ts:115` hardcodes `'Type a prompt or :command'`.
**Target (from mockup line 639):** `Stage B complete — press Enter to continue or :retry to re-run` after a run completes.

**Mapping:**

| App State                | Placeholder                                 |
| ------------------------ | ------------------------------------------- |
| Idle, never ran          | `Type a prompt or :command`                 |
| Idle, after run complete | `Run complete — type a follow-up or :retry` |
| Idle, after run failed   | `Run failed — type a follow-up or :retry`   |
| Working                  | (disabled state, already handled)           |
| Permission/Question      | (dialog state, already handled)             |

**Implementation:** Add a `hasCompletedRun: boolean` and `lastRunStatus: 'completed' | 'failed' | null` field to the frame context (`BuildFrameLinesContext`). Derive from the most recent `run.end` event. In `buildFrameLines.ts:114-116`, use these to pick the placeholder.

**Files:** `source/utils/buildFrameLines.ts`, `source/app.tsx` (pass run status through)

## X3: Minute Separators

**Current:** Gutter `─` character at position 0 only — too subtle to notice.
**Target (from mockup CSS `.minute-sep`):** `border-top: 1px solid #161b22; margin-top: 3px; padding-top: 3px` — in terminal terms, this is a **vertical gap** (1 extra row of spacing) before the minute-break entry.

**Implementation:** In `buildBodyLines.ts`, when `isMinuteBreak` is true, emit an empty line before the entry. This costs 1 feed row but provides clear visual separation. The gutter `─` is kept as an additional signal.

**Edge case:** The first visible row (`i === 0`) should never get a minute separator (already handled by the `i > 0` condition). If the separator pushes a row off the viewport, that's acceptable — the blank line is worth 1 lost row.

**Files:** `source/utils/buildBodyLines.ts` (~5 lines)

## X4: Multi-Segment Path Styling

**Current:** `shortenPath()` returns `…/feed/timeline.ts` — uniform brightness in the dim region.
**Target (from mockup):** `<path-prefix dim>…/feed/</path-prefix><path-file bright>timeline.ts</path-file>` — prefix `#2d333b`, filename `#c9d1d9`.

**Implementation approach:**

1. Change `shortenPath()` to return `{prefix: string, filename: string}` structured result.
2. In `formatToolSummary`, when the primary input is a path, compute a `summaryHighlightStart` that marks where the filename begins within the summary.
3. Add `summaryHighlightStart?: number` and `summaryHighlightEnd?: number` to `SummaryResult` and `TimelineEntry`.
4. In `feedLineStyle.ts`, within the dim region, if a highlight range is specified, render that sub-range with `theme.text` (bright) instead of `theme.textMuted`.

**Layout example:**

```
Read …/feed/timeline.ts  125 lines
^^^^                      ^^^^^^^^^
verb  [dim prefix][BRIGHT filename]  [dim outcome]
     ^dimStart    ^hlStart  ^hlEnd
```

**Files:** `source/utils/format.ts`, `source/feed/timeline.ts`, `source/feed/feedLineStyle.ts`, `source/utils/buildBodyLines.ts`
