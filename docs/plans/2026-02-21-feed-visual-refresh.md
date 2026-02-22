# Feed Visual Refresh Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Improve feed readability by dropping the RUN column, shortening TIME, adding ANSI color/inverse for focus and actor cues, and replacing `>` / `v` expand indicators with `▸` / `▾`.

**Architecture:** All changes are in the timeline formatting layer (`source/feed/timeline.ts`) and `source/utils/format.ts`. The `formatFeedLine` function currently outputs plain ASCII via `fit()`. We switch it to produce ANSI-styled strings via `chalk` + `fitAnsi()`. The column layout changes from `[PREFIX 4][TIME 8][RUN 6][OP 11][ACTOR 9][SUMMARY *][SUFFIX 2]` to `[TIME 6][OP 11][ACTOR 9][SUMMARY *][SUFFIX 2]`, giving SUMMARY ~13 extra chars. Focus is rendered via chalk inverse on the entire row. Search matches use accent-colored left bar.

**Tech Stack:** chalk (already a dependency), `fitAnsi()` from `source/utils/format.ts`, vitest

---

## Column Layout — Before & After

### Before (total fixed overhead: ~40 chars)

```
[PREFIX 4: "> * "][TIME 8: "HH:MM:SS"][SP][RUN 5: "R9bR3"][SP][OP 10: "tool.call "][SP][ACTOR 8: "AGENT   "][SP][SUMMARY ~84][SUFFIX 2: " >"]
```

- PREFIX: 4 chars — `> ` (focused) + `* ` (search match) or spaces
- TIME: 8 chars — `HH:MM:SS`
- RUN: 5 chars — `R9bR3`
- OP: 10 chars — `tool.call`, `perm.req`, etc.
- ACTOR: 8 chars — `AGENT`, `USER`, `SYSTEM`, `SA-a0...`
- SUMMARY: remaining (~84 chars, hardcoded max in `compactText`)
- SUFFIX: 2 chars — ` >`, ` v`, or `  `
- Separators (spaces between columns): 4 × 1 = 4

**Total fixed overhead = 4 + 8 + 1 + 5 + 1 + 10 + 1 + 8 + 1 + 2 = 41 chars**

### After (total fixed overhead: ~28 chars)

```
[TIME 5: "HH:MM"][SP][OP 10: "tool.call "][SP][ACTOR 8: "AGENT   "][SP][SUMMARY dynamic][SUFFIX 2: " ▸"]
```

- TIME: 5 chars — `HH:MM` (drop seconds)
- OP: 10 chars — unchanged
- ACTOR: 8 chars — unchanged
- SUMMARY: **dynamic** — fills remaining width (`width - 5 - 1 - 10 - 1 - 8 - 1 - 2 = width - 28`)
- SUFFIX: 2 chars — ` ▸` (collapsed expandable), ` ▾` (expanded), `  ` (non-expandable)

**Total fixed overhead = 5 + 1 + 10 + 1 + 8 + 1 + 2 = 28 chars**

**At 160 cols: summary gets 132 chars (was ~84 hardcoded). At 80 cols: summary gets 52 chars.**

### Removed

- **PREFIX** (`> * `): Focus indicated by inverse bg. Search match indicated by accent-colored `▌` replacing first char of TIME column.
- **RUN column**: Dropped entirely. Run ID available in detail view on Enter.

---

## Visual Encoding

### Focus cue

The focused row gets **full-width inverse** using `chalk.hex(theme.accent).inverse()`:

```
 08:55  tool.call  AGENT   Read source/app.tsx command="cat"          ▸    ← normal
 08:56  perm.req   AGENT   Bash rm -rf /tmp/test                     ▸    ← focused (inverse accent bg)
 08:56  perm.allow AGENT   Allowed                                         ← normal
```

### Search match cue

Matched rows get a `▌` (U+258C, left half block) in accent color prepended before the time:

```
▌08:55  tool.call  AGENT   Read source/app.tsx command="cat"          ▸
 08:55  tool.ok    AGENT   Read
▌08:56  tool.call  AGENT   Edit source/feed/timeline.ts old_string=…  ▸
```

The `▌` replaces the first space of the TIME column (TIME becomes 5 chars starting at position 1, `▌` occupies position 0).

### Actor color

Applied to the entire row text (not just the ACTOR column):

| `actor_id`   | chalk style                         | rationale                      |
| ------------ | ----------------------------------- | ------------------------------ |
| `agent:root` | `chalk.hex(theme.text)` (default)   | Most common, neutral           |
| `user`       | `chalk.hex(theme.userMessage.text)` | Distinct from agent            |
| `system`     | `chalk.hex(theme.textMuted)`        | De-emphasized lifecycle events |
| `subagent:*` | `chalk.hex(theme.accentSecondary)`  | Stand out as delegated work    |

### Error level

Events where `isEventError()` returns true get `chalk.hex(theme.status.error)` applied to the row, overriding actor color.

### Expand indicators

| State                 | Old  | New                   |
| --------------------- | ---- | --------------------- |
| Expandable, collapsed | ` >` | ` ▸` in accent color  |
| Expandable, expanded  | ` v` | ` ▾` in success color |
| Not expandable        | `  ` | `  ` (unchanged)      |

---

## Tasks

### Task 1: Shorten `formatClock` to `HH:MM`

**Files:**

- Modify: `source/utils/format.ts:44-50`
- Modify: `source/utils/format.test.ts` (existing tests for `formatClock`)

**Step 1: Update the failing test**

Find existing `formatClock` tests and update expected values from `HH:MM:SS` to `HH:MM`.

```ts
// Change expected from '09:05:30' to '09:05' (or whatever the existing test uses)
expect(formatClock(ts)).toBe('09:05');
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/utils/format.test.ts`
Expected: FAIL — output is `HH:MM:SS`, expected `HH:MM`.

**Step 3: Update `formatClock`**

```ts
export function formatClock(timestamp: number): string {
	const d = new Date(timestamp);
	const hh = String(d.getHours()).padStart(2, '0');
	const mm = String(d.getMinutes()).padStart(2, '0');
	return `${hh}:${mm}`;
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run source/utils/format.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add source/utils/format.ts source/utils/format.test.ts
git commit -m "refactor(feed): shorten formatClock to HH:MM"
```

---

### Task 2: Drop RUN column and PREFIX from `formatFeedLine`

**Files:**

- Modify: `source/feed/timeline.ts:279-303`
- Modify: `source/feed/timeline.test.ts` (existing tests)

**Step 1: Update tests**

Update `formatFeedLine` tests to expect the new column layout without PREFIX and RUN:

```ts
// Old: '> * 08:55:30 R9bR3 tool.call  AGENT    Read source/app.tsx                 >'
// New: '08:55 tool.call  AGENT    Read source/app.tsx                                ▸'
```

Update `formatFeedHeaderLine` tests:

```ts
// Old: 'TIME     RUN   OP         ACTOR    SUMMARY'
// New: 'TIME  OP         ACTOR    SUMMARY'
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run source/feed/timeline.test.ts`

**Step 3: Update `formatFeedLine` signature and body**

The function signature changes — `focused`, `expanded`, `matched` are still parameters but their rendering changes:

```ts
export function formatFeedLine(
	entry: TimelineEntry,
	width: number,
	focused: boolean,
	expanded: boolean,
	matched: boolean,
): string {
	const suffix = entry.expandable ? (expanded ? ' ▾' : ' ▸') : '  ';
	const time = fit(formatClock(entry.ts), 5);
	const op = fit(entry.op, 10);
	const actor = fit(entry.actor, 8);
	// Fixed columns: TIME(5) + SP + OP(10) + SP + ACTOR(8) + SP + SUFFIX(2) = 28
	const summaryWidth = Math.max(0, width - 28);
	const summary = fit(entry.summary, summaryWidth);
	const line = `${time} ${op} ${actor} ${summary}${suffix}`;
	return fit(line, width);
}
```

**Important:** `focused`, `expanded`, `matched` are still accepted as params here (for test compatibility and because the caller in `buildBodyLines` passes them), but visual styling (inverse, color) is NOT applied here — that happens in Task 4 when we add chalk. For now, these params only affect the `▸`/`▾` suffix logic.

**Step 4: Update `formatFeedHeaderLine`**

```ts
export function formatFeedHeaderLine(width: number): string {
	const time = fit('TIME', 5);
	const op = fit('OP', 10);
	const actor = fit('ACTOR', 8);
	const summaryWidth = Math.max(0, width - 28);
	const summaryLabel = fit('SUMMARY', summaryWidth);
	return `${time} ${op} ${actor} ${summaryLabel}  `;
}
```

**Step 5: Remove hardcoded 84-char max from `eventSummary`**

In `eventSummary()`, replace all `compactText(..., 84)` calls with a larger cap (e.g., 200) so truncation is handled by `formatFeedLine`'s dynamic `summaryWidth`, not by a hardcoded constant:

```ts
// Before:
return compactText(event.data.prompt, 84);
// After:
return compactText(event.data.prompt, 200);
```

Do this for ALL `compactText(..., 84)` calls in `eventSummary()`. The actual visible truncation is handled by `fit(entry.summary, summaryWidth)` in `formatFeedLine`.

**Step 6: Run tests**

Run: `npx vitest run source/feed/timeline.test.ts`
Expected: PASS

**Step 7: Commit**

```bash
git add source/feed/timeline.ts source/feed/timeline.test.ts
git commit -m "refactor(feed): drop RUN column and PREFIX, widen SUMMARY"
```

---

### Task 3: Add `styleFeedLine` with chalk coloring

**Files:**

- Create: `source/feed/feedLineStyle.ts`
- Create: `source/feed/feedLineStyle.test.ts`

This task adds ANSI styling as a separate layer on top of the plain-text `formatFeedLine` output.

**Step 1: Write the test**

```ts
import {describe, it, expect} from 'vitest';
import chalk from 'chalk';
import {styleFeedLine} from './feedLineStyle.js';
import {darkTheme} from '../theme/themes.js';

// Force chalk color output in tests
chalk.level = 3;

describe('styleFeedLine', () => {
	const baseLine = '08:55 tool.call  AGENT    Read source/app.tsx  ▸';

	it('applies inverse to focused row', () => {
		const result = styleFeedLine(baseLine, {
			focused: true,
			matched: false,
			actorId: 'agent:root',
			isError: false,
			theme: darkTheme,
		});
		// Inverse wraps the entire line
		expect(result).toContain('\x1b[7m'); // ANSI inverse code
	});

	it('applies muted color for system actor', () => {
		const result = styleFeedLine(baseLine, {
			focused: false,
			matched: false,
			actorId: 'system',
			isError: false,
			theme: darkTheme,
		});
		expect(result).toContain(darkTheme.textMuted.replace('#', ''));
	});

	it('applies error color for error events', () => {
		const result = styleFeedLine(baseLine, {
			focused: false,
			matched: false,
			actorId: 'agent:root',
			isError: true,
			theme: darkTheme,
		});
		expect(result).toContain(darkTheme.status.error.replace('#', ''));
	});

	it('prepends accent ▌ for search matches', () => {
		const result = styleFeedLine(baseLine, {
			focused: false,
			matched: true,
			actorId: 'agent:root',
			isError: false,
			theme: darkTheme,
		});
		expect(result).toContain('▌');
	});
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/feed/feedLineStyle.test.ts`
Expected: FAIL — module not found

**Step 3: Implement `feedLineStyle.ts`**

```ts
import chalk, {type ChalkInstance} from 'chalk';
import {type Theme} from '../theme/types.js';

export type FeedLineStyleOptions = {
	focused: boolean;
	matched: boolean;
	actorId: string;
	isError: boolean;
	theme: Theme;
};

function actorChalk(actorId: string, theme: Theme): ChalkInstance {
	if (actorId === 'system') return chalk.hex(theme.textMuted);
	if (actorId === 'user') return chalk.hex(theme.userMessage.text);
	if (actorId.startsWith('subagent:')) return chalk.hex(theme.accentSecondary);
	return chalk.hex(theme.text);
}

export function styleFeedLine(
	line: string,
	opts: FeedLineStyleOptions,
): string {
	const {focused, matched, actorId, isError, theme} = opts;

	// 1. Pick base color: error overrides actor color
	const base = isError
		? chalk.hex(theme.status.error)
		: actorChalk(actorId, theme);

	let styled = base(line);

	// 2. Focused: wrap entire line in inverse
	if (focused) {
		styled = chalk.hex(theme.accent).inverse(line);
	}

	// 3. Search match: replace leading space with accent ▌
	if (matched && !focused) {
		// Replace first character (space) with colored ▌
		styled = chalk.hex(theme.accent)('▌') + styled.slice(1);
	}

	return styled;
}
```

**Step 4: Run tests**

Run: `npx vitest run source/feed/feedLineStyle.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add source/feed/feedLineStyle.ts source/feed/feedLineStyle.test.ts
git commit -m "feat(feed): add styleFeedLine for ANSI row coloring"
```

---

### Task 4: Integrate `styleFeedLine` into `buildBodyLines`

**Files:**

- Modify: `source/utils/buildBodyLines.ts:200-225`
- Modify: `source/feed/timeline.ts` (update `toTimelineEntry` to include `actorId` and `isError`)

**Step 1: Add `actorId` and `isError` to `TimelineEntry`**

In `source/feed/timeline.ts`, add two fields to the `TimelineEntry` type:

```ts
export type TimelineEntry = {
	id: string;
	ts: number;
	runId?: string;
	op: string;
	actor: string;
	actorId: string; // ← NEW: raw actor_id for styling
	isError: boolean; // ← RENAME: was 'error', keep the field name as 'error' for backward compat
	summary: string;
	searchText: string;
	error: boolean;
	expandable: boolean;
	details: string;
	feedEvent?: FeedEvent;
};
```

Wait — `error` already exists as `boolean`. We can just use that. And we need `actorId`. Check where `TimelineEntry` is constructed (likely in `useFeed` or `app.tsx`) and add `actorId: event.actor_id` to the construction site.

**Step 2: Update `buildBodyLines` to apply styling**

In the feed rendering loop in `buildBodyLines`, after calling `formatFeedLine`, wrap with `styleFeedLine`:

```ts
import {styleFeedLine} from '../feed/feedLineStyle.js';

// Inside the feed rendering loop, replace:
//   bodyLines.push(formatFeedLine(entry, innerWidth, focused, expanded, matched));
// With:
const plain = formatFeedLine(entry, innerWidth, focused, expanded, matched);
const styled = styleFeedLine(plain, {
	focused: feedFocus === 'feed' && idx === feedCursor,
	matched: searchMatchSet.has(idx),
	actorId: entry.actorId ?? 'system',
	isError: entry.error,
	theme, // theme must be passed into buildBodyLines via options
});
bodyLines.push(fitAnsi(styled, innerWidth));
```

**Note:** `buildBodyLines` currently has no access to `theme`. Add `theme: Theme` to `BuildBodyLinesOptions` and pass it from `app.tsx`.

**Step 3: Update `formatFeedHeaderLine` to use muted color**

```ts
export function formatFeedHeaderLine(width: number, theme: Theme): string {
	const time = fit('TIME', 5);
	const op = fit('OP', 10);
	const actor = fit('ACTOR', 8);
	const summaryWidth = Math.max(0, width - 28);
	const summaryLabel = fit('SUMMARY', summaryWidth);
	const line = `${time} ${op} ${actor} ${summaryLabel}  `;
	return chalk.hex(theme.textMuted)(line);
}
```

**Step 4: Run all tests**

Run: `npx vitest run source/feed/ source/utils/buildBodyLines.test.ts`
Expected: PASS (some tests may need `theme` added to test fixtures)

**Step 5: Run lint + typecheck**

Run: `npm run lint && npx tsc --noEmit`

**Step 6: Commit**

```bash
git add source/feed/timeline.ts source/utils/buildBodyLines.ts source/feed/feedLineStyle.ts
git commit -m "feat(feed): integrate ANSI row styling into feed rendering"
```

---

### Task 5: Style the expand indicators `▸` / `▾`

**Files:**

- Modify: `source/feed/timeline.ts:279-295` (inside `formatFeedLine`)

Currently the suffix is plain text. We want `▸` in accent color and `▾` in success color. However, `formatFeedLine` currently returns plain ASCII via `fit()`. Since Task 4 applies styling externally, we have two options:

**Approach:** Apply suffix styling inside `styleFeedLine` instead. Modify `styleFeedLine` to detect and colorize the trailing `▸` or `▾`:

```ts
// Inside styleFeedLine, after base coloring but before inverse:
if (line.trimEnd().endsWith('▸')) {
	const idx = styled.lastIndexOf('▸');
	if (idx >= 0) {
		styled =
			styled.slice(0, idx) +
			chalk.hex(theme.accent)('▸') +
			styled.slice(idx + 1);
	}
}
if (line.trimEnd().endsWith('▾')) {
	const idx = styled.lastIndexOf('▾');
	if (idx >= 0) {
		styled =
			styled.slice(0, idx) +
			chalk.hex(theme.status.success)('▾') +
			styled.slice(idx + 1);
	}
}
```

**Note:** When the row is focused (inverse), the suffix color is overridden by the inverse anyway, which is fine — the glyph shape itself (`▸` vs `▾`) still communicates state.

**Test:** Add test cases in `feedLineStyle.test.ts` for suffix coloring.

**Commit:**

```bash
git add source/feed/feedLineStyle.ts source/feed/feedLineStyle.test.ts
git commit -m "feat(feed): color expand indicators ▸ accent, ▾ success"
```

---

### Task 6: Final integration test & visual verification

**Files:**

- All modified files

**Step 1: Run full test suite**

```bash
npm test
```

**Step 2: Run lint + typecheck**

```bash
npm run lint && npx tsc --noEmit
```

**Step 3: Build and verify visually**

```bash
npm run build && node dist/cli.js --help
```

If possible, trigger a real hook event flow and visually verify:

- Focus row has inverse accent background
- System events are muted
- Subagent events are purple-tinted
- Error events are red
- Search matches show `▌` left bar
- `▸` / `▾` indicators are colored
- SUMMARY column fills available width
- Header row shows `TIME  OP         ACTOR    SUMMARY`

**Step 4: Commit**

```bash
git add -A
git commit -m "chore(feed): fix any remaining lint/type issues from visual refresh"
```

---

## Migration Notes

- `formatFeedLine` still accepts `focused`, `matched`, `expanded` params for the `▸`/`▾` suffix logic, but visual focus/match styling is handled by `styleFeedLine` downstream.
- The `fit()` function is ASCII-only. Styled lines use `fitAnsi()` which handles ANSI escape codes correctly via `string-width` + `slice-ansi`.
- `compactText(..., 84)` hardcoded caps in `eventSummary()` are raised to 200 since `formatFeedLine` now truncates dynamically based on terminal width.
- The `entry.error` field on `TimelineEntry` already exists; `actorId` is the only new field needed.
