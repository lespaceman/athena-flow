# Footer Area Redesign

**Date:** 2026-02-24
**Status:** Design approved

## Problem Statement

The footer area has three issues:

1. **Buggy input field** — custom `useTextInput` renders a fake `|` cursor character; cursor is invisible, backspace/delete misbehave due to a fragile stdin peek hack
2. **Plain hints bar** — raw text like `INPUT: Enter send  Esc back  Tab focus` is visually noisy and always present
3. **Extra space below border** — possible height calculation mismatch

## Design

### 1. Multi-line Input with Real Cursor

**Keep** `textInputReducer` — the state logic (insert, backspace, cursor movement, Ctrl shortcuts) is solid.

**Replace** cursor rendering. Instead of inserting `|` into text, use ANSI inverse video:

- Character under cursor → `\x1b[7m<char>\x1b[27m` (block cursor)
- At end of text → `\x1b[7m \x1b[27m` (block on space)

**Add** multi-line wrapping:

- Input value word-wraps at `contentWidth`
- Auto-expands from 1 to `MAX_INPUT_ROWS = 6`
- Beyond 6 rows, viewport scrolls (cursor line always visible)
- Component reports `inputLineCount` upward

**Files:**

- `source/utils/format.ts` — new `renderInputWithCursor()` → `string[]`
- `source/components/DashboardInput.tsx` — render multiple lines, report count
- `source/hooks/useTextInput.ts` — keep as-is

### 2. Dynamic Footer Height

**Current:** `FOOTER_ROWS = 2` hardcoded (1 hints + 1 input).

**New:** `footerRows = (hintsVisible ? 1 : 0) + inputLineCount`

**Changes:**

- `useLayout` accepts `footerRows: number` instead of using constant
- `bodyHeight = terminalRows - HEADER_ROWS - footerRows - FRAME_BORDER_ROWS`
- `app.tsx` computes `inputLineCount` and passes dynamic `footerRows`
- Frame renders `inputLineCount` frame lines for input

### 3. Auto-hiding Glyph Hints

**Behavior:**

- Visible when input is empty (idle)
- Hidden when user types (reclaims 1 row)
- Toggle with `Ctrl+/`

**Glyph redesign for all modes:**

| Mode    | Glyphs                                               |
| ------- | ---------------------------------------------------- |
| FEED    | `⌃↕ Navigate · ⏎ Expand · / Search · : Cmd · ⤓ Tail` |
| TODO    | `↕ Select · ␣ Toggle · ⏎ Jump · a Add · ⎋ Back`      |
| INPUT   | `⏎ Send · ⎋ Back · ⇥ Focus · ⌃P/N History`           |
| DETAILS | `↕ Scroll · ⇞⇟ Page · ⏎/⎋ Back`                      |

Uses `GLYPH_TABLE` pattern with `satisfies Record<Keys, string>` + `as const`.
ASCII fallback for non-unicode terminals.

**Visual separation:** Hints rendered in `chalk.dim()` with `·` separators. Input line uses normal brightness with colored prompt prefix. The contrast in visual weight naturally separates the two zones without consuming an extra row. When hints auto-hide (user typing), the distinction is moot.

**Files:**

- `source/utils/buildFrameLines.ts` — new `buildHintsLine()` with glyph pairs
- `source/glyphs/registry.ts` — add hint glyphs

### 4. Extra Space Fix

Frame layout:

```
topBorder (1) + header (1) + sectionBorder (1) + body (bodyHeight) +
sectionBorder (1) + footer (footerRows) + bottomBorder (1) = terminalRows
```

The extra space is likely Ink's `<Box>` trailing newline. Fix: set explicit `height={terminalRows}` on the outer Box, or verify `process.stdout.rows` alignment.

## Non-Goals

- Full readline/libedit replacement
- Mouse support in input
- Syntax highlighting in input
