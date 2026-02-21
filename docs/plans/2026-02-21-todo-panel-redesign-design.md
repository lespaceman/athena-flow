# TODO Panel Redesign — Design Document

**Date**: 2026-02-21
**Status**: Approved

## Summary

Replace the current bracket-glyph TODO panel (`[x]`, `[>]`, `[ ]`) with a Unicode-first, ASCII-fallback design using clean status glyphs (`⟳`, `○`, `✓`). Refactor rendering in-place within the existing `buildBodyLines` string pipeline.

## Glyphs

| Status       | Unicode | ASCII | Color (when available) |
|-------------|---------|-------|----------------------|
| In progress | `⟳`    | `~`   | Cyan                 |
| Todo        | `○`    | `-`   | Default foreground   |
| Done        | `✓`    | `x`   | Dim gray (whole line)|
| Blocked     | `○`    | `-`   | Same as todo         |
| Caret       | `▶`    | `>`   | Cyan (bright)        |
| Divider     | `─` repeated | `-` repeated | Dim          |
| Scroll up   | `▲`    | `^`   | Dim                  |
| Scroll down | `▼`    | `v`   | Dim                  |

## Header

Single line: `TODO` left-aligned, `N remaining` right-aligned (where N = non-done count). No modes, no status breakdown.

## Sort Order

Always: in_progress → todo/blocked → done. Blocked items render identically to todo.

## Space Management

1. Panel gets max height H from layout budget
2. Render: 1 header line + items in sort order + 1 divider line
3. If items exceed available slots: drop done items first
4. If still overflowing: scroll with `▲`/`▼ +N more` affordances
5. If only done items hidden: `… N done hidden` (dim) takes 1 line

## Scrolling

- Up/Down arrows move selection caret within visible list
- Viewport scrolls when caret moves past edges
- No search, toggles, or key legends

## Truncation

- Never truncate caret or glyph
- Truncate title with `…` to fit available width
- Line format: `{caret}{space}{glyph}{space}{space}{title}`
  - Caret: 1 char (or space if not selected)
  - Space: 1 char
  - Glyph: 1 char
  - Two spaces: 2 chars
  - Title: remaining width, truncated with `…`

## ASCII Detection

Unicode is default. Fall back to ASCII when:
- `--ascii` CLI flag is set
- `NO_COLOR` env var is set
- Non-UTF-8 locale detected

## Files Changed

- `source/feed/todoPanel.ts` — new glyph function with ascii param
- `source/utils/buildBodyLines.ts` — new header/item/scroll rendering
- `source/hooks/useLayout.ts` — dynamic height, done-dropping logic
- `source/hooks/useTodoPanel.ts` — sorted item exposure
- `source/app.tsx` — ascii mode detection, pass through to rendering
- `source/cli.tsx` — `--ascii` CLI flag

## Approach

Refactor existing string-based rendering in `buildBodyLines`. No new React components — stays consistent with the body rendering pipeline.
