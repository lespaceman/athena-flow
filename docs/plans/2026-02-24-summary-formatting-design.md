# Summary Field Formatting Redesign

**Date**: 2026-02-24
**Status**: Approved

## Problem

The SUMMARY column in the feed timeline has inconsistent formatting across event types:
- Tools show raw `key=value` pairs that are hard to scan
- `Read — done` tells nothing about what was read
- Subagent events show unhelpful hex IDs (e.g. `a58fc36bc28f150a4`)
- Agent messages show raw text that's often very long
- Lifecycle events use `key=value` syntax instead of readable text

## Design Principles

1. **Action-oriented**: Show WHAT happened, not raw parameters
2. **Consistent**: `Name primary_input — result_metric` pattern for all tools
3. **Scannable**: Most important info first, details dimmed after tool name
4. **No merging for Task**: Task tool calls stay as separate visible lines (long-running)

## Tool Summaries

Format: `ToolName primary_input — result_metric`

The tool name is bright, everything after dimStart is dimmed.

### Per-tool primary input extraction

| Tool | Primary Input | Example |
|------|--------------|---------|
| Read | `file_path` (basename or short path) | `Read source/app.tsx` |
| Write | `file_path` | `Write source/foo.ts` |
| Edit | `file_path` | `Edit source/bar.ts` |
| Bash | `command` (first ~40 chars) | `Bash npm test` |
| Glob | `pattern` | `Glob **/*.test.ts` |
| Grep | `pattern` + optional `glob` | `Grep "pattern" **/*.ts` |
| Task | `[subagent_type] description` | `Task [general-purpose] Write Playwright...` |
| WebSearch | `query` | `WebSearch "react hooks"` |
| WebFetch | URL (truncated) | `WebFetch https://example.com/api/...` |
| MCP tools | `[server] action args` | `[agent-web-interface] click` |
| Unknown | `key=val key=val` (fallback) | `ToolName key=val +2` |

### Per-tool result formatting (merged mode)

| Tool | Result | Example merged |
|------|--------|----------------|
| Read | `N lines` | `Read source/app.tsx — 142 lines` |
| Write | (no suffix needed) | `Write source/foo.ts` |
| Edit | `replaced N → M lines` | `Edit source/bar.ts — 47→53 lines` |
| Bash | `exit N` (+ first stderr line on error) | `Bash npm test — exit 0` |
| Glob | `N files` | `Glob **/*.test.ts — 12 files` |
| Grep | `N matches` | `Grep "pattern" — 5 matches` |
| Task | `done` (NOT merged — shown as separate tool.ok) | `Task [general-purpose] — done` |
| WebSearch | `N results` | `WebSearch "react hooks" — 8 results` |
| WebFetch | `done` | `WebFetch https://example.com — done` |
| MCP | `done` | `[server] action — done` |

### Task tool: no merging

Task spawns long-running subagents. Merging would hide the `tool.call` line until completion, making it invisible during execution. Task keeps separate `tool.call` and `tool.ok` lines.

## Subagent Events

### SubagentStartData / SubagentStopData enrichment

Add optional `description?: string` field to both types. The mapper extracts this from the preceding Task `tool.pre` event's `tool_input.description` when processing `SubagentStart`.

**Before**: `general-purpose a58fc36bc28f150a4`
**After**: `general-purpose: Write Playwright tests...`

The description is stored in the subagent stack alongside `agent_id` and `agent_type`.

## Agent Messages

Extract first sentence (split on `. ` or `\n`), then `compactText()` to 200 chars.

**Before**: `Here is a summary of what was accomplished. --- Completed: Google Search E2E Test Case Specifications The te...`
**After**: `Here is a summary of what was accompl...`

## Lifecycle & Misc Events

Drop `key=value` syntax in favor of natural text:

| Event | Before | After |
|-------|--------|-------|
| `sess.start` | `source=startup model=opus` | `startup (opus)` |
| `sess.end` | `reason=completed` | `completed` |
| `run.end` | `status=completed tools=5 fail=0 perm=0 blk=0` | `completed — 5 tools, 0 failures` |
| `compact` | `trigger=auto` | `auto` |
| `setup` | `trigger=first-run` | `first-run` |
| `stop.request` | `stop_hook_active=true` | No change (low frequency) |

## Files to Modify

1. **`source/utils/format.ts`** — New `summarizeToolPrimaryInput(toolName, toolInput)` function
2. **`source/utils/toolSummary.ts`** — Update `summarizeToolResult()` to include primary input in merged format
3. **`source/feed/timeline.ts`** — Update `eventSummary()`, `eventSummaryText()`, `mergedEventSummary()`, add Task to no-merge list
4. **`source/feed/types.ts`** — Add `description?: string` to `SubagentStartData` and `SubagentStopData`
5. **`source/feed/mapper.ts`** — Extract Task description for subagent stack enrichment
6. **`source/feed/titleGen.ts`** — Update `generateTitle()` to match new patterns (used for notifications/search, not timeline)

## dimStart Strategy

- `dimStart` is set to the length of the tool name (or `ToolName primary_input` for merged results)
- For merged: dim starts after the tool name, so `— result` is dimmed
- For tool.call: dim starts after the primary input, so overflow args are dimmed
- For subagents: dim starts after `agent_type:`, so description is dimmed
