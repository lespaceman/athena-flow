# Harness Decoupling Roadmap (Pre-Codex)

Date: 2026-02-27  
Status: Draft for implementation planning

## Goal

Remove Claude-specific coupling from athena-cli so adding a new harness (for example Codex app-server) becomes an adapter task instead of a core rewrite.

## Non-goals

- Do not add Codex integration in this phase.
- Do not redesign feed UI behavior or current user workflows unless required for decoupling.

## Coupling Inventory

| ID | Coupling Point | Primary Files | Difficulty |
| --- | --- | --- | --- |
| A | Runtime/feed semantics tied to Claude hook names and payload shapes | `src/feed/mapper.ts`, `src/hooks/hookController.ts`, `src/runtime/adapters/claudeHooks/interactionRules.ts`, `src/runtime/adapters/claudeHooks/decisionMapper.ts` | Very High |
| B | Process lifecycle tied to `claude -p` and Claude stream-json output | `src/hooks/useClaudeProcess.ts`, `src/utils/spawnClaude.ts`, `src/utils/parseStreamJson.ts` | High |
| C | Transport tied to hook-forwarder + UDS + `.claude/run` socket conventions | `src/hook-forwarder.ts`, `src/runtime/adapters/claudeHooks/server.ts`, `src/utils/generateHookSettings.ts` | High |
| D | Isolation/model bootstrapping tied to Claude flags/env/settings | `src/types/isolation.ts`, `src/utils/flagRegistry.ts`, `src/runtime/bootstrapConfig.ts`, `src/utils/resolveModel.ts` | Medium-High |
| E | Runtime selection hardcoded to Claude adapter | `src/context/HookContext.tsx`, `src/app.tsx`, `src/cli.tsx` | Medium |
| F | Setup/header/harness UX still Claude-specific | `src/setup/steps/HarnessStep.tsx`, `src/utils/detectHarness.ts`, `README.md`, `CLAUDE.md` | Low-Medium |

## Execution Order

1. Track A (hardest): runtime/feed semantic decoupling
2. Track B: process lifecycle abstraction
3. Track C: transport abstraction
4. Track D: provider config abstraction
5. Track E: runtime factory wiring
6. Track F: setup and UX cleanup

Track A detailed plan: [2026-02-27-runtime-semantic-decoupling-impl.md](./2026-02-27-runtime-semantic-decoupling-impl.md)

---

## Track B: Process Lifecycle Decoupling

### Objective

Replace Claude-specific process hook APIs with a harness-agnostic process interface.

### Tasks

1. Introduce `HarnessProcess` interface and generic hook `useHarnessProcess` with neutral state names (`isRunning`, `spawn`, `interrupt`, `kill`, `usage`).
2. Move current Claude implementation behind `src/harnesses/claude/process.ts`.
3. Replace direct `spawnClaude` references in `src/app.tsx` and command executor contexts with injected harness process functions.
4. Split token parsing into provider parsers (`src/harnesses/claude/tokenParser.ts`) and make the hook consume parser strategy.
5. Keep workflow loop orchestration in the generic hook; move Claude-specific assumptions out of loop comments/messages.

### Validation

- `npm run typecheck`
- `npx vitest run src/hooks/useClaudeProcess.test.ts src/__sentinels__/resume-discipline.sentinel.test.ts`
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
2. Wrap current UDS hook server into a Claude transport module (`src/harnesses/claude/transport/udsHooks.ts`).
3. Move hook forwarder specifics behind Claude transport boundary.
4. Isolate `.claude/run` path logic and generated hook settings under Claude harness module.
5. Add transport contract tests independent of Claude event shapes.

### Validation

- `npx vitest run src/runtime/adapters/claudeHooks/__tests__/server.test.ts`
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

- `npx vitest run src/runtime/__tests__/bootstrapConfig.test.ts src/types/isolation.test.ts src/utils/flagRegistry.test.ts`

### Exit Criteria

- Core bootstrap path is harness-aware and does not directly call Claude-specific model/settings readers.

---

## Track E: Runtime Factory Wiring

### Objective

Enable runtime creation by selected harness instead of hardcoding Claude in context/provider.

### Tasks

1. Add runtime factory: `createRuntime({harness, projectDir, instanceId, ...})`.
2. Update `HookProvider` to accept either runtime instance or runtime factory input.
3. Thread harness selection from CLI/config into app root state.
4. Keep current behavior defaulting to `claude-code` for backward compatibility.
5. Add integration tests for runtime selection and fallback behavior.

### Validation

- `npx vitest run src/runtime/__tests__/boundary.test.ts src/context/HookContext.tsx` (type/lint + tests)
- Add tests covering factory selection path.

### Exit Criteria

- `HookContext.tsx` no longer imports `createClaudeHookRuntime` directly.

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

- `npx vitest run src/setup/steps/__tests__/HarnessStep.test.tsx src/utils/headerModel.test.ts src/utils/detectHarness.test.ts`
- `npm run lint`

### Exit Criteria

- User-visible harness labels are driven by configured harness, not constants.
- Setup step can enable additional harnesses without editing component logic.

---

## Program-Level Acceptance Criteria

1. Core runtime/feed/controller layers compile and test without importing Claude hook protocol types.
2. Claude remains fully functional through adapter modules.
3. New harness integration work can start by implementing adapter/config/process modules, without touching feed mapper semantics.
