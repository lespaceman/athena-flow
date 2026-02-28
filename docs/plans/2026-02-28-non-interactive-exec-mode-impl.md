# Non-Interactive Exec Mode Implementation Plan (CI Enablement)

Date: 2026-02-28  
Status: Draft  
Owner: athena-cli core  
Primary Scope: Add a non-interactive `athena exec` mode for scripts/CI without launching Ink TUI

## Summary

This plan introduces a new non-interactive execution path so Athena can run in CI/CD and automation pipelines.
The implementation must preserve current interactive behavior (`athena`, `athena-flow`) and avoid introducing harness-specific assumptions outside adapter boundaries.

The target UX mirrors the practical shape of `codex exec` (not exact parity), with Athena-specific constraints:

- single command invocation with prompt argument
- deterministic behavior when no user is present
- machine-readable output mode (`--json` JSONL stream)
- safe defaults for permissions and question hooks in unattended environments
- optional session persistence and resume support

## Why This Matters

Current Athena behavior is TUI-first and depends on interactive input loops in `AppShell`.
CI workflows need:

- no terminal UI rendering
- no blocking dialogs
- predictable exit codes
- script-friendly stdout/stderr behavior
- stable structured output for downstream automation

Without this mode, Athena cannot be safely embedded into GitHub Actions, GitLab CI, pre-merge jobs, or scheduled automation.

## Goals

1. Add `athena exec` as a first-class non-interactive command.
2. Keep existing interactive behavior unchanged.
3. Provide deterministic decision policies for permission/question events.
4. Provide both human-readable and machine-readable output modes.
5. Reuse existing runtime, process, workflow, and session infrastructure wherever possible.

## Non-Goals (Phase 1)

1. Do not replace or refactor the interactive TUI architecture.
2. Do not redesign workflow semantics or loop behavior.
3. Do not add new harness adapters (Codex adapter remains future work).
4. Do not require full parity with Codex CLI event taxonomy on day one.
5. Do not change plugin/marketplace formats.

## Existing Architecture Snapshot (Important for Design)

### Interactive entrypoint

- `src/app/entry/cli.tsx` parses flags and immediately boots Ink + `AppShell`.
- Setup wizard (`shouldShowSetup`) can block startup.
- Session selection and prompt submission are UI-driven.

### Process execution

- `src/harnesses/claude/process/spawn.ts` invokes `claude -p ... --output-format stream-json`.
- Hook events are forwarded through UDS via `athena-hook-forwarder`.
- Runtime server at `src/harnesses/claude/runtime/server.ts` receives hook envelopes and returns decisions.

### Decision handling

- `src/core/controller/runtimeController.ts` routes rule matches and queues permission/question interactions.
- In TUI, unresolved interactions become dialogs.

### Feed + persistence

- `src/core/feed/mapper.ts` maps runtime events to feed events.
- `src/infra/sessions/store.ts` persists runtime + feed events + token usage.
- Registry APIs (`src/infra/sessions/registry.ts`) provide Athena session discovery and resume.

### Constraint that drives design

Headless Claude with Athena’s isolated settings requires explicit decision responses for hooks; unattended mode cannot rely on user dialogs.

## Proposed Command Contract

## Base command

```bash
athena exec "<prompt>"
```

## Core flags (Phase 1)

- `--project-dir <path>` (default: cwd)
- `--plugin <path>` (repeatable; same semantics as interactive)
- `--workflow <ref>`
- `--isolation <strict|minimal|permissive>`
- `--verbose`
- `--continue` (resume most recent Athena session in project)
- `--continue=<athenaSessionId>` (resume explicit Athena session)
- `--json` (emit JSONL events to stdout)
- `--output-last-message <path>` (write final assistant message to file)
- `--ephemeral` (no session persistence)
- `--on-permission <deny|allow|fail>` (default: `fail`)
- `--on-question <empty|fail>` (default: `fail`)
- `--timeout-ms <number>` optional hard timeout for entire exec run

## Deferred flags (Phase 2+)

- `--output-schema <schema-path-or-inline-json>`
- `exec resume --last` / `exec resume <sessionId>` convenience subcommands
- richer event envelope parity with Codex naming

## Prompt input rules

1. Primary: first positional argument after `exec`.
2. Optional future extension: if no positional prompt and stdin is piped, read stdin text.
3. For Phase 1, if prompt is missing, fail fast with usage error.

## Exit codes (proposed)

- `0`: success; final message produced
- `2`: usage/validation errors (invalid flags, missing prompt)
- `3`: setup/config/bootstrap failure
- `4`: runtime/process failure (spawn error, non-zero harness exit)
- `5`: non-interactive policy failure (permission/question unresolved under `fail`)
- `6`: timeout exceeded
- `7`: output contract failure (schema validation or output file write failure)

## Output Contract

### Default mode (human/script hybrid)

- `stderr`: progress/log lines (status updates, warnings, errors)
- `stdout`: final assistant message only

### `--json` mode

- `stdout`: JSONL event stream only
- `stderr`: diagnostics/progress (if enabled)
- final assistant message appears as a terminal JSON event, not plain text

### `--output-last-message`

- writes final assistant message to provided path
- default mode: still prints final message to stdout
- `--json` mode: no extra plain-text print to stdout, but file write still occurs

## Proposed Internal Design

## New modules

### `src/app/exec/types.ts`

Defines non-interactive run options, policy enums, and result shape.

### `src/app/exec/runner.ts`

Main orchestrator for non-interactive execution:

1. bootstrap runtime config
2. create runtime connector
3. create session store (or ephemeral in-memory)
4. subscribe runtime events + decisions
5. apply non-interactive decision policy
6. spawn harness process
7. wait for completion
8. compute final assistant message + usage summary
9. emit output according to mode

### `src/app/exec/output.ts`

Output writer abstraction:

- human mode writer
- JSONL writer
- output-last-message file writer

### `src/app/exec/jsonl.ts`

Defines JSONL event envelope and mapping from internal lifecycle.

### `src/app/exec/policies.ts`

Pure policy functions for:

- permission.request decisions
- AskUserQuestion behavior
- unsupported interaction handling

## Reused modules (no duplication)

- `bootstrapRuntimeConfig` for config/plugin/workflow resolution
- `createRuntime` / `createClaudeHookRuntime` for hook transport
- `spawnClaude` path via process profile (or direct wrapper initially)
- `createFeedMapper` for feed semantics and event-derived final message hints
- `SessionStore` and registry for resume/persistence behavior

## Key design decision: no Ink dependency in exec path

`athena exec` must not import or render Ink components.
It should run as a standalone async path inside `cli.tsx` dispatch.

## Event Streaming Model (for `--json`)

## Event envelope

Each line is a JSON object:

```json
{"type":"exec.started","ts":1700000000000,"data":{"projectDir":"/repo","harness":"claude-code"}}
```

## Recommended event types (Phase 1)

- `exec.started`
- `runtime.started`
- `run.started`
- `runtime.event`
- `runtime.decision`
- `process.started`
- `process.exited`
- `exec.warning`
- `exec.error`
- `exec.completed`

## Minimum fields

- `type`: string
- `ts`: unix ms
- `data`: object payload

## Final completion event

`exec.completed` should include:

- `success`: boolean
- `exitCode`: number
- `athenaSessionId`: string | null
- `adapterSessionId`: string | null
- `finalMessage`: string | null
- `tokens`: token usage snapshot
- `durationMs`: number

## Non-Interactive Decision Policy

## Permission events

When `permission.request` occurs:

- `--on-permission=allow` -> send semantic allow decision
- `--on-permission=deny` -> send semantic deny decision
- `--on-permission=fail` -> stop execution with exit code `5`

## AskUserQuestion / question events

When question interaction occurs:

- `--on-question=empty` -> respond with empty answer map
- `--on-question=fail` -> stop execution with exit code `5`

## Safety default rationale

Default to `fail` for both policies to prevent silent over-permissive behavior in CI.
Teams can opt into auto-allow/auto-empty explicitly.

## Session Behavior

## Persistent mode (default)

- Create/use Athena session ID.
- Record runtime/feed events and token usage.
- Support `--continue` resolution against Athena registry.

## Ephemeral mode

- Session store uses `:memory:` DB.
- No writes under `~/.config/athena/sessions`.
- Resume flags disallowed with clear validation error.

## Continue semantics

- `--continue` (bare): resolve most recent Athena session for `projectDir`.
- `--continue=<athenaSessionId>`: resolve explicit session metadata.
- Adapter resume ID passed to spawn is the last adapter session in selected Athena session.

## Setup and First-Run Behavior

Interactive setup wizard must not run in `exec` mode.

Proposed behavior:

1. Skip setup UI unconditionally in exec path.
2. Continue using existing config defaults.
3. If required configuration is missing for execution, fail fast with actionable error.

## Detailed Implementation Tasks

## Task 1: CLI subcommand dispatch

### Files

- Modify: `src/app/entry/cli.tsx`
- Add tests: `src/app/entry/cli.exec.test.ts` (new)

### Steps

1. Parse `cli.input` to detect `exec` subcommand before rendering Ink.
2. Introduce a dedicated flag set for exec mode.
3. Validate prompt presence and incompatible flag combinations.
4. Route to async runner and exit with returned code.
5. Preserve current behavior when subcommand is not `exec`.

### Validation

- `npm run typecheck`
- `npx vitest run src/app/entry/cli.exec.test.ts`

### Exit Criteria

- `athena` interactive startup unchanged.
- `athena exec` path bypasses Ink entirely.

## Task 2: Add exec runner skeleton

### Files

- Create: `src/app/exec/types.ts`
- Create: `src/app/exec/runner.ts`

### Steps

1. Define `ExecRunOptions`, `ExecRunResult`, and policy enums.
2. Add lifecycle scaffolding: started -> completed/error.
3. Wire bootstrap + runtime creation + teardown hooks.
4. Ensure proper `finally` cleanup for runtime and processes.

### Validation

- `npm run typecheck`
- unit tests for runner lifecycle with mock runtime

### Exit Criteria

- runner executes without TUI and returns deterministic result object.

## Task 3: Runtime event handling in headless mode

### Files

- Modify/create in: `src/app/exec/runner.ts`
- Reuse: `src/core/feed/mapper.ts`, `src/core/controller/runtimeController.ts`

### Steps

1. Subscribe to runtime `onEvent` and `onDecision`.
2. Reuse `handleEvent` decision pipeline where possible.
3. Replace queue-based user interaction with policy-based auto-response/fail.
4. Feed runtime events into mapper to preserve canonical event semantics.

### Validation

- `npx vitest run src/core/controller/runtimeController.test.ts`
- new `exec` policy tests

### Exit Criteria

- all hook events are either handled by policy or produce controlled failure.

## Task 4: Process spawn/execution integration

### Files

- Modify: `src/app/exec/runner.ts`
- Optional small extensions: `src/harnesses/claude/process/spawn.ts` and `types.ts` only if required

### Steps

1. Spawn harness prompt using existing spawn path and effective isolation/workflow config.
2. Capture process exit code and token usage stream.
3. Track last assistant text from stream JSON output.
4. Handle spawn errors and propagate deterministic exec exit code.

### Validation

- `npx vitest run src/harnesses/claude/process/spawn.test.ts src/harnesses/claude/process/useProcess.test.ts`
- new runner integration tests with mocked spawn

### Exit Criteria

- exec run can complete end-to-end without TUI.

## Task 5: Final message extraction strategy

### Files

- Create: `src/app/exec/finalMessage.ts` (if needed)
- Modify: `src/app/exec/runner.ts`

### Steps

1. Prefer stream-derived assistant text from process output.
2. Fallback to mapped `agent.message` events (stop/subagent hooks).
3. Fallback to empty string with warning if no assistant text found.
4. Keep extraction deterministic and testable.

### Validation

- targeted unit tests for message extraction edge cases

### Exit Criteria

- final message reliably available in success case.

## Task 6: Output writers (`stdout/stderr/json`)

### Files

- Create: `src/app/exec/output.ts`
- Create: `src/app/exec/jsonl.ts`
- Modify: `src/app/exec/runner.ts`

### Steps

1. Implement human-mode writer: progress to stderr, final message to stdout.
2. Implement JSONL writer with event envelope.
3. Ensure no mixed-mode corruption (plain text in JSON mode stdout).
4. Add `--output-last-message` write behavior.

### Validation

- unit tests for output contract
- filesystem tests for output file write failure handling

### Exit Criteria

- script consumers can reliably parse stdout in both modes.

## Task 7: Session and resume behavior

### Files

- Modify: `src/app/exec/runner.ts`
- Reuse: `src/infra/sessions/registry.ts`, `src/infra/sessions/store.ts`

### Steps

1. Resolve Athena session IDs for continue modes.
2. Pass adapter resume session to process spawn.
3. Persist tokens/events in default mode.
4. Implement in-memory store path for `--ephemeral`.
5. Guard invalid combos: `--ephemeral` + `--continue`.

### Validation

- new tests for resume + ephemeral semantics
- existing session store tests stay green

### Exit Criteria

- resume behaves identically to interactive session identity model.

## Task 8: Timeout and cancellation

### Files

- Modify: `src/app/exec/runner.ts`

### Steps

1. Add optional hard timeout timer.
2. On timeout, kill process, stop runtime, emit error/completion event.
3. Return timeout-specific exit code.

### Validation

- unit tests with fake timers

### Exit Criteria

- hung runs cannot stall CI indefinitely.

## Task 9: CLI help and README docs

### Files

- Modify: `src/app/entry/cli.tsx` help text
- Modify: `README.md`
- Optional add: `docs/non-interactive.md`

### Steps

1. Add `athena exec` usage examples.
2. Document stdout/stderr behavior clearly.
3. Document JSONL examples with `jq`.
4. Document CI safety defaults and permission policy flags.

### Validation

- doc review for consistency with actual behavior

### Exit Criteria

- users can adopt `exec` in CI without reading source.

## Task 10: CI workflow examples

### Files

- Add/update docs with minimal GitHub Actions and GitLab snippets

### Steps

1. Provide minimal reproducible examples.
2. Include secret management and safe permission recommendations.
3. Show artifact capture via `--output-last-message` and `--json`.

### Exit Criteria

- copy-paste-ready examples for common automation.

## Test Strategy (Detailed)

## Unit tests

1. CLI parsing and dispatch (`exec` vs interactive path)
2. policy resolution (`on-permission`, `on-question`)
3. output writers (human vs JSONL)
4. final message extraction logic
5. timeout behavior
6. session resolution/validation

## Integration-style tests (mocked runtime/process)

1. full runner success path
2. permission request auto-allow path
3. permission request fail path
4. AskUserQuestion empty/fail paths
5. non-zero harness exit mapping
6. resume using explicit Athena session ID

## Regression tests to keep running

- `src/harnesses/claude/process/spawn.test.ts`
- `src/harnesses/claude/process/useProcess.test.ts`
- `src/core/controller/runtimeController.test.ts`
- `src/core/feed/mapper.test.ts`
- `src/infra/sessions/store.test.ts`
- `src/infra/sessions/registry.test.ts`

## Suggested command matrix

```bash
npm run typecheck
npx vitest run src/app/entry/cli.exec.test.ts
npx vitest run src/app/exec/*.test.ts
npx vitest run src/core/controller/runtimeController.test.ts
npx vitest run src/harnesses/claude/process/spawn.test.ts src/harnesses/claude/process/useProcess.test.ts
npx vitest run src/infra/sessions/store.test.ts src/infra/sessions/registry.test.ts
npm test
```

## Acceptance Criteria

1. `athena exec "prompt"` runs to completion without Ink UI.
2. unresolved interactive hooks never hang; they are policy-resolved or fail deterministically.
3. default mode outputs only final message to stdout.
4. `--json` mode outputs parseable JSONL only on stdout.
5. `--continue` resume behavior uses Athena session identity model.
6. `--ephemeral` prevents durable session writes.
7. interactive `athena` behavior remains unchanged.

## Risks and Mitigations

## Risk: hidden coupling to UI hooks/state

Mitigation: keep exec runner independent from React/Ink; reuse only pure/core modules.

## Risk: policy mismatch with hook expectations

Mitigation: explicit tests for PermissionRequest, PreToolUse, Stop, AskUserQuestion paths.

## Risk: incorrect final message extraction

Mitigation: multi-source fallback strategy + explicit tests.

## Risk: mixed stdout content breaks JSON consumers

Mitigation: strict output abstraction with tests that assert exact stream content.

## Risk: resume identity confusion (Athena ID vs adapter ID)

Mitigation: centralize translation via `getSessionMeta` and dedicated tests.

## Rollout Plan

## Phase A (MVP)

- subcommand dispatch
- basic exec run
- human output
- fail-closed policies
- persistence + continue

## Phase B

- JSONL streaming
- output-last-message
- timeout handling

## Phase C

- optional schema-constrained final output
- resume convenience subcommands
- event taxonomy refinement toward Codex parity if needed

## Operational Guidance for CI Users (to document)

1. Start with `--on-permission=fail --on-question=fail`.
2. Move to `--on-permission=allow` only in constrained runners.
3. Prefer `--json` when integrating with parsers.
4. Use `--output-last-message` to persist final summaries as artifacts.
5. Use `--ephemeral` for one-off jobs where session history is not required.

## Open Decisions Requiring Explicit Sign-off

1. Should `--on-permission` default remain `fail` (recommended) or `deny`?
2. Should missing setup metadata be ignored in exec mode or treated as fatal?
3. Should `--continue` be allowed with missing prior sessions (fallback new run) or fail hard?
4. Should JSONL event naming follow Athena-specific names now, or Codex-style names immediately?

## Done Definition

This project is done when:

1. all acceptance criteria are satisfied,
2. new tests pass and interactive regressions are absent,
3. README/docs include CI-ready examples,
4. `athena exec` is usable in at least one internal CI workflow without manual intervention.
