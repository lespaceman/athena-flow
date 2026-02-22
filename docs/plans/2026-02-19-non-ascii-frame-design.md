# Non-ASCII Box-Drawing Frame Design

**Date**: 2026-02-19
**Scope**: Replace ASCII frame characters in DashboardFrame with Unicode box-drawing

## Summary

Transition `DashboardFrame.tsx` from ASCII border characters (`+`, `-`, `|`) to Unicode single-line box-drawing characters (`┌`, `─`, `┐`, `│`, `├`, `┤`, `└`, `┘`).

## Character Mapping

| Current          | Replacement  | Context            |
| ---------------- | ------------ | ------------------ |
| `+...+` (top)    | `┌...┐`      | Top border         |
| `+...+` (bottom) | `└...┘`      | Bottom border      |
| `\|...\|` (mid)  | `├...┤`      | Section separators |
| `-`              | `─` (U+2500) | Horizontal fill    |
| `\|`             | `│` (U+2502) | Vertical edges     |

## Changes

**File**: `source/components/DashboardFrame.tsx`

1. Add `BOX` constant with the 7 glyphs
2. Split `border` into `topBorder` and `bottomBorder` (corners differ)
3. Update `separator` to use `├...┤`
4. Update `renderLine()` to use `│`
5. Update input row vertical bars

**File**: `source/components/DashboardFrame.test.tsx`

1. Update assertions to expect Unicode box-drawing characters

## Non-goals

- Theme/skin system (future work)
- Changing any other component's glyphs
- Changing layout or width calculations (box-drawing chars are single-width)
