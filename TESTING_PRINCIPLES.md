# Testing Principles

Testing guidance for athena-cli — a pipeline + persistence engine + permission orchestrator + replay-driven UI.

## Principles

### 1. Test at system boundaries, not implementation details

Athena's risk concentrates at cross-layer boundaries: mapper→store→restore, event→decision→persistence, burst→ordering, resume→continuation. Tests crossing these boundaries protect against real corruption. Tests verifying internal formatting protect against cosmetic regressions.

### 2. Sentinel tests guard architectural invariants

Sentinel tests live in `source/__sentinels__/` with `.sentinel.test.ts` suffix. Every sentinel must:
- Cross at least two architectural layers
- Use real persistence (SQLite in-memory)
- Avoid mocks except for external process boundaries (e.g., spawnClaude)
- Start with an architectural sentinel header comment
- Assert invariant properties, not formatting details

Total sentinel count should stay at ~8–10 maximum. If it grows beyond that, the bar is too low.

### 3. Pipeline architecture codebases must maintain cross-layer coverage

Pipeline architectures (like athena's event→feed→store→restore chain) must maintain a non-trivial set of cross-layer tests covering all invariants in the Required Invariant Test Matrix (see below). Pure-function unit tests are valuable but insufficient — they don't protect against pipeline-level corruption.

### 4. Never delete tests before adding replacements

When rebalancing test coverage, always add higher-value tests first (sentinels, integration), verify they pass, then remove lower-value tests. This prevents coverage regression windows.

### 5. Prefer real dependencies over mocks

Mocking hides real integration failures. Use in-memory SQLite instead of mock stores. Use real FeedMapper instead of mock mappers. Mock only at external process boundaries where real dependencies would be non-deterministic or slow (child processes, file system, network).

### 6. One comprehensive test over many repetitive flag tests

For CLI arg mapping, test multiple options in a single test instead of one test per flag. For formatter output, test representative cases, not every possible input. Repetitive tests add maintenance cost without proportional signal.

### 7. Test behavior, not pass-through

Focus tests on callbacks, cleanup, error handling, and state transitions. Avoid testing trivial delegation where function A calls function B with the same arguments — that's testing the language, not the system.

### 8. Verify abort and cleanup paths

AbortController tests verify that aborted signals produce graceful early returns. Cleanup tests verify that resources are released. These paths are exercised rarely in production but fail catastrophically when broken.

### 9. Event handler tests use isolation with mock callbacks

Test each handler in isolation with mock `HandlerCallbacks`. This pattern verifies handler logic without requiring a full runtime stack, while still testing the real handler function (not a mock of it).

### 10. Structural assertions over cosmetic assertions

Assert on `kind`, `seq`, `actor_id`, `cause`, `run_id` — not on `title` wording or formatting strings. Structural fields define correctness; cosmetic fields define UX. Structural failures are bugs; cosmetic changes are intentional evolution.

### 11. Test proportional to blast radius

A session persistence test is worth more than 40 formatter tests. Allocate test investment where failure consequences are highest. Use the Risk Weight Scoring system below to guide investment decisions.

## Risk Weight Scoring

Every test file and sentinel carries an implicit risk weight:

| Weight | Category | Examples |
|--------|----------|----------|
| **5** | Data corruption, permission corruption, irreversible loss | Persist→restore equivalence, duplicate decision prevention, degraded mode detection |
| **4** | Incorrect execution or replay state | Seq monotonicity, resume duplication, run boundary isolation |
| **3** | Incorrect user-visible semantic behavior | Unknown hook survival, subagent attribution, tool event correlation |
| **2** | Usability degradation | Header rendering, width computation, duration formatting |
| **1** | Cosmetic / formatting | Title wording, glyph selection, color output |

When deciding whether to add, keep, or remove a test, consider its risk weight. A single weight-5 test protects more value than ten weight-1 tests.

## Required Invariant Test Matrix

These invariants must always have sentinel or integration test coverage:

| Invariant | Sentinel |
|-----------|----------|
| Persist→restore structural equivalence | `replay-equivalence.sentinel.test.ts` |
| Seq monotonicity under burst | `burst-ordering.sentinel.test.ts` |
| Single-decision-per-request | `double-decision.sentinel.test.ts` |
| Resume non-auto-execution | `resume-discipline.sentinel.test.ts` |
| Resume no event duplication | `resume-no-duplication.sentinel.test.ts` |
| Unknown hook forward compatibility | `unknown-hook-survival.sentinel.test.ts` |
| Degraded mode persistence contract | `degraded-mode.sentinel.test.ts` |

## Sentinel Header Template

```ts
/**
 * ARCHITECTURAL SENTINEL
 *
 * Protects: <explicit invariant>
 * Risk weight: <N>
 *
 * If this test fails, investigate pipeline integrity before touching assertions.
 */
```
