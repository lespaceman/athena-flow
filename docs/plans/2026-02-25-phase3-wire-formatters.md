# Phase 3: Wire Cell Formatters into TUI

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the two-pass `formatFeedLine() → styleFeedLine()` rendering pipeline with direct calls to Phase 2 cell formatters, then delete all old-path code.

**Architecture:** The feed section of `buildBodyLines()` currently calls `formatFeedLine()` (plain layout) then `styleFeedLine()` (position-based ANSI painting). Phase 3 replaces both with per-cell formatter calls from `cellFormatters.ts` — each cell is styled at creation time, so no second pass is needed. The assembled line is `gutter + time + ' ' + event + ' ' + actor + ' ' + tool + ' ' + detail + suffix`.

**Gutter simplification:** The gutter column is now a conditional 1-char column: `|` when focused, space otherwise. Minute breaks (`─`), category breaks (`·`), and user borders are all dropped. Minute boundaries are instead rendered as blank separator lines inserted between minute groups in `bodyLines`.

**TOOL column:** A new dynamic-width column between ACTOR and DETAILS shows tool names / sub-agent types. Width is `clamp(max(toolName.length across visible entries), 10, 16)` — column-aligned so all rows share the same tool width per render.

**Tech Stack:** TypeScript, chalk, vitest, Ink (unchanged — no component changes)

---

### Task 1: Replace feed line rendering in buildBodyLines

**Files:**

- Modify: `source/utils/buildBodyLines.ts:254-320` (feed rendering loop)

**Step 1: Write a failing test that verifies new formatter integration**

Add to `source/utils/buildBodyLines.test.ts`:

```typescript
it('renders feed lines with styled cell formatters (no styleFeedLine)', () => {
	const prev = chalk.level;
	chalk.level = 3;
	try {
		const entries: TimelineEntry[] = [
			{
				...makeEntry(
					'x1',
					new Date('2026-01-15T10:30:00').getTime(),
					'tool.ok',
				),
				op: 'Tool OK',
				actor: 'AGENT',
				actorId: 'agent:root',
				toolColumn: 'Read',
				summary: 'Read file.ts',
				summarySegments: [{text: 'Read file.ts', role: 'plain'}],
				expandable: true,
				duplicateActor: false,
			},
		];
		const result = buildFeedOnly(entries, 3);
		const feedLine = result[1]!; // index 0 is header

		// Verify content present
		const plain = stripAnsi(feedLine);
		expect(plain).toContain('10:30');
		expect(plain).toContain('Tool OK');
		expect(plain).toContain('AGENT');
		expect(plain).toContain('Read'); // TOOL column
		expect(plain).toContain('Read file.ts');

		// Verify ANSI styling is applied (not plain text)
		expect(feedLine).not.toBe(plain);
		// Verify exact width
		expect(plain.length).toBe(80);
	} finally {
		chalk.level = prev;
	}
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/utils/buildBodyLines.test.ts -v`
Expected: PASS (old path also produces styled output — this test validates the contract, not the mechanism). If it passes already, that's fine — it's a regression guard for the swap.

**Step 3: Replace the formatFeedLine + styleFeedLine call site**

In `buildBodyLines.ts`, replace the import block and feed rendering loop (lines ~297-320):

**Old imports to remove:**

```typescript
import {formatFeedLine, formatFeedHeaderLine} from '../feed/timeline.js';
import {styleFeedLine} from '../feed/feedLineStyle.js';
```

**New imports to add:**

```typescript
import {
	formatTime,
	formatEvent,
	formatActor,
	formatTool,
	formatDetails,
	formatSuffix,
} from '../feed/cellFormatters.js';
```

**Before the feed rendering loop, compute shared `toolWidth`:**

```typescript
// Column-aligned: all rows share the same tool column width per render
const FIXED = 33; // 1 gutter + 5 time + 1 + 12 event + 1 + 10 actor + 1 + 2 suffix
const toolWidth = Math.min(
	16,
	Math.max(10, ...visibleEntries.map(e => (e.toolColumn ?? '').length)),
);
const detailsWidth = Math.max(0, innerWidth - FIXED - toolWidth - 1);

// Track minute boundaries for blank separator lines
let prevMinute = -1;
```

**Replace the feed line rendering (lines ~291-320) with:**

```typescript
const isDuplicateActor = entry.duplicateActor;
const isFocused = feedFocus === 'feed' && idx === feedCursor;
const isExpanded = expandedId === entry.id;

// Minute break: insert blank separator line between minute groups
const entryMinute = new Date(entry.ts).getMinutes();
if (prevMinute !== -1 && entryMinute !== prevMinute) {
	bodyLines.push('');
}
prevMinute = entryMinute;

// Gutter: | when focused, space otherwise
const gutter = isFocused ? chalk.hex(theme.accent)('|') : ' ';

const time = formatTime(entry.ts, 5, theme);
const event = formatEvent(entry.op, 12, theme, entry.opTag);
const actor = formatActor(
	entry.actor,
	isDuplicateActor,
	10,
	theme,
	entry.actorId,
);
const tool = formatTool(entry.toolColumn ?? '', toolWidth, theme);
const detail = formatDetails({
	segments: entry.summarySegments,
	summary: entry.summary,
	outcome: entry.summaryOutcome,
	outcomeZero: entry.summaryOutcomeZero,
	mode: 'full',
	contentWidth: detailsWidth,
	theme,
	opTag: entry.opTag,
	isError: entry.error,
});
const suffix = formatSuffix(entry.expandable, isExpanded, todo.ascii, theme);

let line = `${gutter}${time} ${event} ${actor} ${tool} ${detail}${suffix}`;

// Focused row: override all cell colors with bright text (gutter keeps its own style)
if (isFocused) {
	const gutterStr = gutter; // already styled
	const body = stripAnsi(line.slice(1)); // strip inner ANSI, keep plain text
	line = gutterStr + chalk.hex(theme.text)(body);
}

bodyLines.push(fitAnsi(line, innerWidth));
```

**Step 4: Replace the header line rendering**

Replace the `formatFeedHeaderLine` call (line ~248) with inline cell-formatter-style code:

```typescript
if (feedHeaderRows > 0) {
	const headerText = fitImpl(
		` ${fitImpl('TIME', 5)} ${fitImpl('EVENT', 12)} ${fitImpl('ACTOR', 10)} ${fitImpl('TOOL', toolWidth)} ${fitImpl('DETAILS', Math.max(0, detailsWidth))}  `,
		innerWidth,
	);
	bodyLines.push(
		fitAnsi(chalk.bold.hex(theme.textMuted)(headerText), innerWidth),
	);
}
```

Import `fit as fitImpl` from `'../utils/format.js'` (already imported).

**Step 5: Remove the `isDuplicateActor` local computation**

The old code computed `isDuplicateActor` inline (line ~291). Now we use `entry.duplicateActor` (pre-computed in Phase 2). Delete the old computation:

```typescript
// DELETE these lines:
const isDuplicateActor =
	entryOffset > 0 && !isBreak && prevActorId === entry.actorId;
prevActorId = entry.actorId;
```

Also delete the `prevActorId` variable declaration (line ~263).

**Step 6: Run tests**

Run: `npx vitest run source/utils/buildBodyLines.test.ts -v`
Expected: All PASS

**Step 7: Run lint + typecheck**

Run: `npm run lint && npx tsc --noEmit`
Expected: Clean

**Step 8: Commit**

```bash
git add source/utils/buildBodyLines.ts source/utils/buildBodyLines.test.ts
git commit -m "feat(feed): wire cell formatters into buildBodyLines, replacing two-pass rendering"
```

---

### Task 2: Delete old-path code

**Files:**

- Delete: `source/feed/feedLineStyle.ts`
- Delete: `source/feed/feedLineStyle.test.ts`
- Delete: `source/feed/cellFormatters.verify.test.ts`
- Modify: `source/feed/timeline.ts` — remove `formatFeedLine`, `formatFeedHeaderLine`, column constants, and old aliases

**Step 1: Delete feedLineStyle.ts and its test**

```bash
rm source/feed/feedLineStyle.ts source/feed/feedLineStyle.test.ts
```

**Step 2: Delete the side-by-side verify tests**

```bash
rm source/feed/cellFormatters.verify.test.ts
```

**Step 3: Remove old functions and constants from timeline.ts**

Delete from `source/feed/timeline.ts`:

- `formatFeedLine()` function (lines ~674-750)
- `formatFeedHeaderLine()` function (lines ~752-759)
- Column position constants: `FEED_GUTTER_WIDTH`, `FEED_EVENT_COL_START`, `FEED_EVENT_COL_END`, `FEED_ACTOR_COL_START`, `FEED_ACTOR_COL_END`, `FEED_SUMMARY_COL_START`, `FEED_OP_COL_START`, `FEED_OP_COL_END` (lines ~650-660)
- `ResolvedSegment` type (line ~663-667)
- `FormatFeedLineResult` type (lines ~669-672)
- Helper imports used only by these functions (e.g., `feedGlyphs` if only used here — check first)

**Step 4: Remove old tests from timeline.test.ts**

Delete from `source/feed/timeline.test.ts`:

- `describe('formatFeedLine', ...)` block (lines ~1069-1141)
- `describe('formatFeedHeaderLine', ...)` block (lines ~1143-1157)
- Remove `formatFeedLine` and `formatFeedHeaderLine` from the import statement

**Step 5: Fix any remaining imports**

Search for any other files importing deleted symbols:

- `feedLineStyle.js` / `styleFeedLine`
- `formatFeedLine` / `formatFeedHeaderLine` from `timeline.js`
- `FEED_EVENT_COL_START` / `FEED_OP_COL_START` etc.
- `ResolvedSegment`

These should only be in files already modified. If any are found elsewhere, update those imports.

**Step 6: Run full test suite**

Run: `npx vitest run source/ -v`
Expected: All PASS (test count will decrease by ~20 from deleted test files)

**Step 7: Run lint + typecheck**

Run: `npm run lint && npx tsc --noEmit`
Expected: Clean

**Step 8: Commit**

```bash
git add -A
git commit -m "refactor(feed): delete old two-pass formatFeedLine/styleFeedLine pipeline"
```

---

### Task 3: Verify visual output and clean up

**Step 1: Run the full test suite one more time**

Run: `npm test`
Expected: All PASS

**Step 2: Build the project**

Run: `npm run build`
Expected: Clean build, no errors

**Step 3: Verify no dead exports remain**

Search for any remaining references to deleted symbols:

```bash
grep -r 'formatFeedLine\|styleFeedLine\|FEED_EVENT_COL\|FEED_OP_COL\|ResolvedSegment\|feedLineStyle' source/
```

Expected: No matches (only cellFormatters.ts and its tests should remain)

**Step 4: Commit if any cleanup was needed**

```bash
git add -A
git commit -m "chore: clean up stale references after Phase 3 wiring"
```

---

## Summary of Changes

| File                                        | Action                                                                                              |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `source/utils/buildBodyLines.ts`            | Replace formatFeedLine+styleFeedLine with cell formatter calls; add TOOL column with `formatTool()` |
| `source/utils/buildBodyLines.test.ts`       | Add regression test for styled cell output                                                          |
| `source/feed/feedLineStyle.ts`              | DELETE                                                                                              |
| `source/feed/feedLineStyle.test.ts`         | DELETE                                                                                              |
| `source/feed/cellFormatters.verify.test.ts` | DELETE                                                                                              |
| `source/feed/timeline.ts`                   | Remove formatFeedLine, formatFeedHeaderLine, column constants                                       |
| `source/feed/timeline.test.ts`              | Remove tests for deleted functions                                                                  |

## Key Design Decisions

1. **Focused rows**: Strip ANSI from body, re-apply `theme.text` — avoids nested color issues
2. **Gutter simplified**: 1-char column — `|` when focused, space otherwise. No minute break chars, category breaks, or user borders in gutter
3. **Minute breaks as blank lines**: Blank separator line inserted into `bodyLines` when minute changes between consecutive entries. Cleaner than gutter glyphs
4. **`duplicateActor`**: Uses pre-computed `entry.duplicateActor` from Phase 2
5. **Header line**: Inlined directly (not worth a separate formatter function)
6. **No grid abstraction**: Direct string concatenation — simplest approach for current needs
7. **TOOL column width**: Column-aligned via `clamp(max(toolName.length), 10, 16)` computed once before the loop; all rows share the same width per render
8. **TOOL + DETAILS split**: `detailsWidth = innerWidth - 33 - toolWidth - 1` (1 gap between TOOL and DETAILS)
