# Workflow-First Header Design

**Date**: 2026-02-20
**Status**: Approved

## Goal

Replace the current header with a stable, 2-line "workflow-first" header that communicates: what workflow is running, where it is, what engine is executing it, and whether it's healthy.

## Architecture: Pure Function Pipeline

```
app.tsx state → buildHeaderModel() → HeaderModel → renderHeaderLines(model, width, hasColor) → string[]
```

Both `buildHeaderModel()` and `renderHeaderLines()` are pure functions. No new React contexts or feed model changes.

## HeaderModel Type

```typescript
// source/utils/headerModel.ts

type HeaderStatus = 'running' | 'succeeded' | 'failed' | 'stopped' | 'idle';

interface HeaderModel {
	// Identity
	workflow_ref?: string; // from CLI arg, e.g. "web.login.smoke@7c91f2"
	run_title?: string; // derived from prompt_preview
	session_id_short: string; // "S1"
	run_id_short?: string; // "R3"
	engine?: string; // raw session.agent_type, formatted at render time

	// Progress
	progress?: {done: number; total: number}; // from todoPanel, only when total > 0

	// Health
	status: HeaderStatus;
	err_count: number; // tool failures in this run
	block_count: number; // permission blocks in this run

	// Time
	elapsed_ms?: number; // present only during active run (now - run.started_at)
	ended_at?: number; // unix ms, set when run completes

	// Modes
	tail_mode: boolean;
}
```

### Field sourcing

| Field              | Source                                                             | Notes                                              |
| ------------------ | ------------------------------------------------------------------ | -------------------------------------------------- |
| `workflow_ref`     | CLI arg `--workflow <ref>`                                         | Optional. When set, header shows `workflow:` label |
| `run_title`        | `currentRun.trigger.prompt_preview`                                | Fallback when no workflow_ref. Shows `run:` label  |
| `session_id_short` | `formatSessionLabel(session.session_id)`                           | Always present                                     |
| `run_id_short`     | `formatRunLabel(currentRun.run_id)`                                | Only during active run                             |
| `engine`           | `session.agent_type`                                               | Raw internally, formatted at render                |
| `progress`         | `{ done: todoPanel.doneCount, total: todoPanel.todoItems.length }` | Only when total > 0                                |
| `status`           | Derived from currentRun + runSummaries                             | See status derivation below                        |
| `err_count`        | `metrics.failures`                                                 | Run-scoped                                         |
| `block_count`      | `metrics.blocks`                                                   | Run-scoped                                         |
| `elapsed_ms`       | `now - currentRun.started_at`                                      | Only when currentRun exists                        |
| `ended_at`         | From last runSummary.endedAt                                       | Only when run complete                             |

### Title precedence

1. If `workflow_ref` set → `workflow: <ref>`
2. Else if `run_title` → `run: <title>`
3. Else → just `ATHENA` with no subtitle

### Status derivation

- If `currentRun` exists → `'running'`
- Else if last runSummary status is `'FAILED'` → `'failed'`
- Else if last runSummary status is `'CANCELLED'` → `'stopped'`
- Else if last runSummary status is `'SUCCEEDED'` → `'succeeded'`
- Else → `'idle'`

## Visual Layout

### Line 1 — title + status

```
Left:   ATHENA · workflow: web.login.smoke@7c91f2 · run R3 · claude-code
Right:  ● RUNNING  12:34:56
```

Left tokens joined by `·`:

1. `ATHENA` (always, bold)
2. `workflow: <ref>` or `run: <title>` (if available)
3. `run R<id>` (if active run)
4. `<engine>` (if present, formatted)

Right rail (fixed ~20 char width, right-aligned):

- Status badge (glyph + label, colored)
- Clock `HH:MM:SS` (downgrade to `HH:MM` when tight)

### Line 2 — progress + time + health

```
Left:   progress: 3/12 · elapsed 04:24
Right:  err 2 blk 1
```

Left tokens:

1. `progress: <done>/<total>` (only if total > 0)
2. `elapsed <MM:SS>` or `ended <HH:MM:SS>` (only if available)

Right rail:

- `err <n>` (red, only if > 0)
- `blk <n>` (yellow, only if > 0)
- Blank when both zero

### Line 3 — separator

Dim `─` repeated to `width - 1` (wrap-guard).

## Status Badge System

```typescript
// source/utils/statusBadge.ts

const BADGES = {
	running: {glyph: '●', label: 'RUNNING', color: 'cyan'},
	succeeded: {glyph: '●', label: 'SUCCEEDED', color: 'green'},
	failed: {glyph: '■', label: 'FAILED', color: 'red'},
	stopped: {glyph: '■', label: 'STOPPED', color: 'yellow'},
	idle: {glyph: '●', label: 'IDLE', color: 'dim'},
};

const NO_COLOR_BADGES = {
	running: '[RUN]',
	succeeded: '[OK]',
	failed: '[FAIL]',
	stopped: '[STOP]',
	idle: '[IDLE]',
};
```

Separate file from the Ink theme system — this is for pure string rendering.

## Truncation Priority (tightest width first)

1. Truncate `run_title` / `workflow_ref` value (keep prefix + `…`)
2. Drop `engine`
3. Drop `run R<id>`
4. Downgrade clock `HH:MM:SS` → `HH:MM`
5. **Never drop**: `ATHENA`, status badge, `workflow:`/`run:` label

Labels always have stable width. Truncate values, not labels.

## Conditional Rendering

- `err`/`blk` shown only when > 0
- `engine` shown only when present
- `progress` shown only when total > 0
- `elapsed` shown only during active run
- `ended` shown only when run complete
- Idle state: `ATHENA · ● IDLE` (no run ID, no elapsed)

## NO_COLOR / Non-TTY Fallback

When `NO_COLOR` env var set or non-TTY:

- Use text badges: `[RUN]`, `[OK]`, `[FAIL]`, `[STOP]`, `[IDLE]`
- No ANSI escape sequences in output
- Labels and structure remain identical

## Test Plan

File: `source/utils/__tests__/renderHeaderLines.test.ts`

### Invariant tests (most valuable)

- Output is always exactly 3 lines (2 header + separator)
- No line exceeds `width - 1` characters (stripped of ANSI)
- Right rail position is stable across status changes at same width

### Content tests

- Wide (120), standard (80), narrow (60) golden snapshots
- Truncation order: engine dropped before run ID, run ID before workflow value
- Status variants: each status renders correct badge
- With/without progress, engine, workflow_ref
- NO_COLOR: no ANSI sequences, text badges present
- Clock downgrade: HH:MM:SS at 80+, HH:MM at narrow
- Clean right rail: blank when err=0 and blk=0
- Idle state: minimal header, no run context

### Test approach

- Pure function tests — no React rendering
- `stripAnsi()` helper for content assertions
- Style helpers tested separately for color intent

## Files to Create/Modify

### New files

- `source/utils/headerModel.ts` — `HeaderModel` type + `buildHeaderModel()`
- `source/utils/renderHeaderLines.ts` — `renderHeaderLines(model, width, hasColor)`
- `source/utils/statusBadge.ts` — Badge constants + `getStatusBadge()`
- `source/utils/__tests__/renderHeaderLines.test.ts`

### Modified files

- `source/app.tsx` — Replace `buildFrameLines()` call with `buildHeaderModel()` + `renderHeaderLines()`
- `source/cli.tsx` — Add optional `--workflow` CLI arg
- `source/utils/buildFrameLines.ts` — Remove or deprecate (replaced by new pipeline)

## Out of Scope

- Footer redesign
- Feed schema changes
- Workflow pull UI
- Token/cost panels
- RunContext as a feed entity (future consideration)
