# Test Gap Analysis

**Date:** 2026-02-23
**Suite:** 122 files, 1361 tests (post-sentinel addition)

## Structural Critique

The athena-cli test suite was **library-biased, not pipeline-biased**. The codebase is a pipeline + persistence engine + permission orchestrator, but the test suite was optimized for the patterns of a utility library: isolated pure-function tests, comprehensive formatter coverage, exhaustive boundary import checks.

This mismatch meant:

- **232 boundary import tests** (risk weight 1) enforcing ESLint-level rules
- **~180 formatter/cosmetic tests** (risk weight 1–2) covering string output
- **5 integration tests** (risk weight 5) covering the actual pipeline
- **0 sentinel tests** covering architectural invariants (now 7)

The sentinel effort (Phase 1 of this plan) added 12 tests across 7 sentinel files covering the highest-risk invariants, and found a real bug in the process (duplicate decision acceptance in `mapDecision`).

## Test Distribution by Risk Weight

| Risk Weight | Description                | Test Count | % of Suite |
| ----------- | -------------------------- | ---------- | ---------- |
| 5           | Data/permission corruption | ~38        | 2.8%       |
| 4           | Incorrect execution/replay | ~55        | 4.0%       |
| 3           | Semantic behavior          | ~95        | 7.0%       |
| 2           | Usability degradation      | ~350       | 25.7%      |
| 1           | Cosmetic/formatting        | ~823       | 60.5%      |

The suite is bottom-heavy: ~86% of tests protect against risk weight 1–2 issues, while only ~7% protect against weight 4–5 issues. This is common in test suites that grew organically from unit test templates.

## Verified Assessment by Cluster

### High-Signal Clusters (Keep All)

**HookEvent / UnifiedToolCallEvent rendering** (~32 tests)
These test real rendering behavior with Ink's testing library. They're complementary — HookEvent tests the event dispatch, UnifiedToolCallEvent tests the consolidated output. Risk weight 2–3.

**Feed mapper** (~51 tests across 3 files)
Core pipeline logic. mapper.test.ts (46), mapper.test.ts (3), mapper.global-seq.test.ts (2). These test event attribution, subagent stack, run boundaries, and seq allocation. Risk weight 4. **Keep all.**

**useHookServer** (5 tests)
Tests the UDS server lifecycle — real socket creation, connection handling, NDJSON protocol. Risk weight 3. **HIGH SIGNAL, keep.**

**Feed append ordering / timeline** (45 tests)
Tests the timeline model that determines how feed events are grouped and ordered. Risk weight 3. Already covers the ordering semantics that burst-ordering sentinel tests at the persistence layer.

**hookController** (8 tests)
Tests the event dispatch chain — first-match-wins handler resolution. Risk weight 3.

**Sessions store + integration** (16 tests)
Tests persistence, restore, schema migration, and integration. Risk weight 4–5.

### True Redundancies (Safe to Remove)

**matchRule.test.ts** (8 tests)
Subset of hookController.test.ts. The controller tests exercise matchRule through the handler dispatch path. Standalone matchRule tests add no unique coverage. Risk weight 2.

**PostToolResult.**tests\*\*\*\* (2 tests)
Duplicate of PostToolResult.test.tsx (4 tests). The `__tests__/` version tests the same component with fewer cases. Risk weight 2.

**Header.test.tsx** (5 tests)
Tests the legacy Header component which is superseded by the dashboard shell. Kept for compatibility but the component itself is legacy. Risk weight 1.

**Total removable:** 15 tests across 3 files.

### Overgrown but Not Redundant

**boundary.test.ts** (232 tests)
Not redundant — each test verifies a specific import boundary. But 232 is disproportionate for risk weight 1. Future work could compress these into parameterized assertions without losing coverage.

**format.test.ts** (49 tests) + **formatters.test.ts** (37 tests)
Comprehensive formatter coverage. Not redundant (different formatters), but overinvested relative to risk weight 1. Future compression candidate.

**toolNameParser.test.ts** (40 tests)
Exhaustive parser coverage. Valuable for the parser but risk weight 1. Future compression candidate.

## Gaps Closed by Sentinels

| Gap                            | Before          | After                                           |
| ------------------------------ | --------------- | ----------------------------------------------- |
| Persist→restore equivalence    | No test         | `replay-equivalence.sentinel.test.ts`           |
| Seq monotonicity under burst   | No test         | `burst-ordering.sentinel.test.ts`               |
| Duplicate decision prevention  | **Bug existed** | `double-decision.sentinel.test.ts` + mapper fix |
| Resume auto-execution guard    | No test         | `resume-discipline.sentinel.test.ts`            |
| Resume event duplication       | No test         | `resume-no-duplication.sentinel.test.ts`        |
| Unknown hook pipeline survival | No test         | `unknown-hook-survival.sentinel.test.ts`        |
| Degraded mode contract         | No test         | `degraded-mode.sentinel.test.ts`                |

## Remaining Gaps (Future Work)

These gaps are documented but not addressed in this plan:

1. **Permission round-trip** — No end-to-end test for PermissionRequest → user decision → hook response → feed event chain
2. **Subagent hierarchy persistence** — No test verifying subagent stack survives persist→restore
3. **Multi-run session lifecycle** — No test spanning multiple runs within a single Athena session
4. **Concurrent session rejection** — No test verifying `PRAGMA locking_mode = EXCLUSIVE` blocks a second writer
5. **Width degradation contracts** — Header rendering under narrow terminals lacks behavioral contracts

## Recommendations

1. **Do not add more weight-1 tests** until the weight 4–5 gap is fully closed
2. **Compress boundary.test.ts** from 232 individual assertions to parameterized cases (same coverage, less maintenance)
3. **Add 5–8 more integration tests** targeting the remaining gaps above
4. **Cap sentinels at ~10** — if you need more, the bar is too low or the architecture needs refactoring
