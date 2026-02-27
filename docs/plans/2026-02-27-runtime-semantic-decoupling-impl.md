# Runtime Semantic Decoupling Implementation Plan (Hardest Track)

Date: 2026-02-27  
Status: Draft  
Depends on: none (this track should run first)

## Why This Is The Hardest Track

This track changes the core semantic contract used by:

- runtime adapters
- controller decisions
- feed mapping
- persistence replay assumptions

Today, these layers are connected by Claude hook names (`PermissionRequest`, `PreToolUse`, `SubagentStart`, etc.) and Claude payload fields. Decoupling this safely requires staged compatibility work and broad test updates.

## Goal

Make core domain logic operate on canonical runtime semantics, not Claude hook protocol names.

## Pathing Note

Canonical implementation paths in this plan follow the new structure (`src/core`, `src/harnesses`, `src/infra`, `src/app`).
Some tests still run from legacy shim locations (`src/feed`, `src/hooks`, `src/sessions`, `src/runtime/adapters/claudeHooks`) until shim removal.

## Target Architecture

1. `RuntimeEvent` carries canonical event kind and normalized data.
2. Adapter-specific metadata (`hook name`, raw payload) is retained only for debugging and unknown-event fallback.
3. `runtimeController` and `core/feed/mapper` switch on canonical kinds.
4. Decision intents remain semantic and adapter mappers translate to wire protocol.

---

## Task 1: Introduce Canonical Runtime Event Schema

### Files

- Create: `src/core/runtime/events.ts`
- Modify: `src/core/runtime/types.ts`

### Work

1. Add canonical kinds (example: `session.start`, `session.end`, `user.prompt`, `tool.pre`, `tool.post`, `tool.failure`, `permission.request`, `agent.stop`, `subagent.start`, `subagent.stop`, `notification`, `compact.pre`, `setup`, `unknown`).
2. Define typed normalized data structures for canonical kinds.
3. Extend `RuntimeEvent` with canonical fields (for example `kind`, `data`, and adapter metadata).
4. Keep temporary compatibility fields (`hookName`, `payload`) with deprecation comments for migration window.

### Validation

- `npm run typecheck`
- Add/adjust unit tests under `src/core/runtime/` for type-level and mapper-level compatibility.

### Exit Criteria

- Canonical event schema exists and is importable from non-adapter modules.

---

## Task 2: Add Claude Translator To Canonical Events

### Files

- Create: `src/harnesses/claude/runtime/eventTranslator.ts`
- Modify: `src/harnesses/claude/runtime/mapper.ts`
- Modify tests in `src/runtime/adapters/claudeHooks/__tests__/mapper.test.ts` (legacy shim test path)

### Work

1. Implement a pure translator: Claude envelope/payload -> canonical `RuntimeEvent.kind` + normalized `data`.
2. Keep raw metadata attached for diagnostics and unknown-event fallback.
3. Ensure unknown Claude events map to canonical `unknown` without dropping data.
4. Keep current derived fields (`toolName`, `toolUseId`, `agentId`, `agentType`) available during migration.

### Validation

- `npx vitest run src/runtime/adapters/claudeHooks/__tests__/mapper.test.ts`
- Add golden test cases for each canonical kind mapping.

### Exit Criteria

- Claude adapter emits canonical kinds for all currently supported hook events.

---

## Task 3: Refactor Interaction Rules To Canonical Kinds

### Files

- Modify: `src/harnesses/claude/runtime/interactionRules.ts`
- Update related tests

### Work

1. Key interaction hints by canonical event kind rather than raw hook names.
2. Retain adapter-side overrides where wire protocol requires it.
3. Ensure unknown canonical events default to safe passthrough behavior.

### Validation

- `npx vitest run src/runtime/adapters/claudeHooks/__tests__/interactionRules.test.ts`

### Exit Criteria

- Interaction behavior no longer depends on literal Claude hook strings outside translator boundaries.

---

## Task 4: Refactor Controller To Canonical Semantics

### Files

- Modify: `src/core/controller/runtimeController.ts`
- Modify: `src/hooks/hookController.test.ts` (legacy shim test path)

### Work

1. Replace `event.hookName` branching with canonical `event.kind`.
2. Use normalized data fields for permission/question handling.
3. Preserve current rule behavior and queue semantics.
4. Keep decision outputs semantic (`RuntimeIntent`), without adapter-specific JSON assumptions.

### Validation

- `npx vitest run src/hooks/hookController.test.ts`

### Exit Criteria

- Controller logic is harness-neutral and passes existing behavior tests.

---

## Task 5: Refactor Feed Mapper To Canonical Events

### Files

- Modify: `src/core/feed/mapper.ts`
- Modify tests:
  - `src/feed/__tests__/mapper.test.ts` (legacy shim test path)
  - `src/feed/mapper.global-seq.test.ts` (legacy shim test path)
  - any mapper-dependent timeline tests

### Work

1. Switch event mapping from `hookName` + raw payload reads to canonical `kind` + normalized `data`.
2. Preserve existing feed event outputs and causality where possible.
3. Keep `unknown.hook` feed behavior by using adapter metadata/raw payload from canonical `unknown`.
4. Confirm run/session/subagent attribution remains unchanged.

### Validation

- `npx vitest run src/feed/__tests__/mapper.test.ts src/feed/mapper.global-seq.test.ts src/feed/timeline.test.ts`

### Exit Criteria

- Feed mapper no longer parses Claude-specific payload keys directly.

---

## Task 6: Decision Mapping Hard Boundary

### Files

- Modify: `src/harnesses/claude/runtime/decisionMapper.ts`
- Optionally create shared semantic decision helpers under `src/core/runtime/`

### Work

1. Ensure decision mapper consumes semantic `RuntimeDecision` only.
2. Keep all Claude wire response construction contained in adapter module.
3. Add explicit tests for each semantic intent mapping.

### Validation

- `npx vitest run src/runtime/adapters/claudeHooks/__tests__/decisionMapper.test.ts`

### Exit Criteria

- No non-adapter file constructs Claude `hookSpecificOutput` payload shapes.

---

## Task 7: Persistence Compatibility And Migration

### Files

- Modify: `src/infra/sessions/schema.ts`
- Modify: `src/infra/sessions/store.ts`
- Modify/add schema migration tests

### Work

1. Decide whether to persist canonical kind/data columns separately or continue storing serialized runtime event only.
2. If schema changes are needed, add migration with backward compatibility.
3. Ensure restore/replay works across pre- and post-decoupling sessions.

### Validation

- `npx vitest run src/sessions/schema.migration.test.ts src/sessions/store.test.ts src/sessions/restore.integration.test.ts`

### Exit Criteria

- Existing session DBs remain readable and replay-safe.

---

## Task 8: Boundary Enforcement Updates

### Files

- Modify: `src/runtime/__tests__/boundary.test.ts`
- Modify: `eslint.config.js`

### Work

1. Expand boundary checks to prevent raw Claude hook-name branching in UI/feed/controller layers.
2. Keep adapter imports restricted to bridge/factory modules only.
3. Add guardrails for canonical runtime event usage.

### Validation

- `npx vitest run src/runtime/__tests__/boundary.test.ts`
- `npm run lint`

### Exit Criteria

- Static guards prevent reintroduction of direct Claude protocol coupling into core layers.

---

## Rollout Strategy

1. Add canonical schema in compatibility mode.
2. Migrate controller and mapper incrementally while keeping old fields readable.
3. Remove deprecated fields only after parity tests pass and session restore is validated.

## Definition Of Done

1. Core modules (`core/feed`, `core/controller`, `infra/sessions`, `app`) do not branch on Claude hook names.
2. Claude adapter remains functional with no user-visible regressions.
3. Remaining work to add a new harness is localized to harness modules plus runtime factory wiring.
