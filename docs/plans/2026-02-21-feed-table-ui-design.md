# Feed Table UI Improvements — Design Document

**Date:** 2026-02-21

**Goal:** Improve feed table readability by compressing the header, formatting MCP tool names, adding OP category colors, and surfacing overflow indicators — all without changing the feed model or event taxonomy.

**Problem:** The feed looks like a hook debugger because (a) MCP tool names are unreadable raw strings, (b) the header wastes space on a progress bar and status badge, (c) system events have the same visual weight as user/agent events, and (d) the OP column lacks category-based color cues.

**Approach:** Presentation-layer refinements only. The feed architecture (FeedEvent → TimelineEntry → formatFeedLine → styleFeedLine) stays intact.

---

## 1. Header — Single Line, Compressed

**Before (2 lines):**
```
ATHENA   Workflow: default   Harness: claude        ● IDLE
Session ID: abc123…def456         Context ███░░░ 29k/200k
```

**After (1 line):**
```
ATHENA FLOW   Workflow: default   Harness: claude   S: a1b2…f456   Ctx: 29k/200k
```

Changes:
- Rename `ATHENA` → `ATHENA FLOW` (bold)
- Remove status badge (● IDLE / ● ACTIVE / ● ERROR) entirely
- Replace context progress bar (`███░░░`) with plain text `Ctx: 29k/200k`
- Truncate session ID to `S: <8 chars>` using existing `truncateSessionId()`
- Single line with priority-based token dropping when terminal is narrow
- Token drop priority: Session ID (lowest) → Harness → Workflow → ATHENA FLOW (never dropped)

**Files:**
- `source/utils/renderHeaderLines.ts` — rewrite to return `[string]`, remove `renderContextBar` import, add plain-text context format
- `source/utils/renderHeaderLines.test.ts` — update all tests for single-line output
- `source/app.tsx` L656-657 — remove second `frameLine(headerLine2)` render

---

## 2. Feed Table — `+N` Overflow Indicator

When tools have 5+ arguments, silently dropping all but 2 loses context.

**Before:** `{a:1, b:2, c:3, d:4}` → `a=1 b=2`
**After:** `{a:1, b:2, c:3, d:4}` → `a=1 b=2 +2`

Two or fewer entries: no change.

**Files:**
- `source/utils/format.ts` — modify `summarizeToolInput()` at L95
- `source/utils/format.test.ts` — add tests for overflow indicator

---

## 3. Feed Table — MCP Tool Name Formatting

Raw MCP names like `mcp__plugin_web-testing-toolkit_agent-web-interface__navigate` become `[agent-web-interface] navigate` in the SUMMARY column.

Uses existing `parseToolName()` from `source/utils/toolNameParser.ts`.

New helper `formatToolSummary(toolName, args, errorSuffix?)`:
- MCP tools: `[agent-web-interface] navigate {url: https://...}`
- Built-in tools: `Read file_path="/foo.ts"` (unchanged)

Applies to `eventSummary()` cases: `tool.pre`, `tool.post`, `tool.failure`, `permission.request`.

**Files:**
- `source/feed/timeline.ts` — add import of `parseToolName`, add `formatToolSummary()` helper, update 4 `eventSummary()` cases
- `source/feed/timeline.test.ts` — add tests for MCP and non-MCP tool summaries

---

## 4. Feed Table — OP Category Colors

The OP column (10-char fixed width) gets category-based coloring, separate from actor coloring on the rest of the row.

| OP prefix | Color | Theme key |
|---|---|---|
| `tool.*` | amber | `status.warning` |
| `perm.*` | purple | `accentSecondary` |
| `stop.*` | cyan | `status.info` |
| `run.*`, `sess.*` | gray | `textMuted` |
| error OPs | red | `status.error` |

**Rules:**
- Focused row: inverse accent on entire line (no OP color) — existing behavior
- Error row: red overrides OP color — existing behavior
- Missing `op` field: no OP coloring (backward compat)

**Files:**
- `source/feed/timeline.ts` — export column position constants (`FEED_OP_COL_START=6`, `FEED_OP_COL_END=16`)
- `source/feed/feedLineStyle.ts` — add `op?: string` to `FeedLineStyleOptions`, add `opCategoryColor()`, refactor `styleFeedLine()` to color OP segment separately
- `source/feed/feedLineStyle.test.ts` — add tests for OP category coloring
- `source/utils/buildBodyLines.ts` L240 — pass `op: entry.op` to `styleFeedLine` options

---

## 5. New Event OP Codes

Three event kinds currently fall through to `default: 'event'` in `eventOperation()`. Add explicit cases:

| Event kind | OP code | `eventSummary()` format |
|---|---|---|
| `teammate.idle` | `tm.idle` | `"<teammate_name> idle in <team_name>"` |
| `task.completed` | `task.ok` | `"<task_subject>"` |
| `config.change` | `cfg.chg` | `"<source> <file_path>"` |

**Files:**
- `source/feed/timeline.ts` — add 3 cases to `eventOperation()` and `eventSummary()`
- `source/feed/timeline.test.ts` — add tests for each new event kind

---

## 6. Structured MCP Detail Header

When expanding an MCP tool event, the detail view currently shows `● mcp__long_raw_name`. Replace with structured metadata:

```
Tool
────────────────────────────────────────
Namespace: mcp
Server:    agent-web-interface
Action:    scroll_element_into_view
```

Non-MCP tools: keep current `● ToolName` format (unchanged).

**Files:**
- `source/utils/renderDetailLines.ts` — add `buildToolHeader()` helper using `parseToolName()`, update `renderToolPre()` and `renderToolPost()`
- `source/utils/renderDetailLines.test.ts` — add tests for MCP and non-MCP detail headers
