# Header Field Expansion Design

**Date**: 2026-02-20
**Status**: Approved

## Overview

Expand the athena-cli 2-line header with five new fields: context usage (progress bar), full session ID, workflow name, harness identifier, and run count. Redistribute existing fields across the two lines with updated truncation priorities.

## Layout

```
Line 1 (Identity + Status):
  ATHENA  sess_abc123xyz  wf:default  harness:Claude Code  ● RUNNING  12:34:56

Line 2 (Metrics + Progress):
  ctx ██████░░░░ 67k/200k  runs:3  progress:2/5  elapsed 1m 23s  err 2  blk 1
```

## Truncation Priorities

| Token | Priority | Truncation behavior |
|-------|----------|-------------------|
| ATHENA | 100 | Never dropped |
| Status badge + clock | 90 | Never dropped |
| Context bar | 80 | Shrink bar width, keep numbers |
| Session ID | 70 | Truncate to `sess_...xyz` then `S1234` |
| Workflow name | 60 | Truncate value, then drop |
| Runs count | 50 | Drop label, keep number |
| Harness | 40 | Drop entirely |
| Progress | 30 | Drop entirely |
| Elapsed/ended | 20 | Drop entirely |
| Err/blk counts | 10 | Drop if zero |

## New Fields

### Context Used (`ctx ██████░░░░ 67k/200k`)

- **Source**: Future hook event providing `{contextUsed: number, contextMax: number}`
- **Until wired**: show `ctx ░░░░░░░░░░ –/200k` (empty bar, dash for unknown)
- **HeaderModel field**: `context: {used: number | null, max: number}`
- **Max default**: 200000 (configurable via CLI arg `--context-limit`)
- **Bar width**: adaptive, min 6 chars, max 16 chars depending on available space
- **Color**: green < 50%, yellow 50-80%, red > 80%
- **NO_COLOR fallback**: `ctx [======----] 67k/200k` (brackets + equals/dashes)

### Session ID (full)

- **Source**: `session.session_id` — already available
- Replace current `session_id_short` with full `session_id` in HeaderModel
- **Truncation**: full → `sess_...xyz` (last 6) → `S1234` (last 4)

### Workflow Name (`wf:default`)

- **Source**: `workflowRef` already passed to `buildHeaderModel`
- Always show as compact `wf:<name>`, default to `"default"` when undefined
- Replaces the old `run_title` slot on line 1

### Harness (`harness:Claude Code`)

- **Source**: Auto-detect from environment (e.g., `process.env.CLAUDE_CODE` or hook event signatures)
- **Fallback**: `"unknown"`
- **HeaderModel field**: `harness: string`

### No. of Runs (`runs:3`)

- **Source**: `runSummaries.length` — already available
- **HeaderModel field**: `run_count: number`

## HeaderModel Changes

```typescript
type HeaderModel = {
  // Existing (kept)
  engine: string | null;
  status: HeaderStatus;
  clock: string;
  progress: {done: number; total: number} | null;
  elapsed_ms: number | null;
  ended_at: number | null;
  error_count: number;
  block_count: number;

  // Changed
  session_id: string;        // full (was session_id_short)
  workflow: string;           // always present, default "default"

  // New
  harness: string;           // auto-detected
  run_count: number;         // from runSummaries.length
  context: {
    used: number | null;     // null until hook event provides it
    max: number;             // default 200000
  };

  // Removed
  // session_id_short (replaced by full session_id)
  // run_id_short (run ID demoted)
  // run_title (replaced by workflow)
};
```

## Context Bar Rendering

Pure function (not a React component — renderHeaderLines works with strings):

```typescript
function renderContextBar(
  used: number | null,
  max: number,
  width: number,
  hasColor: boolean
): string
```

- Returns formatted string like `ctx ██████░░░░ 67k/200k`
- When `used` is null: `ctx ░░░░░░░░░░ –/200k`
- Color thresholds: green < 50%, yellow 50-80%, red > 80%
- NO_COLOR fallback: `ctx [======----] 67k/200k`

## Error States

- **No session yet**: `sess_–` and `runs:0`
- **Context unknown**: empty bar with dash
- **Very narrow terminal** (< 60 cols): drop to essentials — ATHENA, status, context numbers only
- **Harness undetectable**: `harness:–`

## Removed from Header

- **Run ID** (`R1234`): demoted — session_id + run count provides sufficient identification
- **Run title** (`run: <preview>`): replaced by workflow name
