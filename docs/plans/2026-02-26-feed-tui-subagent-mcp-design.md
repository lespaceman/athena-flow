# Feed TUI Design: Subagent + MCP Clarity

Date: 2026-02-26
Status: Approved for implementation
Approval source: user directive "go ahead and design the feed TUI now, get it approved and implement it"

## Goals

1. Make subagent lifecycle and identity obvious in the feed list.
2. Show subagent task input and output directly in compact rows.
3. Make MCP actions self-explanatory without opening detail view.

## Scope

Live feed grid path only:

- `useTimeline` actor labels
- `timeline.eventSummary` and `mergedEventSummary`
- `FeedRow`/`FeedHeader` column alignment and spacing
- `FeedGrid` row compaction behavior

No schema changes and no hook protocol changes.

## Row Rendering Rules

### Actor column

- Root agent remains `AGENT`.
- User remains `USER`.
- System remains `SYSTEM`.
- Subagent-attributed rows use compact identity labels:
  - Preferred: `SA:<type>` where `<type>` is normalized from `agent_type`.
  - Fallback: `SA#<id>` when type is unavailable.

### Subagent events

- `Sub Start` and `Sub Stop` rows keep `agent_type` in TOOL column.
- DETAILS column shows task description when present.
- If description is missing, DETAILS falls back to `id:<agent_id>`.

### Subagent output

- Output remains in `Agent Msg` rows synthesized from `last_assistant_message`.
- With actor improvements, subagent output lines render under subagent actor label rather than generic `SUB-AGENT`.

### MCP tool summaries

- Keep clean verb mapping (`Navigate`, `Click`, `Find`, etc.).
- Prefix MCP target with server context in DETAILS summary:
  - `Navigate [agent-web-interface] example.com`
  - `Click [agent-web-interface] eid:btn-1…`
  - `Do fancy thing [my-server]`

### Width and alignment refinement

- Reduce inter-column spacing from 2 to 1 for denser rows.
- Auto-adjust inter-column spacing from terminal width:
  - `gap=2` when wide (>=180 columns)
  - `gap=1` otherwise
- Add a dedicated `RESULT` column for outcomes (`0 files`, `exit 1`, `replaced ... lines`).
- Keep column order as `TOOL -> DETAILS -> RESULT`.
- Let `DETAILS` consume remaining width after `RESULT` allocation.
- Remove minute-change blank separator rows to avoid visual holes in dense feeds.

## Event Matrix (unchanged op mapping)

- `subagent.start` -> `Sub Start` / `sub.start`
- `subagent.stop` -> `Sub Stop` / `sub.stop`
- `agent.message` -> `Agent Msg` / `agent.msg`
- `tool.pre` -> `Tool Call` / `tool.call`
- `tool.post` -> `Tool OK` / `tool.ok`
- `tool.failure` -> `Tool Fail` / `tool.fail`

## Validation

1. Timeline tests for subagent summaries.
2. Timeline tests for MCP summary context.
3. Existing event label/opTag expectations remain stable.
