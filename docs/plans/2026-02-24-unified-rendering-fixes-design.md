# Unified Terminal Rendering Fixes — Design

**Date**: 2026-02-24
**Status**: Approved
**Supersedes**: `docs/plans/2026-02-23-remove-ansi-strippers.md` (incorporated as Fix 3)

## Problem

Three rendering bugs degrade the athena-cli terminal experience:

1. **Colon placeholder leak**: `*#COLON|*` appears in list items containing backtick code spans with colons (e.g., `baseURL*#COLON|* "https*#COLON|*//..."`)
2. **Raw markdown in feed summaries**: `**bold**`, `## headings`, `` `code` `` show literal syntax in the one-line feed view
3. **`toAscii()` unicode mangling**: Non-ASCII characters replaced with `?` in todo item IDs regardless of `--ascii` flag

## Root Causes

### Fix 1: Colon placeholder in custom list renderer

`marked-terminal`'s `codespan()` renderer replaces `:` with internal placeholder `*#COLON|*` to avoid conflicts with its table column separator. The built-in `listitem` renderer undoes this via `this.transform` (which includes `undoColon()`). Our custom list renderer in `markedFactory.ts` calls `m.parseInline()` directly, bypassing the transform pipeline — so the placeholder is never restored.

### Fix 2: No markdown stripping in feed summary

`timeline.ts:eventSummaryText()` passes raw `agent.message` content to `compactText()`, which only collapses whitespace. Markdown syntax characters render literally in the compact single-line feed view.

### Fix 3: `toAscii()` applied unconditionally

`toAscii()` replaces all non-ASCII with `?` via `/[^\x20-\x7e]/g`. Used in `useTodoPanel.ts` for ID generation, it mangles unicode glyphs even when `--ascii=false`. Only call site; function can be deleted.

## Approach: Targeted fixes at source

Each bug is fixed independently at its origin point. No shared abstractions or defensive post-processing.

### Fix 1: `source/utils/markedFactory.ts`

After `m.parseInline(item.text)` in the custom list renderer, replace `*#COLON|*` back to `:`:

```typescript
const inlined = m.parseInline(item.text);
const text = typeof inlined === 'string'
  ? inlined.replace(/\*#COLON\|\*/g, ':')
  : item.text;
```

### Fix 2: `source/feed/timeline.ts`

Add `stripMarkdownInline()` helper, apply before `compactText()` for `agent.message`:

```typescript
function stripMarkdownInline(text: string): string {
  return text
    .replace(/#{1,6}\s+/g, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/~~(.+?)~~/g, '$1');
}
```

### Fix 3: `source/hooks/useTodoPanel.ts` + `source/utils/format.ts`

Replace `toAscii(task.content).slice(0, 16)` with `task.content.replace(/[^a-zA-Z0-9]/g, '').slice(0, 16)` for ID generation. Delete `toAscii()` function and its tests.
