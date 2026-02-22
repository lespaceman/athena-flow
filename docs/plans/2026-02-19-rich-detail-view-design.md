# Rich Detail View Design

**Date**: 2026-02-19
**Status**: Approved

## Problem

The full-screen detail view (Enter on a feed item) renders raw JSON with line numbers. Agent messages, tool outputs, user prompts — all show as `JSON.stringify()` text. The inline feed already has rich rendering components (MarkdownText, CodeBlock, DiffBlock, StructuredList) but the detail view doesn't use them.

## Solution

Replace `expansionForEvent()` with a new `renderDetailLines()` function that pre-renders rich ANSI output using the same libraries the inline feed uses (marked-terminal, cli-highlight). The output is still `string[]` lines for scroll compatibility.

## Event Kind → Rendering Strategy

| Event Kind                     | Renderer             | Content                         |
| ------------------------------ | -------------------- | ------------------------------- |
| `agent.message`                | marked-terminal      | `event.data.message`            |
| `user.prompt`                  | marked-terminal      | `event.data.prompt`             |
| `tool.post` Read               | cli-highlight        | file content from tool_response |
| `tool.post` Edit               | diff coloring        | old→new diff                    |
| `tool.post` Write              | cli-highlight        | content from tool_input         |
| `tool.post` Bash               | cli-highlight (bash) | stdout/stderr                   |
| `tool.post` WebFetch/WebSearch | marked-terminal      | result text                     |
| `tool.post` Glob/Grep          | list formatting      | file paths / matches            |
| `tool.pre`                     | cli-highlight (json) | tool input args                 |
| `permission.request`           | cli-highlight (json) | tool input args                 |
| `notification`                 | marked-terminal      | message                         |
| Other                          | cli-highlight (json) | raw JSON fallback               |

## Architecture

### New: `source/utils/renderDetailLines.ts`

Pure function: `renderDetailLines(event: FeedEvent, width: number): string[]`

- Switches on `event.kind` to pick rendering strategy
- Uses `extractToolOutput()` for tool.post events to get typed output
- Pre-renders to ANSI strings using marked-terminal / cli-highlight
- Splits into lines and returns `string[]`
- No React dependency — pure string rendering

### Modified: `source/hooks/useLayout.ts`

- `detailLines` computed from `renderDetailLines(feedEvent, innerWidth)` instead of `expandedEntry.details.split('\n')`
- Requires access to `FeedEvent` not just `TimelineEntry`

### Modified: `source/feed/timeline.ts`

- `TimelineEntry` gains optional `feedEvent?: FeedEvent` field
- `expansionForEvent()` still exists as JSON fallback but is no longer primary

### No changes to

- `buildBodyLines.ts` — still receives `detailLines: string[]` and renders with line numbers
- Scroll/keyboard handling — unchanged
- `buildFrameLines.ts` — unchanged

## Scrolling

Line-based scrolling is preserved. The pre-rendered ANSI lines plug directly into existing `detailScroll` / `detailContentRows` viewport windowing.

## Line numbers

Detail view currently shows `lineNo | content`. For rich content, line numbers may be distracting. We'll keep them for code/diff but drop them for markdown/text content. The `renderDetailLines` return type will include a `showLineNumbers: boolean` flag.
