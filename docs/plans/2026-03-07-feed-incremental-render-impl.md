# Feed Incremental Renderer — Implementation Plan

**Goal:** Remove terminal-size-sensitive feed lag by changing the feed pane from full-frame Ink output generation to line-buffered, incremental repainting.

**Primary bottleneck:** Ink full-frame output generation and ANSI diffing, centered around `ink/build/output.js`, `string-width`, and `@alcalzone/ansi-tokenize`, not feed state derivation.

**Baseline evidence:** The March 7, 2026 19:31 profile shows the app is paint-bound. Large-terminal runs averaged roughly `108.65ms` paint time per cycle with about `33.4` visible rows and about `27KB` written per cycle, while a smaller terminal in the same session averaged roughly `10.48ms` paint time with about `9.3` visible rows and about `5KB` written.

**Design direction:** Keep Ink for the shell, dialogs, and input. Replace only the feed pane's current monolithic `<Text>{fullFrame}</Text>` path with a feed-surface model that repaints changed lines only.

## Constraints

- Preserve feed semantics, viewport policy, search behavior, tail-follow behavior, striping, focus styling, and empty-state rendering.
- Do not start by optimizing feed filtering, timeline mapping, or generic hook churn. The profile does not justify those as the primary target.
- Do not rewrite the whole app away from Ink.
- Do not accept a fix that merely shifts work from one full-frame path to another full-frame path.
- Keep the implementation switchable until perf and visual parity are proven.

## Success Criteria

- Large viewport scenario with roughly `30+` visible rows: reduce average `paint_ms` by at least `70%` relative to the March 7, 2026 19:31 baseline.
- Large viewport scenario: reduce `33.3ms` budget misses from `251/291` cycles to at most `30/291` cycles.
- Arrow navigation where only focus moves must no longer write full-viewport frames. Two-line semantic changes should result in small, bounded writes.
- Post-fix CPU profile should no longer be dominated by Ink output generation, `string-width`, and ANSI tokenization to the same extent.
- Small-terminal performance must not regress by more than `10%`.
- Visual output must remain identical for header, divider, focused row, matched row, striping, blank fill, and empty state.

## Non-Goals

- Changing feed content, labels, or layout semantics.
- Reworking the timeline model.
- Replacing Ink globally.
- Introducing visual simplifications as the main fix.

## Order Of Execution

1. Add instrumentation and pure helpers so the renderer can be changed safely.
2. Refactor `FeedGrid` into a line-buffer producer with no visual change.
3. Add a switchable feed-surface abstraction with a parity-preserving baseline backend.
4. Implement the incremental feed backend.
5. Add tests for line generation, line diffing, resize behavior, and visual parity.
6. Re-profile on small and large terminal sizes.
7. Remove the old monolithic path only after perf and parity pass.

## Phase 0: Instrumentation And Safety Rails

### Task 0.1: Extend perf instrumentation for feed repaint analysis

**Files:**

- Modify: `src/shared/utils/perf.ts`
- Modify: `docs/performance-profiling.md` if new fields need documentation

**Changes:**

- Add feed-specific fields to cycle logging:
  - `feed_surface_backend`
  - `feed_lines_visible`
  - `feed_lines_rendered`
  - `feed_lines_changed`
  - `feed_lines_cleared`
- Keep existing `bytes_written`, `visible_rows_changed`, and paint-stage metrics.
- Make backend identity explicit in `cycle.summary` so before/after comparisons are reliable.

**Checklist:**

- [ ] Add new event fields without breaking existing summaries.
- [ ] Keep default profiling overhead low.
- [ ] Update perf docs only if field meanings are non-obvious.

**Verification:**

- Run `npm test`.
- Run `node scripts/perf-summary.mjs <recent ndjson>` and confirm logs still parse.

### Task 0.2: Capture a stable baseline before renderer edits

**Files:**

- No code changes required

**Runbook:**

- Run `npm run perf:tui -- -- sessions`.
- Record two traces:
  - one with a laptop-sized terminal
  - one with a larger terminal that exposes the regression
- Reproduce:
  - arrow navigation in the feed/session area
  - slash-command entry
  - typing and deleting filter text
  - `Enter`

**Checklist:**

- [ ] Save the matching `.cpuprofile` and `.ndjson` artifact names.
- [ ] Record average `paint_ms`, `bytes_written`, `visible_rows`, and budget misses.
- [ ] Use the same interaction sequence after each phase.

## Phase 1: Extract A Pure Feed Surface Model

### Task 1.1: Move feed line construction into pure helpers

**Files:**

- Modify: `src/ui/components/FeedGrid.tsx`
- Add: `src/ui/components/feedSurface.ts` or `src/ui/components/feedSurface.tsx`
- Add tests: `src/ui/components/feedSurface.test.ts`

**Changes:**

- Extract the current header, divider, visible row, blank-row, and empty-state string generation from `FeedGrid` into pure helpers.
- Represent the visible feed as a structured line buffer, for example:
  - `headerLines: string[]`
  - `bodyLines: string[]`
  - `allLines: string[]`
  - metadata for `visibleContentRows`, `startIndex`, and line-to-entry mapping
- Keep `formatFeedRowLine()` as the row formatter of record.

**Checklist:**

- [ ] No visual change in this phase.
- [ ] Preserve current header/divider placement logic.
- [ ] Preserve blank fill when the viewport exceeds entry count.
- [ ] Preserve the `(no feed events)` state.
- [ ] Preserve row striping, focus styling, and match styling.

**Tests:**

- [ ] Empty feed produces header plus empty-state rows correctly.
- [ ] Header divider appears only when `feedHeaderRows > 0 && feedContentRows > 1`.
- [ ] Partial viewport produces blank fill lines at the bottom.
- [ ] Focused row styling survives extraction.
- [ ] Search-matched rows and striped rows remain stable.

### Task 1.2: Add visible-line diffing as a pure function

**Files:**

- Add: `src/ui/components/feedSurfaceDiff.ts`
- Add tests: `src/ui/components/feedSurfaceDiff.test.ts`

**Changes:**

- Add a pure helper that compares previous and next visible line buffers and returns:
  - changed line indexes
  - cleared line indexes
  - unchanged line count
- Include resize cases where line count grows or shrinks.

**Checklist:**

- [ ] Distinguish content change from trailing line clear.
- [ ] Handle header-only changes.
- [ ] Handle viewport shifts cleanly.
- [ ] Handle focus movement where only two lines change.

**Tests:**

- [ ] Focus move changes only old and new focused rows.
- [ ] Resize shorter reports trailing clears.
- [ ] Resize taller reports only newly exposed lines.
- [ ] Full viewport shift reports the expected changed range.

### Task 1.3: Keep `FeedGrid` behavior stable while using the extracted model

**Files:**

- Modify: `src/ui/components/FeedGrid.tsx`
- Update tests: `src/ui/components/FeedGrid.test.ts`

**Changes:**

- Make `FeedGrid` consume the extracted line-buffer helpers.
- Continue rendering through the current Ink path for now.
- Move perf logging to use the structured surface metadata instead of ad hoc local values.

**Checklist:**

- [ ] Keep `FeedGrid` prop contract stable for `AppShell`.
- [ ] Keep current `React.memo` boundary unless there is a measured reason to change it.
- [ ] Preserve current viewport diff logging semantics.

**Tests:**

- [ ] Add tests beyond `shouldUseLiveFeedScrollback()`.
- [ ] Verify line-buffer generation for representative feed states.
- [ ] Verify output parity against snapshots or frame assertions for fixed-width cases.

## Phase 2: Introduce A Feed Surface Abstraction

### Task 2.1: Add a switchable feed-surface backend boundary

**Files:**

- Add: `src/ui/components/FeedSurface.tsx`
- Modify: `src/ui/components/FeedGrid.tsx`
- Modify: `src/app/shell/AppShell.tsx` only if configuration plumbing is needed

**Changes:**

- Introduce a `FeedSurface` component or hook that takes the structured feed model and renders through one backend.
- Backends:
  - `ink-full` for the current parity path
  - `incremental` for the target path
- Gate backend choice behind a local config or env var first.

**Checklist:**

- [ ] Default remains safe until the incremental backend is validated.
- [ ] Backend choice is visible in perf logs.
- [ ] No behavior drift between backends.

**Tests:**

- [ ] Backend selection is deterministic.
- [ ] Unsupported or missing config falls back safely.

### Task 2.2: Keep the baseline backend visually identical

**Files:**

- Modify: `src/ui/components/FeedSurface.tsx`
- Possibly simplify: `src/ui/components/FeedGrid.tsx`

**Changes:**

- Make `ink-full` use the extracted line buffer and rejoin lines into a single output only inside the backend.
- This preserves parity while isolating the old renderer behind the new abstraction.

**Checklist:**

- [ ] No visual change.
- [ ] No prop churn into `AppShell`.
- [ ] The old path is now isolated and removable later.

## Phase 3: Implement Incremental Feed Painting

### Task 3.1: Build an incremental line painter for the feed rectangle

**Files:**

- Add: `src/ui/components/IncrementalFeedSurface.tsx`
- Add helper(s): `src/ui/components/feedSurfacePainter.ts`
- Modify: `src/ui/components/FeedSurface.tsx`

**Changes:**

- Maintain the previous painted visible line buffer for the feed pane.
- On update, compute changed and cleared line indexes from the pure diff helper.
- Emit terminal writes only for changed feed lines and clears within the feed rectangle.
- Keep header, divider, body rows, and blank fill all inside the same feed-rectangle contract.

**Implementation boundary:**

- The feed pane owns a rectangular region only.
- The painter must not interfere with the rest of the shell's layout or cursor handling.
- The painter must tolerate resize, focus moves, blank-line fill, and transitions to/from empty feed.

**Checklist:**

- [ ] Repaint only changed lines.
- [ ] Clear lines that disappear after shrink or content reduction.
- [ ] Keep cursor restoration stable.
- [ ] Do not leak stale lines after resize or viewport changes.
- [ ] Do not repaint the entire pane when only focus moves.

**Tests:**

- [ ] Focus move repaints only the old and new focused rows.
- [ ] Header update repaints header lines only.
- [ ] Empty-to-nonempty and nonempty-to-empty transitions clear stale content.
- [ ] Resize shorter clears trailing lines.
- [ ] Resize taller paints only newly exposed lines plus changed content.

### Task 3.2: Define how Ink and the feed painter coexist

**Files:**

- Modify: `src/app/shell/AppShell.tsx`
- Modify: `src/app/entry/cli.tsx` only if stdout coordination is needed
- Modify: `src/shared/utils/perf.ts` if custom write attribution is required

**Changes:**

- Ensure the feed painter runs in a controlled region and does not fight Ink's normal frame updates.
- If needed, suspend the old feed subtree's visible output while the incremental painter owns the region.
- Keep dialogs, input, and non-feed shell rendering on Ink.

**Checklist:**

- [ ] No double-writing of feed content.
- [ ] No flicker from Ink repainting over the incremental feed.
- [ ] No broken cursor placement after input.
- [ ] Perf write attribution remains understandable.

**Risk note:**

- This is the most architecture-sensitive part. If Ink cannot coexist cleanly with feed-region ownership, the fallback is to move the feed pane fully outside Ink while leaving the rest of the shell in Ink.

## Phase 4: Validation And Cleanup

### Task 4.1: Add parity tests for representative feed scenes

**Files:**

- Add or update: `src/ui/components/__tests__/FeedGrid.test.tsx` if a render-level test file is more appropriate than `FeedGrid.test.ts`
- Add or update: `src/ui/components/feedSurface.test.ts`
- Add or update: `src/ui/components/feedSurfaceDiff.test.ts`

**Test scenes:**

- Empty feed
- Focused row in the middle of the viewport
- Search match highlighting
- Mixed tool rows and plain agent rows
- Bottom-of-list blank fill
- Resize from large to small and back

**Checklist:**

- [ ] Fixed-width expected output remains stable.
- [ ] No stale rows remain after shrink.
- [ ] Focus and match styles remain correct.

### Task 4.2: Re-profile both terminal sizes

**Files:**

- No code changes required

**Runbook:**

- Run `npm run perf:tui -- -- sessions` with the same interaction sequence used in baseline capture.
- Collect at least:
  - one smaller terminal run
  - one larger terminal run
- Summarize with `node scripts/perf-summary.mjs <ndjson>`.
- Load the matching `.cpuprofile` in DevTools and confirm hotspot movement.

**Checklist:**

- [ ] Compare `paint_ms`, `bytes_written`, and budget misses directly against baseline.
- [ ] Verify large-terminal perf no longer scales linearly with visible rows.
- [ ] Confirm the CPU profile is no longer dominated by `string-width` and ANSI tokenization to the same extent.

### Task 4.3: Remove the old monolithic feed path after sign-off

**Files:**

- Modify: `src/ui/components/FeedGrid.tsx`
- Modify: `src/ui/components/FeedSurface.tsx`
- Delete dead helpers if no longer used
- Update tests accordingly

**Checklist:**

- [ ] Remove the legacy giant-frame backend only after parity and perf pass.
- [ ] Remove stale feature flags if no longer needed.
- [ ] Keep the surface abstraction so future work does not regress into full-frame rendering.

## File-By-File Task Breakdown

### `src/ui/components/FeedGrid.tsx`

- Extract pure line-buffer generation.
- Stop owning full-frame string generation directly.
- Keep viewport diff logging but drive it from structured feed metadata.
- Delegate rendering to `FeedSurface`.

### `src/ui/components/FeedRow.tsx`

- Keep `formatFeedRowLine()` as the canonical row formatter.
- Preserve cache behavior unless profiling shows a real issue here.
- Add tests for formatting parity if new edge cases are exposed during extraction.

### `src/ui/components/FeedScrollback.tsx`

- Decide whether it becomes a reusable building block or dead code.
- Remove it if the new surface model fully supersedes it.

### `src/ui/components/FeedSurface.tsx`

- New renderer boundary.
- Hosts backend selection and shared feed-model contract.
- Hides whether the backend is `ink-full` or `incremental`.

### `src/ui/components/feedSurface.ts`

- New pure helper module.
- Builds visible line buffers and associated metadata.

### `src/ui/components/feedSurfaceDiff.ts`

- New pure diff helper.
- Reports changed and cleared line indexes.

### `src/ui/components/IncrementalFeedSurface.tsx`

- Owns incremental repaint strategy.
- Maintains previous visible line buffer.
- Emits only changed or cleared line writes inside the feed region.

### `src/app/shell/AppShell.tsx`

- Keep API adjustments small.
- Only change plumbing required to mount and configure the new feed surface.
- Do not mix unrelated shell cleanup into this work.

### `src/shared/utils/perf.ts`

- Add feed-surface metrics.
- Keep summary compatibility.
- Attribute backend identity clearly.

### `src/ui/components/FeedGrid.test.ts` and new feed-surface tests

- Expand from mode-selection coverage into rendering-model coverage.
- Add pure line-buffer and diff tests before the incremental backend ships.

## Testing Guidelines

### Unit tests

- Prefer pure tests for line building and line diffing first.
- Keep edge cases small and deterministic.
- Cover resize, focus movement, match state, empty feed, and blank fill.

### Render/integration tests

- Use fixed width and stable sample entries.
- Compare representative visible output before and after the refactor.
- Verify that backend selection does not alter visible output.

### Manual verification

- Normal navigation should feel the same visually.
- Large terminal should no longer become disproportionately slower.
- Search mode, slash input, and `Enter` should remain functional.
- No flicker, stale rows, or cursor jumps.

### Perf verification

- Always measure both a smaller and larger terminal.
- Compare the same interaction sequence.
- Treat `bytes_written` and `paint_ms` as first-class metrics, not just total cycle time.

## Definition Of Done

- The feed pane no longer rewrites the whole visible feed for small logical deltas.
- Large-terminal performance is materially improved and passes the success criteria above.
- Visual output is unchanged.
- The renderer is covered by pure tests and representative render tests.
- The old giant-frame path is either removed or retained only behind a deliberate fallback switch with clear justification.

## Suggested Commit Sequence

1. `perf: add feed surface instrumentation`
2. `refactor: extract feed surface line model`
3. `test: add feed surface diff coverage`
4. `refactor: introduce feed surface backend boundary`
5. `feat: add incremental feed renderer`
6. `test: add feed renderer parity coverage`
7. `perf: switch feed to incremental renderer`
8. `chore: remove legacy full-frame feed path`
