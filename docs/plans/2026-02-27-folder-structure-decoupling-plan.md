# Folder Structure Decoupling Plan

Date: 2026-02-27  
Status: Draft

## Goal

Create a clear, intuitive project structure that separates:

1. harness-specific code
2. harness-agnostic core logic
3. UI rendering
4. infrastructure/persistence/config
5. app composition/entrypoints

This plan is designed to run alongside the harness decoupling roadmap, not as a one-shot big-bang move.

## Guiding Rules

1. Move by architectural boundary, not by file type.
2. Keep behavior unchanged during folder moves.
3. Use compatibility shims during migration to avoid massive import churn.
4. Keep each phase small enough to validate and rollback independently.

## Target Structure

```text
src/
  app/                    # composition root and entrypoints
  core/                   # harness-agnostic domain logic
  harnesses/
    claude/               # all Claude-specific code
    mock/                 # runtime/mock adapters used for tests
  infra/                  # persistence, config IO, plugin/session storage
  ui/                     # Ink components and UI hooks
  shared/                 # neutral reusable types/utils
```

## End-State Folder Mapping

| Current | Target |
| --- | --- |
| `src/runtime/adapters/claudeHooks/*` | `src/harnesses/claude/runtime/*` |
| `src/types/hooks/*` | `src/harnesses/claude/protocol/*` |
| `src/hook-forwarder.ts` | `src/harnesses/claude/hook-forwarder.ts` |
| `src/utils/spawnClaude.ts` | `src/harnesses/claude/process/spawn.ts` |
| `src/hooks/useClaudeProcess.ts` | `src/harnesses/claude/process/useProcess.ts` |
| `src/utils/generateHookSettings.ts` | `src/harnesses/claude/hooks/generateHookSettings.ts` |
| `src/utils/parseStreamJson.ts` | `src/harnesses/claude/process/tokenAccumulator.ts` |
| `src/utils/detectClaudeVersion.ts` | `src/harnesses/claude/system/detectVersion.ts` |
| `src/utils/resolveModel.ts` | `src/harnesses/claude/config/readSettingsModel.ts` |
| `src/types/isolation.ts` + `src/utils/flagRegistry.ts` | `src/harnesses/claude/config/*` |
| `src/feed/*` | `src/core/feed/*` |
| `src/hooks/hookController.ts` | `src/core/controller/runtimeController.ts` |
| `src/runtime/types.ts` | `src/core/runtime/types.ts` |
| `src/workflows/*` | `src/core/workflows/*` |
| `src/sessions/*` | `src/infra/sessions/*` |
| `src/plugins/*` | `src/infra/plugins/*` |
| `src/components/*` | `src/ui/components/*` |
| `src/context/HookContext.tsx` | `src/app/providers/RuntimeProvider.tsx` |
| `src/cli.tsx`, `src/app.tsx` | `src/app/entry/cli.tsx`, `src/app/shell/AppShell.tsx` |
| `src/theme/*`, `src/glyphs/*` | `src/ui/theme/*`, `src/ui/glyphs/*` |
| neutral utils/types in `src/utils`, `src/types` | `src/shared/*` |

## Migration Strategy

### Shim Policy (required)

For every moved file in phases 1-6:

1. `git mv` file to target path.
2. Add old-path shim file that re-exports from new path.
3. Update imports gradually by phase, then remove shims in cleanup phase.

Shim format:

```ts
export * from '../new/path.js';
```

or for default export:

```ts
export {default} from '../new/path.js';
```

This keeps runtime stable while moving large trees.

---

## Phase Plan

## Phase 0: Prep and Guardrails

### Scope

- Add folder structure doc references.
- Add stricter boundary lint/test rules before moves.
- Add optional TS path aliases (do not require immediate adoption).

### Files

- `eslint.config.js`
- `src/runtime/__tests__/boundary.test.ts`
- `tsconfig.json` (optional path aliases)

### Validation

- `npm run lint`
- `npx vitest run src/runtime/__tests__/boundary.test.ts`

### Commit

`chore(structure): add boundary guardrails before folder migration`

---

## Phase 1: Extract Claude Protocol and Runtime Adapter

### Scope

Move Claude protocol/runtime transport code under `src/harnesses/claude/`.

### Moves

- `src/runtime/adapters/claudeHooks/*` -> `src/harnesses/claude/runtime/*`
- `src/types/hooks/*` -> `src/harnesses/claude/protocol/*`
- `src/hook-forwarder.ts` -> `src/harnesses/claude/hook-forwarder.ts`

### Immediate shims

- `src/runtime/adapters/claudeHooks/*`
- `src/types/hooks/*`
- `src/hook-forwarder.ts`

### Validation

- `npm run typecheck`
- `npx vitest run src/runtime/adapters/claudeHooks/__tests__/server.test.ts src/runtime/adapters/claudeHooks/__tests__/mapper.test.ts src/types/hooks.test.ts`

### Commit

`refactor(structure): move claude protocol and runtime adapter under harnesses/claude`

---

## Phase 2: Extract Claude Process and Config Stack

### Scope

Move process spawn, hook-settings generation, token parser, and Claude config readers.

### Moves

- `src/utils/spawnClaude.ts` -> `src/harnesses/claude/process/spawn.ts`
- `src/hooks/useClaudeProcess.ts` -> `src/harnesses/claude/process/useProcess.ts`
- `src/utils/generateHookSettings.ts` -> `src/harnesses/claude/hooks/generateHookSettings.ts`
- `src/utils/parseStreamJson.ts` -> `src/harnesses/claude/process/tokenAccumulator.ts`
- `src/utils/detectClaudeVersion.ts` -> `src/harnesses/claude/system/detectVersion.ts`
- `src/utils/resolveModel.ts` -> `src/harnesses/claude/config/readSettingsModel.ts`
- `src/types/isolation.ts` -> `src/harnesses/claude/config/isolation.ts`
- `src/utils/flagRegistry.ts` -> `src/harnesses/claude/config/flagRegistry.ts`

### Immediate shims

- old locations listed above

### Validation

- `npm run typecheck`
- `npx vitest run src/hooks/useClaudeProcess.test.ts src/utils/spawnClaude.test.ts src/utils/generateHookSettings.test.ts src/utils/parseStreamJson.test.ts src/types/isolation.test.ts src/utils/flagRegistry.test.ts src/utils/resolveModel.test.ts src/utils/detectClaudeVersion.test.ts`

### Commit

`refactor(structure): move claude process and config modules under harnesses/claude`

---

## Phase 3: Core Domain Extraction

### Scope

Move harness-agnostic runtime/feed/controller/workflows to `src/core/`.

### Moves

- `src/feed/*` -> `src/core/feed/*`
- `src/runtime/types.ts` -> `src/core/runtime/types.ts`
- `src/hooks/hookController.ts` -> `src/core/controller/runtimeController.ts`
- `src/workflows/*` -> `src/core/workflows/*`
- candidate shared types from `src/types/rules.ts`, `src/types/todo.ts` to `src/core/` or `src/shared/`

### Immediate shims

- old `src/feed/*`, `src/runtime/types.ts`, `src/hooks/hookController.ts`, `src/workflows/*`

### Validation

- `npm run typecheck`
- `npx vitest run src/feed/__tests__/mapper.test.ts src/feed/timeline.test.ts src/hooks/hookController.test.ts src/workflows/__tests__/loopManager.test.ts src/workflows/__tests__/registry.test.ts`

### Commit

`refactor(structure): move harness-agnostic feed runtime and workflows to core`

---

## Phase 4: Infra Extraction

### Scope

Move persistence and plugin/config loading code to `src/infra/`.

### Moves

- `src/sessions/*` -> `src/infra/sessions/*`
- `src/plugins/*` -> `src/infra/plugins/*`
- related IO utilities from `src/utils/sessionIndex.ts`, `src/utils/historyStore.ts` as needed

### Immediate shims

- old `src/sessions/*`, `src/plugins/*`, moved util files

### Validation

- `npm run typecheck`
- `npx vitest run src/sessions/store.test.ts src/sessions/schema.migration.test.ts src/sessions/registry.test.ts src/plugins/__tests__/config.test.ts src/plugins/__tests__/loader.test.ts`

### Commit

`refactor(structure): move sessions and plugins into infra layer`

---

## Phase 5: UI Extraction

### Scope

Move rendering and UI-only hooks under `src/ui/`.

### Moves

- `src/components/*` -> `src/ui/components/*`
- UI hooks from `src/hooks/*` -> `src/ui/hooks/*` (exclude domain/service hooks if any)
- `src/theme/*` -> `src/ui/theme/*`
- `src/glyphs/*` -> `src/ui/glyphs/*`

### Immediate shims

- old component/hook/theme/glyph paths

### Validation

- `npm run typecheck`
- `npx vitest run src/components/__tests__/FeedList.test.tsx src/components/PermissionDialog.test.tsx src/hooks/useFeedNavigation.ts`

### Commit

`refactor(structure): move ui components hooks theme glyphs under ui`

---

## Phase 6: App Composition Root

### Scope

Move app wiring and providers into `src/app/` with explicit composition boundaries.

### Moves

- `src/cli.tsx` -> `src/app/entry/cli.tsx`
- `src/app.tsx` -> `src/app/shell/AppShell.tsx`
- `src/context/HookContext.tsx` -> `src/app/providers/RuntimeProvider.tsx`
- command wiring from `src/commands/*` into `src/app/commands/*` if still app-level orchestration

### Validation

- `npm run typecheck`
- `npx vitest run src/commands/__tests__/executor.test.ts src/setup/__tests__/SetupWizard.test.tsx`

### Commit

`refactor(structure): create app composition root and move entry/provider wiring`

---

## Phase 7: Shared Utilities and Type Cleanup

### Scope

Move neutral helpers/types to `src/shared/` and remove stale names.

### Candidates

- `src/types/common.ts` -> `src/shared/types/common.ts`
- `src/utils/format.ts` -> `src/shared/utils/format.ts`
- `src/utils/truncate.ts` -> `src/shared/utils/truncate.ts`
- similar neutral modules

### Validation

- `npm run typecheck`
- `npm test`

### Commit

`refactor(structure): consolidate shared utilities and types`

---

## Phase 8: Remove Shims and Normalize Imports

### Scope

Remove all temporary old-path re-export shims and finalize boundaries.

### Work

1. Replace remaining old imports using `rg` + codemod-safe replacements.
2. Remove shim files.
3. Tighten ESLint boundaries to new top-level structure.

### Validation

- `npm run lint`
- `npm run typecheck`
- `npm test`

### Commit

`chore(structure): remove migration shims and finalize import boundaries`

---

## Risk Controls

1. Keep phase commits small and reversible.
2. Never combine behavior changes with folder moves.
3. Use targeted test suites per phase first, then full suite.
4. If a phase causes cascading import churn, split into sub-phases before proceeding.

## Suggested Execution Commands Per Phase

```bash
# before phase
git status --short

# after moves
npm run typecheck
npx vitest run <phase-specific-tests>

# optional full gate every 2 phases
npm run lint
npm test
```

## Definition of Done

1. Claude-specific code is isolated under `src/harnesses/claude/`.
2. Core logic in `src/core/` has no direct Claude protocol imports.
3. UI in `src/ui/` renders domain state without adapter coupling.
4. Infra concerns live under `src/infra/`.
5. App entry/wiring is explicit under `src/app/`.
