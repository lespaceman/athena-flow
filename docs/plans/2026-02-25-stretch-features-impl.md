# Stretch Features X1-X4 — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement four stretch UI features: context budget progress bar in the header, contextual input prompt, visible minute separators in the feed, and dim-prefix/bright-filename path styling.

**Architecture:** X1 replaces plain text in `renderHeaderLines.ts` with the existing `renderContextBar()`. X2 adds run-status awareness to `buildFrameLines.ts` placeholder. X3 emits a blank separator line in `buildBodyLines.ts` before minute-break entries. X4 adds a highlight range to `SummaryResult` so `feedLineStyle.ts` can brighten filenames within the dim region.

**Tech Stack:** TypeScript, vitest, chalk, Ink (React for CLIs)

**Mockup reference:** `docs/mockup.html` (AFTER section — lines 487-643)

---

### Task 1: Context budget progress bar (X1)

Replace plain text `Ctx: 0k / 200k` in the header with the visual `renderContextBar()` that already exists.

**Files:**

- Modify: `source/utils/renderHeaderLines.ts:26-33`
- Test: `source/utils/renderHeaderLines.test.ts` (if exists, otherwise `source/utils/contextBar.test.ts` already covers the bar)

**Step 1: Write failing test**

Find or create a test file for `renderHeaderLines`. Add:

```typescript
import {describe, it, expect} from 'vitest';
import {renderHeaderLines} from './renderHeaderLines.js';
import stripAnsi from 'strip-ansi';
import type {HeaderModel} from './headerModel.js';

const model: HeaderModel = {
	session_id: 'abc123',
	workflow: 'test-wf',
	harness: 'Claude Code',
	context: {used: 50000, max: 200000},
	status: 'idle',
	tail_mode: false,
};

describe('renderHeaderLines', () => {
	it('renders context bar with progress characters (X1)', () => {
		const [line] = renderHeaderLines(model, 120, true);
		const plain = stripAnsi(line);
		// Should contain "Context" label and token counts, NOT plain "Ctx:"
		expect(plain).toContain('Context');
		expect(plain).toContain('50k/200k');
		expect(plain).not.toContain('Ctx:');
	});

	it('renders context bar without color when hasColor is false', () => {
		const [line] = renderHeaderLines(model, 120, false);
		// ASCII bar uses brackets
		expect(line).toContain('[');
		expect(line).toContain('50k/200k');
	});
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/utils/renderHeaderLines.test.ts`
Expected: FAIL — currently renders `Ctx: 50k / 200k`

**Step 3: Replace plain text with renderContextBar**

In `source/utils/renderHeaderLines.ts`, add the import:

```typescript
import {renderContextBar} from './contextBar.js';
```

Replace lines 26-33 (the plain ctx text construction):

```typescript
// Context bar (visual progress)
const ctxBarWidth = 20;
const ctxText = renderContextBar(
	model.context.used,
	model.context.max,
	ctxBarWidth,
	hasColor,
);
```

The `ctxText` variable is already used in the tokens array (line 46), so no further changes needed.

**Step 4: Run test to verify it passes**

Run: `npx vitest run source/utils/renderHeaderLines.test.ts`
Expected: PASS

**Step 5: Run typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`

**Step 6: Commit**

```bash
git add source/utils/renderHeaderLines.ts source/utils/renderHeaderLines.test.ts
git commit -m "feat(header): replace plain Ctx text with visual progress bar (X1)"
```

---

### Task 2: Contextual input prompt (X2)

Make the input placeholder change based on whether a run has completed.

**Files:**

- Modify: `source/utils/buildFrameLines.ts:6-22` (FrameContext type) and `source/utils/buildFrameLines.ts:109-116` (placeholder logic)
- Modify: `source/app.tsx` (pass `lastRunStatus` through frame context)
- Test: `source/utils/buildFrameLines.test.ts` (if exists)

**Step 1: Write failing test**

Create or add to `source/utils/buildFrameLines.test.ts`:

```typescript
import {describe, it, expect} from 'vitest';
import {buildFrameLines, type FrameContext} from './buildFrameLines.js';

const baseCtx: FrameContext = {
	innerWidth: 80,
	focusMode: 'input',
	inputMode: 'normal',
	searchQuery: '',
	searchMatches: [],
	searchMatchPos: 0,
	expandedEntry: null,
	isClaudeRunning: false,
	inputValue: '',
	cursorOffset: 0,
	dialogActive: false,
	dialogType: '',
	lastRunStatus: null,
};

describe('buildFrameLines contextual prompt', () => {
	it('shows default prompt when no run has completed', () => {
		const {inputLines} = buildFrameLines(baseCtx);
		const line = inputLines.join('');
		expect(line).toContain('Type a prompt or :command');
	});

	it('shows contextual prompt after completed run (X2)', () => {
		const {inputLines} = buildFrameLines({
			...baseCtx,
			lastRunStatus: 'completed',
		});
		const line = inputLines.join('');
		expect(line).toContain('Run complete');
	});

	it('shows contextual prompt after failed run (X2)', () => {
		const {inputLines} = buildFrameLines({...baseCtx, lastRunStatus: 'failed'});
		const line = inputLines.join('');
		expect(line).toContain('Run failed');
	});
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/utils/buildFrameLines.test.ts`
Expected: FAIL — `lastRunStatus` not in type, placeholder always default

**Step 3: Add `lastRunStatus` to FrameContext**

In `source/utils/buildFrameLines.ts:6-22`, add to `FrameContext`:

```typescript
export type FrameContext = {
	innerWidth: number;
	focusMode: string;
	inputMode: string;
	searchQuery: string;
	searchMatches: number[];
	searchMatchPos: number;
	expandedEntry: TimelineEntry | null;
	isClaudeRunning: boolean;
	inputValue: string;
	cursorOffset: number;
	dialogActive: boolean;
	dialogType: string;
	accentColor?: string;
	hintsForced?: boolean | null;
	ascii?: boolean;
	/** Status of the most recent completed run, or null if no run has finished yet. */
	lastRunStatus?: 'completed' | 'failed' | 'aborted' | null;
};
```

**Step 4: Update placeholder derivation**

In `source/utils/buildFrameLines.ts:109-116`, replace:

```typescript
let inputPlaceholder: string;
if (ctx.inputMode === 'cmd') {
	inputPlaceholder = ':command';
} else if (ctx.inputMode === 'search') {
	inputPlaceholder = '/search';
} else {
	inputPlaceholder = 'Type a prompt or :command';
}
```

with:

```typescript
let inputPlaceholder: string;
if (ctx.inputMode === 'cmd') {
	inputPlaceholder = ':command';
} else if (ctx.inputMode === 'search') {
	inputPlaceholder = '/search';
} else if (ctx.lastRunStatus === 'completed') {
	inputPlaceholder = 'Run complete \u2014 type a follow-up or :retry';
} else if (ctx.lastRunStatus === 'failed' || ctx.lastRunStatus === 'aborted') {
	inputPlaceholder = 'Run failed \u2014 type a follow-up or :retry';
} else {
	inputPlaceholder = 'Type a prompt or :command';
}
```

**Step 5: Wire `lastRunStatus` from app.tsx**

In `source/app.tsx`, find where `buildFrameLines` is called (search for `buildFrameLines`). Add `lastRunStatus` derived from the header model or run summaries:

```typescript
// Derive last run status from runSummaries
const lastRunStatus = useMemo(() => {
	if (currentRun) return null; // still running
	const lastSummary = runSummaries[runSummaries.length - 1];
	if (!lastSummary) return null;
	if (lastSummary.status === 'SUCCEEDED') return 'completed' as const;
	if (lastSummary.status === 'FAILED') return 'failed' as const;
	if (lastSummary.status === 'CANCELLED') return 'aborted' as const;
	return null;
}, [currentRun, runSummaries]);
```

Pass it to the frame context:

```typescript
lastRunStatus,
```

Note: Find the exact location where `buildFrameLines` context object is assembled and add the field there.

**Step 6: Run tests to verify they pass**

Run: `npx vitest run source/utils/buildFrameLines.test.ts`
Expected: PASS

**Step 7: Run typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`

**Step 8: Commit**

```bash
git add source/utils/buildFrameLines.ts source/app.tsx source/utils/buildFrameLines.test.ts
git commit -m "feat(input): contextual placeholder based on run status (X2)"
```

---

### Task 3: Minute separators as blank line gaps (X3)

Emit an empty line before feed entries that cross a minute boundary, creating visible temporal separation.

**Files:**

- Modify: `source/utils/buildBodyLines.ts:259-275` (feed rendering loop)
- Test: `source/utils/buildBodyLines.test.ts` (if testable, otherwise integration)

**Step 1: Write failing test**

If `buildBodyLines` is testable in isolation (it takes a large context object), write a focused test. Otherwise, test indirectly. A pragmatic approach: test `buildBodyLines` output length when a minute break occurs vs when it doesn't.

If no test file exists, create a minimal one or verify via the `feedLineStyle.test.ts` or manual run. For TDD compliance, at minimum:

```typescript
// Verify that isMinuteBreak === true produces one more line than normal
// This can be validated after implementation via the full test suite
```

**Step 2: Add blank line emission**

In `source/utils/buildBodyLines.ts`, in the feed rendering loop (around line 259-275), after computing `isMinuteBreak` (line 270-274), add a blank line emission before the entry:

```typescript
				prevMinute = entryMinute;

				// X3: Visible minute separator — blank line gap
				if (isMinuteBreak && bodyLines.length < bodyHeight - 1) {
					bodyLines.push(fitAnsi('', innerWidth));
				}

				const isDuplicateActor =
```

The `bodyLines.length < bodyHeight - 1` guard ensures we don't push past the body height limit. The blank line counts against `feedContentRows` naturally since the for-loop index continues.

**Important:** The for-loop iterates `feedContentRows` times, so adding a blank line means one fewer entry is visible. This is the intended trade-off. No adjustment to the loop counter is needed — the blank line fills one `bodyLines` slot, and the `clippedBodyLines` slice at the end (line 311) handles overflow.

**Step 3: Run full test suite**

Run: `npx vitest run source/`
Expected: PASS

**Step 4: Run typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`

**Step 5: Commit**

```bash
git add source/utils/buildBodyLines.ts
git commit -m "feat(feed): add blank line gap as minute separator (X3)"
```

---

### Task 4: Multi-segment path styling — data layer (X4 part 1)

Change `shortenPath` to return structured data, add highlight range to `SummaryResult`, and wire through `TimelineEntry`.

**Files:**

- Modify: `source/utils/format.ts:104-108` (shortenPath return type)
- Modify: `source/feed/timeline.ts:222-248` (formatToolSummary, SummaryResult, TimelineEntry)
- Test: `source/utils/format.test.ts`
- Test: `source/feed/timeline.test.ts`

**Step 1: Write failing test for structured shortenPath**

In `source/utils/format.test.ts`:

```typescript
import {shortenPathStructured} from './format.js';

describe('shortenPathStructured', () => {
	it('returns prefix and filename for long paths', () => {
		const result = shortenPathStructured(
			'/home/user/projects/athena/source/feed/timeline.ts',
		);
		expect(result.prefix).toBe('…/feed/');
		expect(result.filename).toBe('timeline.ts');
	});

	it('returns empty prefix for short paths', () => {
		const result = shortenPathStructured('timeline.ts');
		expect(result.prefix).toBe('');
		expect(result.filename).toBe('timeline.ts');
	});

	it('returns prefix and filename for 2-segment paths', () => {
		const result = shortenPathStructured('/home/file.ts');
		expect(result.prefix).toBe('home/');
		expect(result.filename).toBe('file.ts');
	});

	it('handles 3-segment paths with …/ prefix', () => {
		const result = shortenPathStructured('/a/b/c.ts');
		expect(result.prefix).toBe('…/b/');
		expect(result.filename).toBe('c.ts');
	});
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/utils/format.test.ts`
Expected: FAIL — `shortenPathStructured` not exported

**Step 3: Implement `shortenPathStructured`**

In `source/utils/format.ts`, add after `shortenPath` (line 108):

```typescript
export type StructuredPath = {prefix: string; filename: string};

export function shortenPathStructured(filePath: string): StructuredPath {
	const segments = filePath.split('/').filter(Boolean);
	if (segments.length === 0) return {prefix: '', filename: filePath};
	const filename = segments[segments.length - 1]!;
	if (segments.length === 1) return {prefix: '', filename};
	if (segments.length === 2) return {prefix: segments[0] + '/', filename};
	return {prefix: '…/' + segments[segments.length - 2] + '/', filename};
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run source/utils/format.test.ts`
Expected: PASS

**Step 5: Update SummaryResult and TimelineEntry types**

In `source/feed/timeline.ts:240-247`, add highlight fields to `SummaryResult`:

```typescript
export type SummaryResult = {
	text: string;
	dimStart?: number;
	outcome?: string;
	outcomeZero?: boolean;
	/** Char offset within summary where a bright filename starts (within dim region). */
	highlightStart?: number;
	/** Char offset where bright filename ends. */
	highlightEnd?: number;
};
```

In `source/feed/timeline.ts:18-38` (`TimelineEntry`), add:

```typescript
	summaryHighlightStart?: number;
	summaryHighlightEnd?: number;
```

**Step 6: Update path-based extractors to use structured paths**

In `source/utils/format.ts`, update the file path extractors to return the structured form's combined text, and also export a helper that returns the highlight offset:

```typescript
export type PathInputResult = {
	text: string;
	/** Char offset within text where filename starts. */
	filenameStart: number;
};

export function shortenPathWithHighlight(filePath: string): PathInputResult {
	const {prefix, filename} = shortenPathStructured(filePath);
	return {text: prefix + filename, filenameStart: prefix.length};
}
```

Update `filePathExtractor` (line 110-111):

```typescript
const filePathExtractor = (input: Record<string, unknown>): string =>
	shortenPath(String(input.file_path ?? ''));
```

Keep `filePathExtractor` returning a plain string for backward compatibility. We'll use the structured version in `formatToolSummary`.

**Step 7: Update `formatToolSummary` to compute highlight range**

In `source/feed/timeline.ts:224-238`, update `formatToolSummary` to detect path-based tools and compute highlight offsets:

```typescript
import {shortenPathWithHighlight} from '../utils/format.js';

const PATH_TOOLS = new Set(['Read', 'Write', 'Edit', 'Glob', 'Grep']);

function formatToolSummary(
	toolName: string,
	toolInput: Record<string, unknown>,
	errorSuffix?: string,
): ToolSummaryResult & {highlightStart?: number; highlightEnd?: number} {
	const parsed = parseToolName(toolName);
	const verb = resolveVerb(toolName, parsed);
	const primaryInput = summarizeToolPrimaryInput(toolName, toolInput);
	const secondary = [primaryInput, errorSuffix].filter(Boolean).join(' ');
	if (!secondary) {
		return {text: compactText(verb, 200)};
	}
	const full = `${verb} ${secondary}`;
	const dimStart = verb.length + 1;

	// Compute highlight range for path-based tools
	let highlightStart: number | undefined;
	let highlightEnd: number | undefined;
	const baseName = parsed.isMcp ? toolName : toolName;
	const filePath = toolInput.file_path ?? toolInput.pattern ?? toolInput.path;
	if (PATH_TOOLS.has(baseName) && typeof filePath === 'string') {
		const ph = shortenPathWithHighlight(filePath);
		// The path starts at dimStart in the full string
		highlightStart = dimStart + ph.filenameStart;
		highlightEnd = dimStart + ph.text.length;
	}

	return {
		text: compactText(full, 200),
		dimStart,
		highlightStart,
		highlightEnd,
	};
}
```

**Step 8: Wire highlight through eventSummary and mergedEventSummary**

In `eventSummary` (line 249-273), for tool.pre cases, propagate highlight fields from `formatToolSummary`:

```typescript
case 'tool.pre':
case 'tool.post':
case 'permission.request': {
	const result = formatToolSummary(event.data.tool_name, event.data.tool_input);
	return {
		text: result.text,
		dimStart: result.dimStart,
		highlightStart: result.highlightStart,
		highlightEnd: result.highlightEnd,
	};
}
```

In `mergedEventSummary` (line 533-577), propagate highlight from the pre-event's summary:

```typescript
// After computing prefix (line 566)
const preSummary = formatToolSummary(toolName, toolInput);

// In the return with outcome (line 571-576):
return {
	text: compactText(prefix, 200),
	dimStart: name.length,
	outcome: resultText,
	outcomeZero: isZero,
	highlightStart: preSummary.highlightStart,
	highlightEnd: preSummary.highlightEnd,
};
```

**Step 9: Wire highlight through useTimeline.ts**

In `source/hooks/useTimeline.ts:131-149`, add to the `entries.push()`:

```typescript
summaryHighlightStart: summaryResult.highlightStart,
summaryHighlightEnd: summaryResult.highlightEnd,
```

**Step 10: Run tests**

Run: `npx vitest run source/utils/format.test.ts source/feed/timeline.test.ts`
Expected: PASS

**Step 11: Run typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`

**Step 12: Commit**

```bash
git add source/utils/format.ts source/utils/format.test.ts source/feed/timeline.ts source/hooks/useTimeline.ts
git commit -m "feat(feed): structured path data with highlight ranges for X4"
```

---

### Task 5: Multi-segment path styling — rendering layer (X4 part 2)

Apply bright filename styling within the dim summary region using the highlight range.

**Files:**

- Modify: `source/feed/feedLineStyle.ts:23-41` (FeedLineStyleOptions — add highlight fields)
- Modify: `source/feed/feedLineStyle.ts:152-172` (summary segment styling — split at highlight)
- Modify: `source/utils/buildBodyLines.ts:291-304` (pass highlight fields to styleFeedLine)
- Test: `source/feed/feedLineStyle.test.ts`

**Step 1: Write failing test**

Add to `source/feed/feedLineStyle.test.ts` (create if needed — check `source/feed/` for existing test):

```typescript
it('brightens filename within dim summary region (X4)', () => {
	// Construct a line where summary starts at col 30 (FEED_SUMMARY_COL_START)
	// Verb "Read" at 30-34, then dim path "…/feed/" at 35-41, bright "timeline.ts" at 42-53
	const line =
		' 08:55 Tool OK       AGENT      Read …/feed/timeline.ts                 ?';
	const result = styleFeedLine(line, {
		focused: false,
		matched: false,
		actorId: 'agent:root',
		isError: false,
		theme: darkTheme,
		opTag: 'tool.ok',
		summaryDimStart: 5, // after "Read "
		summaryHighlightStart: 12, // "…/feed/" is 7 chars, filename starts at 5+7=12
		summaryHighlightEnd: 23, // "timeline.ts" is 11 chars
	});
	// The bright filename portion should use text color (#cdd6f4 → 205;214;244)
	// within a region that's otherwise dim
	expect(result).toContain('38;2;205;214;244');
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/feed/feedLineStyle.test.ts`
Expected: FAIL — `summaryHighlightStart` not in type

**Step 3: Add highlight fields to FeedLineStyleOptions**

In `source/feed/feedLineStyle.ts:23-41`:

```typescript
export type FeedLineStyleOptions = {
	focused: boolean;
	matched: boolean;
	actorId: string;
	isError: boolean;
	theme: Theme;
	ascii?: boolean;
	opTag?: string;
	summaryDimStart?: number;
	outcomeZero?: boolean;
	categoryBreak?: boolean;
	duplicateActor?: boolean;
	minuteBreak?: boolean;
	/** Char offset within summary where bright filename starts (relative to summary start). */
	summaryHighlightStart?: number;
	/** Char offset within summary where bright filename ends. */
	summaryHighlightEnd?: number;
};
```

**Step 4: Split dim region at highlight range**

In `source/feed/feedLineStyle.ts:152-172`, replace the dim region rendering. Where it currently has:

```typescript
if (effectiveDim !== undefined) {
	if (effectiveDim > summaryStart) {
		segments.push({start: summaryStart, end: effectiveDim, style: base});
	}
	const dimStyle = opts.outcomeZero
		? chalk.hex(theme.status.warning)
		: chalk.hex(theme.textMuted);
	segments.push({start: effectiveDim, end: afterEventEnd, style: dimStyle});
}
```

Replace with:

```typescript
if (effectiveDim !== undefined) {
	if (effectiveDim > summaryStart) {
		segments.push({start: summaryStart, end: effectiveDim, style: summaryBase});
	}
	const dimStyle = opts.outcomeZero
		? chalk.hex(theme.status.warning)
		: chalk.hex(theme.textMuted);

	// X4: Split dim region at highlight range (bright filename)
	const hlStart =
		opts.summaryHighlightStart !== undefined
			? FEED_SUMMARY_COL_START + opts.summaryHighlightStart
			: undefined;
	const hlEnd =
		opts.summaryHighlightEnd !== undefined
			? FEED_SUMMARY_COL_START + opts.summaryHighlightEnd
			: undefined;

	if (
		hlStart !== undefined &&
		hlEnd !== undefined &&
		hlStart >= effectiveDim &&
		hlEnd <= afterEventEnd &&
		hlStart < hlEnd
	) {
		// dim before highlight
		if (hlStart > effectiveDim) {
			segments.push({start: effectiveDim, end: hlStart, style: dimStyle});
		}
		// bright highlight (filename)
		segments.push({
			start: hlStart,
			end: hlEnd,
			style: chalk.hex(theme.text),
		});
		// dim after highlight
		if (hlEnd < afterEventEnd) {
			segments.push({start: hlEnd, end: afterEventEnd, style: dimStyle});
		}
	} else {
		// No valid highlight — render entire dim region normally
		segments.push({start: effectiveDim, end: afterEventEnd, style: dimStyle});
	}
} else if (summaryStart < afterEventEnd) {
	segments.push({start: summaryStart, end: afterEventEnd, style: summaryBase});
}
```

Note: `summaryBase` is from the Tier A fix (Task 1 of the visual gaps plan). If that hasn't landed yet, use `rowBase` or `base` depending on what exists.

**Step 5: Pass highlight fields through buildBodyLines**

In `source/utils/buildBodyLines.ts:291-304`, add to the `styleFeedLine` options:

```typescript
const styled = styleFeedLine(plain, {
	focused: isFocused,
	matched: isMatched,
	actorId: entry.actorId,
	isError: entry.error,
	theme,
	ascii: todo.ascii,
	opTag: entry.opTag,
	summaryDimStart: entry.summaryDimStart,
	outcomeZero: entry.summaryOutcomeZero,
	categoryBreak: isBreak,
	duplicateActor: isDuplicateActor,
	minuteBreak: isMinuteBreak,
	summaryHighlightStart: entry.summaryHighlightStart,
	summaryHighlightEnd: entry.summaryHighlightEnd,
});
```

**Step 6: Run tests**

Run: `npx vitest run source/feed/feedLineStyle.test.ts`
Expected: PASS

**Step 7: Run typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`

**Step 8: Commit**

```bash
git add source/feed/feedLineStyle.ts source/utils/buildBodyLines.ts source/feed/feedLineStyle.test.ts
git commit -m "feat(feed): bright filename within dim path region (X4)"
```

---

### Task 6: Final integration — lint, typecheck, full test suite

**Files:** None (verification only)

**Step 1: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 2: Run lint**

Run: `npm run lint`
Expected: PASS

**Step 3: Run full test suite**

Run: `npx vitest run source/`
Expected: All PASS

**Step 4: Fix any failures**

Common issues:

- `renderHeaderLines` test baselines checking for `Ctx:` need updating to `Context`
- `buildFrameLines` test baselines checking for old placeholder text
- `TimelineEntry` construction sites missing `summaryHighlightStart`/`summaryHighlightEnd` — add as `undefined`

**Step 5: Final commit (if fixes needed)**

```bash
git add -A
git commit -m "fix: resolve lint/type/test issues from stretch features X1-X4"
```

---

### Summary of Changes

| File                                | Change                                                                                   |
| ----------------------------------- | ---------------------------------------------------------------------------------------- |
| `source/utils/renderHeaderLines.ts` | Replace plain `Ctx:` text with `renderContextBar()` call                                 |
| `source/utils/buildFrameLines.ts`   | Add `lastRunStatus` to `FrameContext`, contextual placeholder                            |
| `source/app.tsx`                    | Derive and pass `lastRunStatus` to frame context                                         |
| `source/utils/buildBodyLines.ts`    | Emit blank line before minute-break entries; pass highlight fields                       |
| `source/utils/format.ts`            | Add `shortenPathStructured()`, `shortenPathWithHighlight()`                              |
| `source/feed/timeline.ts`           | Add highlight fields to `SummaryResult`, `TimelineEntry`; compute in `formatToolSummary` |
| `source/hooks/useTimeline.ts`       | Wire highlight fields through to `TimelineEntry`                                         |
| `source/feed/feedLineStyle.ts`      | Add highlight fields to options; split dim region at highlight range                     |
| Various test files                  | Tests for each feature                                                                   |
