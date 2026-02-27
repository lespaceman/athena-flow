# Harness Decoupling Roadmap (Pre-Codex)

Date: 2026-02-27  
Status: Reassessed after folder migration

## Goal

Remove Claude-specific coupling from athena-cli so adding a new harness (for example Codex app-server) becomes an adapter task instead of a core rewrite.

## Non-goals

- Do not add Codex integration in this phase.
- Do not redesign feed UI behavior or current user workflows unless required for decoupling.

## Pathing Note

Canonical implementation paths in this roadmap follow the new folder structure (`src/app`, `src/core`, `src/harnesses`, `src/infra`, `src/ui`, `src/shared`).

## Coupling Inventory

| ID  | Coupling Point                                                            | Primary Files                                                                                                                                                                         | Difficulty  |
| --- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| A   | Runtime/feed semantics tied to Claude hook names and payload shapes       | `src/core/feed/mapper.ts`, `src/core/controller/runtimeController.ts`, `src/harnesses/claude/runtime/interactionRules.ts`, `src/harnesses/claude/runtime/decisionMapper.ts`           | Very High   |
| B   | Process lifecycle tied to `claude -p` and Claude stream-json output       | `src/harnesses/claude/process/useProcess.ts`, `src/harnesses/claude/process/spawn.ts`, `src/harnesses/claude/process/tokenAccumulator.ts`                                             | High        |
| C   | Transport tied to hook-forwarder + UDS + `.claude/run` socket conventions | `src/harnesses/claude/hook-forwarder.ts`, `src/harnesses/claude/runtime/server.ts`, `src/harnesses/claude/hooks/generateHookSettings.ts`                                              | High        |
| D   | Isolation/model bootstrapping tied to Claude flags/env/settings           | `src/harnesses/claude/config/isolation.ts`, `src/harnesses/claude/config/flagRegistry.ts`, `src/app/bootstrap/bootstrapConfig.ts`, `src/harnesses/claude/config/readSettingsModel.ts` | Medium-High |
| E   | Runtime selection hardcoded to Claude adapter                             | `src/app/providers/RuntimeProvider.tsx`, `src/app/shell/AppShell.tsx`, `src/app/entry/cli.tsx`                                                                                        | Medium      |
| F   | Setup/header/harness UX still Claude-specific                             | `src/setup/steps/HarnessStep.tsx`, `src/shared/utils/detectHarness.ts`, `README.md`, `CLAUDE.md`                                                                                      | Low-Medium  |

## Current Track Status (2026-02-27)

| Track | Status      | Current Reality                                                                                                                                |
| ----- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| A     | Not started | Core runtime/controller/feed still branch on Claude hook names and raw payload shape (`event.hookName`, `event.payload`).                      |
| B     | Partial     | Claude process code moved under `src/harnesses/claude/process/*`, but app shell still depends directly on Claude process API.                  |
| C     | Partial     | Claude transport/server is isolated under `src/harnesses/claude/runtime/server.ts`, but no app-level transport-neutral connector boundary yet. |
| D     | Partial     | Claude config files are isolated, but bootstrap path still reads Claude settings directly.                                                     |
| E     | Not started | `RuntimeProvider` still constructs Claude runtime directly (no harness runtime factory).                                                       |
| F     | Not started | Setup/header/docs still default to Claude labels/verification flows.                                                                           |

## Execution Order

1. Track A (hardest): runtime/feed semantic decoupling
2. Track E: runtime factory wiring (establish app boundary for multi-harness composition)
3. Track B: process lifecycle abstraction
4. Track C: transport abstraction
5. Track D: provider config abstraction
6. Track F: setup and UX cleanup

Track B and Track C can run in parallel after Track E lands.

Track A detailed plan: [2026-02-27-runtime-semantic-decoupling-impl.md](./2026-02-27-runtime-semantic-decoupling-impl.md)

---

## Track B: Process Lifecycle Decoupling

### Objective

Replace Claude-specific process hook APIs with a harness-agnostic process interface.

### Tasks

1. Introduce `HarnessProcess` interface and generic hook `useHarnessProcess` with neutral state names (`isRunning`, `spawn`, `interrupt`, `kill`, `usage`).
2. Keep Claude process implementation behind `src/harnesses/claude/process/useProcess.ts`.
3. Replace direct `spawnClaude` references in `src/app/shell/AppShell.tsx` and `src/app/commands/executor.ts` contexts with injected harness process functions.
4. Split token parsing into provider parsers (`src/harnesses/claude/process/tokenAccumulator.ts`) and make the hook consume parser strategy.
5. Keep workflow loop orchestration in the generic hook; move Claude-specific assumptions out of loop comments/messages.

### Validation

- `npm run typecheck`
- `npx vitest run src/harnesses/claude/process/useProcess.test.ts src/__sentinels__/resume-discipline.sentinel.test.ts`
- Add new tests for `useHarnessProcess` neutral contract.

### Exit Criteria

- No non-harness modules import `spawnClaude`.
- App command prompt path depends on generic process contract only.

---

## Track C: Transport Decoupling

### Objective

Decouple runtime transport so UDS hook forwarding is one adapter, not the default architecture.

### Tasks

1. Define transport-neutral runtime connector interface (`start`, `stop`, `sendDecision`, event stream subscription).
2. Wrap current UDS hook server (`src/harnesses/claude/runtime/server.ts`) behind a Claude transport boundary (optionally extracting to `src/harnesses/claude/transport/udsHooks.ts` later).
3. Move hook forwarder specifics behind Claude transport boundary.
4. Isolate `.claude/run` path logic and generated hook settings under Claude harness module.
5. Add transport contract tests independent of Claude event shapes.

### Validation

- `npx vitest run src/harnesses/claude/runtime/__tests__/server.test.ts`
- Add new transport interface tests with mock/injectable runtime.

### Exit Criteria

- Core runtime types do not mention UDS, NDJSON, or hook-forwarder semantics.
- Claude UDS path logic exists only in Claude harness modules.

---

## Track D: Config/Isolation Decoupling

### Objective

Replace Claude-centric isolation/model bootstrapping with provider profile resolution.

### Tasks

1. Introduce provider-neutral `HarnessConfigProfile` with per-harness argument builders.
2. Move Claude flag registry and isolation presets into `src/harnesses/claude/config/`.
3. Refactor `bootstrapRuntimeConfig` to select resolver by configured harness.
4. Split model resolution into harness resolvers (`resolveClaudeModel`, future `resolveCodexModel`).
5. Rename or scope Anthropic env probing so non-Claude harnesses are not impacted.

### Validation

- `npx vitest run src/app/bootstrap/bootstrapConfig.test.ts src/harnesses/claude/config/isolation.test.ts src/harnesses/claude/config/flagRegistry.test.ts src/harnesses/claude/config/readSettingsModel.test.ts`

### Exit Criteria

- Core bootstrap path is harness-aware and does not directly call Claude-specific model/settings readers.

---

## Track E: Runtime Factory Wiring

### Objective

Enable runtime creation by selected harness instead of hardcoding Claude in context/provider.

### Tasks

1. Add runtime factory: `createRuntime({harness, projectDir, instanceId, ...})`.
2. Update `RuntimeProvider` to accept either runtime instance or runtime factory input.
3. Thread harness selection from CLI/config into app root state.
4. Keep current behavior defaulting to `claude-code` for backward compatibility.
5. Add integration tests for runtime selection and fallback behavior.

### Validation

- `npx vitest run src/app/__tests__/boundary.test.ts`
- `npm run typecheck` (ensures provider wiring at `src/app/providers/RuntimeProvider.tsx`)
- Add tests covering factory selection path.

### Exit Criteria

- `RuntimeProvider.tsx` no longer imports `createClaudeHookRuntime` directly.

---

## Track F: Setup and UX Decoupling

### Objective

Remove UI and docs assumptions that only Claude exists.

### Tasks

1. Update setup harness step to read supported harnesses from registry/capability table.
2. Replace `detectHarness()` constant return with active runtime/harness source of truth.
3. Update header render and metrics copy to show configured harness cleanly.
4. Replace Claude-only copy in README/help/setup flows with harness-neutral wording where appropriate.
5. Keep Claude verification path intact as one harness-specific verifier.

### Validation

- `npx vitest run src/setup/steps/__tests__/HarnessStep.test.tsx src/ui/header/model.test.ts src/shared/utils/detectHarness.test.ts`
- `npm run lint`

### Exit Criteria

- User-visible harness labels are driven by configured harness, not constants.
- Setup step can enable additional harnesses without editing component logic.

---

## Program-Level Acceptance Criteria

1. Core runtime/feed/controller layers compile and test without importing Claude hook protocol types.
2. Claude remains fully functional through adapter modules.
3. New harness integration work can start by implementing adapter/config/process modules, without touching feed mapper semantics.
