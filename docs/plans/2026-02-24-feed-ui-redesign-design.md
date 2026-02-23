# Feed UI Redesign: Merged Tool Events + Verbose Filtering

**Date:** 2026-02-24
**Scope:** Merged tool event rendering (Approach C) + verbose-only event filtering

---

## Problem

The current feed renders `tool.pre` and `tool.post` as independent lines with no visual connection. This creates a noisy, flat stream where every event looks equally important. Additionally, lifecycle events (session/run boundaries) clutter the feed during normal use.

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Merge strategy | Component-layer pairing (Approach C) | Zero feed model changes; respects append-only invariant and `<Static>` write-once |
| Collapsed view | Single line: glyph + tool + outcome summary | Maximum compactness |
| Status coloring | Purely outcome-based (green success, red failure) | Simple and honest — no guessing about intent |
| Expanded view | Input params + output result together | Full picture in one keypress |
| Verbose filtering | In HookEvent component (rendering decision) | Feed model still records all events for persistence |

## Part 1: Merged Tool Event Rendering

### Data Flow

```
tool.pre arrives → FeedEvent(kind:'tool.pre') → renders as "⧗ Tool(params)..." (pending state)
tool.post arrives → FeedEvent(kind:'tool.post') → renders as null (suppressed)
                                                 → tool.pre component detects paired post
                                                 → re-renders as "✔ Tool(params) — summary"
```

### Lookup Index

`useTimeline` (or `useFeed`) builds a `postByToolUseId` map:

```
Map<tool_use_id, FeedEvent<'tool.post' | 'tool.failure'>>
```

Passed down: `useFeed` → `FeedList` → `HookEvent` → `MergedToolCallEvent`.

When `HookEvent` receives a `tool.pre`, it checks the map. If a matching post exists, it renders the merged view. If not, it renders the pending state.

### Visual States

**Pending** (no tool.post yet):
```
⧗ Edit(source/app.tsx, old_string: "foo"...)
```
Streaming glyph (`⧗`), muted color. Inline params truncated to terminal width (same as current `UnifiedToolCallEvent`).

**Success** (tool.post arrived, no error):
```
✔ Edit(source/app.tsx) — replaced 3 lines
```
Success green glyph + tool name + outcome summary.

**Failure** (tool.failure arrived):
```
✘ Bash(npm test) — exit 1
```
Error red glyph + tool name + failure summary.

**Expanded** (Enter on any state):
```
✔ Edit(source/app.tsx) — replaced 3 lines
  ┄ input ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
  file_path: source/app.tsx
  old_string: "foo"
  new_string: "bar"
  ┄ output ┄┄┄┄┄┄┄┄┄┄┄┄┄┄
  ⎿ File edited successfully
```

Shows both tool input (params) and tool output (result) using existing renderers (`ToolOutputRenderer`, `CodeBlock`, `DiffBlock`, etc.).

### Component Changes

- **`UnifiedToolCallEvent`** → rename to **`MergedToolCallEvent`**: handles pending, success, and failure states. Accepts optional `postEvent` prop.
- **`PostToolResult`**: still exists for orphaned `tool.post` events (no matching `tool.pre` — e.g., resumed sessions) and verbose mode.
- **`HookEvent`** routing changes:
  - `tool.pre`: look up `postByToolUseId[tool_use_id]`. Pass post event to `MergedToolCallEvent`.
  - `tool.post` / `tool.failure`: check if paired with a `tool.pre` → if yes, `return null`; if no, render `PostToolResult`.

### Summary Generators

New function: `summarizeToolResult(toolName, toolInput, toolResponse) → string`

| Tool | Summary |
|---|---|
| Edit | "replaced N lines" or file path |
| Read | "N lines" |
| Write | "wrote file_path" |
| Bash | "exit 0" / "exit N" / first line of stderr |
| Glob | "N files" |
| Grep | "N matches in M files" |
| WebFetch | "fetched (truncated url)" |
| WebSearch | "N results" |
| Task | "agent_type — done" |
| Default | "done" / error message (first line) |

### Glyph Additions

Add to `GLYPH_REGISTRY`:

| Key | Unicode | ASCII | Usage |
|---|---|---|---|
| `tool.success` | `✔` | `+` | Merged tool success |
| `tool.failure` | `✘` | `!` | Merged tool failure |
| `tool.pending` | `⧗` | `%` | Tool in progress (already exists as `status.streaming`) |

## Part 2: Verbose Filtering

### Event Kinds Hidden When `!verbose`

| Event Kind | Reason |
|---|---|
| `session.start` | Lifecycle bookend (already hidden) |
| `session.end` | Lifecycle bookend |
| `run.start` | Lifecycle bookend |
| `run.end` | Lifecycle bookend |
| `user.prompt` | Lifecycle bookend (already hidden) |
| `notification` | Low-signal system noise |
| `unknown.hook` | Unrecognized/unactionable |
| `compact.pre` | Internal lifecycle |
| `config.change` | Internal config |

### Implementation Location

Filter in **`HookEvent`** component (rendering decision, not data decision):

```tsx
const VERBOSE_ONLY_KINDS: ReadonlySet<FeedEventKind> = new Set([
  'session.start', 'session.end', 'run.start', 'run.end',
  'user.prompt', 'notification', 'unknown.hook', 'compact.pre', 'config.change',
]);

if (!verbose && VERBOSE_ONLY_KINDS.has(event.kind)) return null;
```

Feed model still records all events for persistence and replay.

### Verbose Mode Behavior

When `--verbose` IS set:
- All event kinds visible
- Merged tool events show full JSON input/output in expanded view
- `PostToolResult` shows raw response metadata

## Invariants Preserved

- **#1 (Durable events):** All events still pass through `SessionStore.recordEvent()`. Filtering is rendering-only.
- **#2 (Mapper is sole constructor):** No new FeedEvent construction. Merge is visual pairing in components.
- **#4 (Monotonic seq):** Feed ordering unchanged. `tool.post` still has its own seq; it just renders as null.
- **#6 (Single ordering authority):** No new sort logic. Pairing uses `cause.tool_use_id` lookup, not ordering.

## Out of Scope

- Agent message rendering (💬 emoji cleanup)
- Tool risk-level assessment / semantic coloring
- Enhanced diff rendering
- Search improvements
- Todo panel changes
