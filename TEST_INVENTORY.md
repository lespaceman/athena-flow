# Test Inventory

**Snapshot date:** 2026-02-23
**Total:** 122 test files, 1361 tests

## Summary by Layer

| Layer                        | Files | Tests | Avg Risk Weight |
| ---------------------------- | ----- | ----- | --------------- |
| Sentinels (`__sentinels__/`) | 7     | 12    | 4.3             |
| Sessions/Persistence         | 6     | 26    | 4.5             |
| Feed (mapper, types, filter) | 9     | 144   | 3.5             |
| Runtime/Protocol             | 6     | 255   | 2.5             |
| Hooks                        | 16    | 164   | 2.5             |
| Components                   | 30    | 188   | 2.0             |
| Utils/Formatters             | 20    | 310   | 1.5             |
| Commands                     | 7     | 32    | 2.0             |
| Plugins                      | 5     | 67    | 2.5             |
| Workflows                    | 3     | 21    | 3.0             |
| Setup                        | 6     | 16    | 1.5             |
| Types/Invariants             | 4     | 35    | 2.0             |
| Theme/Glyphs                 | 3     | 17    | 1.0             |

## Structural Observation

The largest single test file is `boundary.test.ts` with 232 tests (17% of suite). These are import boundary enforcement tests at risk weight 1 — they verify ESLint-level import rules, not runtime behavior. While useful as a guard rail, 232 tests at weight 1 represent the same suite investment as ~46 weight-5 sentinel tests.

Meanwhile, the sentinel directory (12 tests) covers 7 architectural invariants at weights 3–5, and the sessions layer (26 tests) covers persistence correctness. Together these 38 tests protect more value than the remaining 1323.

**Key ratio:** 232 boundary import tests (risk 1) vs 12 sentinel tests (risk 4–5) represents structurally inverted risk coverage — now being corrected by this effort.

## File Inventory

### Sentinels (Risk 3–5)

| File                                     | Tests | Risk | Protects                                  |
| ---------------------------------------- | ----- | ---- | ----------------------------------------- |
| `replay-equivalence.sentinel.test.ts`    | 2     | 5    | Persist→restore structural equivalence    |
| `burst-ordering.sentinel.test.ts`        | 1     | 4    | Seq monotonicity under interleaved events |
| `double-decision.sentinel.test.ts`       | 2     | 4    | Single-decision-per-request               |
| `resume-discipline.sentinel.test.ts`     | 2     | 5    | Resume non-auto-execution                 |
| `resume-no-duplication.sentinel.test.ts` | 1     | 4    | Resume no event duplication               |
| `unknown-hook-survival.sentinel.test.ts` | 1     | 3    | Forward-compatible unknown hooks          |
| `degraded-mode.sentinel.test.ts`         | 3     | 5    | Persistence failure detection             |

### Sessions/Persistence (Risk 4–5)

| File                                   | Tests | Risk |
| -------------------------------------- | ----- | ---- |
| `sessions/store.test.ts`               | 8     | 5    |
| `sessions/registry.test.ts`            | 8     | 3    |
| `sessions/schema.test.ts`              | 3     | 4    |
| `sessions/schema.migration.test.ts`    | 3     | 4    |
| `sessions/integration.test.ts`         | 3     | 5    |
| `sessions/restore.integration.test.ts` | 2     | 5    |

### Feed (Risk 3–4)

| File                                | Tests | Risk |
| ----------------------------------- | ----- | ---- |
| `feed/__tests__/mapper.test.ts`     | 46    | 4    |
| `feed/timeline.test.ts`             | 45    | 3    |
| `feed/feedLineStyle.test.ts`        | 16    | 2    |
| `feed/__tests__/titleGen.test.ts`   | 15    | 1    |
| `feed/__tests__/expandable.test.ts` | 9     | 2    |
| `feed/__tests__/filter.test.ts`     | 8     | 3    |
| `feed/todoPanel.test.ts`            | 4     | 2    |
| `feed/mapper.test.ts`               | 3     | 4    |
| `feed/mapper.global-seq.test.ts`    | 2     | 4    |

### Runtime/Protocol (Risk 1–3)

| File                                                              | Tests | Risk |
| ----------------------------------------------------------------- | ----- | ---- |
| `runtime/__tests__/boundary.test.ts`                              | 232   | 1    |
| `runtime/adapters/claudeHooks/__tests__/mapper.test.ts`           | 7     | 3    |
| `runtime/adapters/claudeHooks/__tests__/decisionMapper.test.ts`   | 7     | 3    |
| `runtime/adapters/claudeHooks/__tests__/server.test.ts`           | 4     | 3    |
| `runtime/adapters/claudeHooks/__tests__/interactionRules.test.ts` | 2     | 2    |
| `runtime/adapters/mock/__tests__/mock.test.ts`                    | 4     | 1    |

### Hooks (Risk 2–3)

| File                                             | Tests | Risk |
| ------------------------------------------------ | ----- | ---- |
| `hooks/useTextInput.test.ts`                     | 45    | 2    |
| `hooks/useClaudeProcess.test.ts`                 | 34    | 3    |
| `hooks/useCommandMode.test.ts`                   | 13    | 2    |
| `hooks/useHeaderMetrics.test.ts`                 | 12    | 2    |
| `hooks/useInputHistory.test.ts`                  | 10    | 2    |
| `hooks/__tests__/useFocusableList.test.ts`       | 8     | 2    |
| `hooks/matchRule.test.ts`                        | 8     | 2    |
| `hooks/hookController.test.ts`                   | 8     | 3    |
| `hooks/useHookServer.test.ts`                    | 5     | 3    |
| `hooks/useSpinner.test.ts`                       | 5     | 1    |
| `hooks/useRequestQueue.test.ts`                  | 4     | 3    |
| `hooks/useDuration.test.ts`                      | 4     | 1    |
| `hooks/__tests__/useFeedPermissionQueue.test.ts` | 4     | 3    |
| `hooks/useAppMode.test.ts`                       | 1     | 2    |
| `hooks/__tests__/useFeedAutoDequeue.test.ts`     | 1     | 3    |

### Utils/Formatters (Risk 1–2)

| File                                 | Tests | Risk |
| ------------------------------------ | ----- | ---- |
| `utils/format.test.ts`               | 49    | 1    |
| `utils/toolNameParser.test.ts`       | 40    | 1    |
| `utils/flagRegistry.test.ts`         | 40    | 2    |
| `utils/toolExtractors.test.ts`       | 37    | 2    |
| `utils/formatters.test.ts`           | 37    | 1    |
| `utils/headerModel.test.ts`          | 15    | 2    |
| `utils/parseStreamJson.test.ts`      | 14    | 3    |
| `utils/hookLogger.test.ts`           | 14    | 2    |
| `utils/spawnClaude.test.ts`          | 13    | 3    |
| `utils/renderDetailLines.test.ts`    | 12    | 1    |
| `utils/generateHookSettings.test.ts` | 11    | 2    |
| `utils/renderHeaderLines.test.ts`    | 10    | 1    |
| `utils/historyStore.test.ts`         | 10    | 2    |
| `utils/contextBar.test.ts`           | 8     | 1    |
| `utils/sessionIndex.test.ts`         | 7     | 2    |
| `utils/processRegistry.test.ts`      | 7     | 2    |
| `utils/truncate.test.ts`             | 6     | 1    |
| `utils/statusBadge.test.ts`          | 5     | 1    |
| `utils/agentChain.test.ts`           | 5     | 2    |
| `utils/resolveModel.test.ts`         | 3     | 2    |
| `utils/detectHarness.test.ts`        | 1     | 1    |
| `utils/detectClaudeVersion.test.ts`  | 1     | 1    |
