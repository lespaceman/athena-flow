# Header Field Expansion Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add context bar, full session ID, workflow name, harness, and run count to the 2-line header.

**Architecture:** Modify `HeaderModel` type and `buildHeaderModel()` to include new fields, create a pure `renderContextBar()` function, and update `renderHeaderLines()` to use the new layout with revised truncation priorities. All changes are in `source/utils/`.

**Tech Stack:** TypeScript, vitest, chalk (for color), string-width (for ANSI-aware measurement)

**Design doc:** `docs/plans/2026-02-20-header-fields-design.md`

---

### Task 1: Add `renderContextBar` pure function

**Files:**
- Create: `source/utils/contextBar.ts`
- Create: `source/utils/contextBar.test.ts`

**Step 1: Write the failing tests**

```typescript
// source/utils/contextBar.test.ts
import {describe, it, expect} from 'vitest';
import stripAnsi from 'strip-ansi';
import {renderContextBar, formatTokenCount} from './contextBar.js';

describe('formatTokenCount', () => {
	it('formats thousands as k', () => {
		expect(formatTokenCount(67000)).toBe('67k');
		expect(formatTokenCount(200000)).toBe('200k');
		expect(formatTokenCount(1500)).toBe('1.5k');
	});

	it('returns dash for null', () => {
		expect(formatTokenCount(null)).toBe('–');
	});

	it('formats sub-1000 as-is', () => {
		expect(formatTokenCount(500)).toBe('500');
	});
});

describe('renderContextBar', () => {
	it('renders filled bar proportionally', () => {
		const result = renderContextBar(100000, 200000, 24, false);
		// "ctx [=====-----] 100k/200k" — 50% filled
		expect(result).toContain('ctx');
		expect(result).toContain('100k/200k');
	});

	it('renders empty bar when used is null', () => {
		const result = renderContextBar(null, 200000, 24, false);
		expect(result).toContain('–/200k');
	});

	it('renders color bar with correct thresholds', () => {
		// < 50% = green
		const green = renderContextBar(50000, 200000, 30, true);
		expect(green).not.toBe(stripAnsi(green)); // has ANSI codes

		// > 80% = red
		const red = renderContextBar(180000, 200000, 30, true);
		expect(red).not.toBe(stripAnsi(red));
	});

	it('NO_COLOR uses brackets and equals/dashes', () => {
		const result = renderContextBar(100000, 200000, 30, false);
		expect(result).toMatch(/\[=+\-*\]/);
	});

	it('respects minimum bar width of 6', () => {
		// Even at narrow width, bar portion should be at least 6
		const result = renderContextBar(100000, 200000, 20, false);
		expect(result).toContain('ctx');
	});

	it('clamps to 100% when used > max', () => {
		const result = renderContextBar(250000, 200000, 30, false);
		// Should not overflow — bar is fully filled
		expect(result).toContain('250k/200k');
	});
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/utils/contextBar.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```typescript
// source/utils/contextBar.ts
import chalk from 'chalk';

export function formatTokenCount(value: number | null): string {
	if (value === null) return '–';
	if (value < 1000) return String(value);
	const k = value / 1000;
	if (Number.isInteger(k)) return `${k}k`;
	return `${parseFloat(k.toFixed(1))}k`;
}

export function renderContextBar(
	used: number | null,
	max: number,
	width: number,
	hasColor: boolean,
): string {
	const usedStr = formatTokenCount(used);
	const maxStr = formatTokenCount(max);
	const label = `ctx `;
	const numbers = ` ${usedStr}/${maxStr}`;

	// Bar width = total width - label - numbers - bracket chars (2 for NO_COLOR)
	const bracketOverhead = hasColor ? 0 : 2; // [ and ]
	const barWidth = Math.max(6, width - label.length - numbers.length - bracketOverhead);

	const ratio = used !== null ? Math.min(1, Math.max(0, used / max)) : 0;
	const filled = Math.round(ratio * barWidth);
	const empty = barWidth - filled;

	let bar: string;
	if (hasColor) {
		const filledChar = '█';
		const emptyChar = '░';
		const filledStr = filledChar.repeat(filled);
		const emptyStr = emptyChar.repeat(empty);
		// Color thresholds
		const pct = used !== null ? used / max : 0;
		const colorFn = pct > 0.8 ? chalk.red : pct > 0.5 ? chalk.yellow : chalk.green;
		bar = colorFn(filledStr) + chalk.dim(emptyStr);
	} else {
		const filledStr = '='.repeat(filled);
		const emptyStr = '-'.repeat(empty);
		bar = `[${filledStr}${emptyStr}]`;
	}

	return `${label}${bar}${numbers}`;
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run source/utils/contextBar.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add source/utils/contextBar.ts source/utils/contextBar.test.ts
git commit -m "feat(header): add renderContextBar with color thresholds and NO_COLOR fallback"
```

---

### Task 2: Add `detectHarness` utility

**Files:**
- Create: `source/utils/detectHarness.ts`
- Create: `source/utils/detectHarness.test.ts`

**Step 1: Write the failing tests**

```typescript
// source/utils/detectHarness.test.ts
import {describe, it, expect, vi, afterEach} from 'vitest';
import {detectHarness} from './detectHarness.js';

describe('detectHarness', () => {
	const originalEnv = process.env;

	afterEach(() => {
		process.env = originalEnv;
	});

	it('returns "Claude Code" when CLAUDE_CODE env is set', () => {
		process.env = {...originalEnv, CLAUDE_CODE: '1'};
		expect(detectHarness()).toBe('Claude Code');
	});

	it('returns "Claude Code" when CLAUDE_CODE_ENTRYPOINT is set', () => {
		process.env = {...originalEnv, CLAUDE_CODE_ENTRYPOINT: '/usr/bin/claude'};
		expect(detectHarness()).toBe('Claude Code');
	});

	it('returns "unknown" when no indicators present', () => {
		process.env = {...originalEnv};
		delete process.env['CLAUDE_CODE'];
		delete process.env['CLAUDE_CODE_ENTRYPOINT'];
		expect(detectHarness()).toBe('unknown');
	});
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/utils/detectHarness.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```typescript
// source/utils/detectHarness.ts

/**
 * Auto-detect which harness (coding assistant) athena is monitoring.
 * Currently only detects Claude Code; more harnesses coming soon.
 */
export function detectHarness(): string {
	if (process.env['CLAUDE_CODE'] || process.env['CLAUDE_CODE_ENTRYPOINT']) {
		return 'Claude Code';
	}
	return 'unknown';
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run source/utils/detectHarness.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add source/utils/detectHarness.ts source/utils/detectHarness.test.ts
git commit -m "feat(header): add detectHarness utility for auto-detecting coding assistant"
```

---

### Task 3: Update `HeaderModel` type and `buildHeaderModel()`

**Files:**
- Modify: `source/utils/headerModel.ts`
- Modify: `source/utils/headerModel.test.ts`

**Step 1: Write failing tests for new fields**

Add to `source/utils/headerModel.test.ts`:

```typescript
// Add these tests to the existing describe block:

it('includes full session_id (not short form)', () => {
	const model = buildHeaderModel(baseInput);
	expect(model.session_id).toBe('abc123');
	expect(model).not.toHaveProperty('session_id_short');
});

it('defaults workflow to "default" when workflowRef is undefined', () => {
	const model = buildHeaderModel(baseInput);
	expect(model.workflow).toBe('default');
});

it('uses workflowRef for workflow when provided', () => {
	const model = buildHeaderModel({...baseInput, workflowRef: 'deploy.prod'});
	expect(model.workflow).toBe('deploy.prod');
});

it('includes run_count from runSummaries length', () => {
	const model = buildHeaderModel(baseInput);
	expect(model.run_count).toBe(0);

	const withRuns = buildHeaderModel({
		...baseInput,
		runSummaries: [{status: 'SUCCEEDED'}, {status: 'FAILED'}],
	});
	expect(withRuns.run_count).toBe(2);
});

it('includes harness field', () => {
	const model = buildHeaderModel(baseInput);
	expect(model.harness).toBeTruthy();
});

it('includes context with null used and default max', () => {
	const model = buildHeaderModel(baseInput);
	expect(model.context).toEqual({used: null, max: 200000});
});

it('no longer has run_id_short or run_title fields', () => {
	const model = buildHeaderModel({
		...baseInput,
		currentRun: {run_id: 'run1', trigger: {prompt_preview: 'test'}, started_at: 999000},
	});
	expect(model).not.toHaveProperty('run_id_short');
	expect(model).not.toHaveProperty('run_title');
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/utils/headerModel.test.ts`
Expected: FAIL — properties don't exist yet / old properties still present

**Step 3: Update `HeaderModel` and `buildHeaderModel`**

Modify `source/utils/headerModel.ts`:

- Change `HeaderModel` interface:
  - Remove: `session_id_short`, `run_id_short`, `run_title`, `workflow_ref`
  - Add: `session_id: string`, `workflow: string`, `harness: string`, `run_count: number`, `context: {used: number | null; max: number}`
- Change `HeaderModelInput`:
  - Add: `harness?: string` (optional, auto-detected if not provided)
  - Add: `contextUsed?: number | null`, `contextMax?: number`
- Update `buildHeaderModel()`:
  - `session_id: session?.session_id ?? '–'`
  - `workflow: workflowRef ?? 'default'`
  - `harness: input.harness ?? detectHarness()`
  - `run_count: runSummaries.length`
  - `context: {used: input.contextUsed ?? null, max: input.contextMax ?? 200000}`
  - Remove `session_id_short`, `run_id_short`, `run_title`, `workflow_ref`
- Remove `formatSessionLabel` and `formatRunLabel` imports (no longer needed here)
- Add `detectHarness` import

**Step 4: Fix any existing tests that reference removed fields**

Update existing tests in `headerModel.test.ts`:
- Change `model.session_id_short` → `model.session_id`
- Remove assertions on `run_id_short` and `run_title`
- Update the `baseInput` if needed
- Remove `prefers workflow_ref over run_title` test (replaced by workflow default test)

**Step 5: Run test to verify it passes**

Run: `npx vitest run source/utils/headerModel.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add source/utils/headerModel.ts source/utils/headerModel.test.ts
git commit -m "feat(header): update HeaderModel with session_id, workflow, harness, run_count, context"
```

---

### Task 4: Update `renderHeaderLines()` with new layout

**Files:**
- Modify: `source/utils/renderHeaderLines.ts`
- Modify: `source/utils/renderHeaderLines.test.ts`

**Step 1: Write failing tests for new layout**

Replace/update `source/utils/renderHeaderLines.test.ts` to match the new layout:

- `fullModel` fixture: update to use new `HeaderModel` fields (`session_id`, `workflow`, `harness`, `run_count`, `context`)
- `idleModel` fixture: same updates
- New content tests:
  - Line 1 contains `wf:default` (not `workflow:`)
  - Line 1 contains full session_id (or truncated form)
  - Line 1 contains `harness:Claude Code`
  - Line 2 contains `ctx` and bar
  - Line 2 contains `runs:3`
- Updated truncation tests:
  - Harness (priority 40) drops before workflow (priority 60)
  - Session ID truncates progressively
- Keep invariant tests (2 lines, width constraint, rail stability)
- Remove tests referencing `run_id_short`, `run_title`, `workflow:`

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/utils/renderHeaderLines.test.ts`
Expected: FAIL — old layout doesn't match new assertions

**Step 3: Update `renderHeaderLines()`**

Modify `source/utils/renderHeaderLines.ts`:

**Line 1 left tokens** (replace existing token-building logic):
```
ATHENA (priority 100)
session_id (priority 70) — truncation: full → sess_...xyz → S1234
wf:<workflow> (priority 60)
harness:<harness> (priority 40)
```
Remove: run ID token, workflow:/run: token logic

**Line 2 left parts** (replace existing):
```
renderContextBar(context.used, context.max, barWidth, hasColor) (priority 80)
runs:<run_count> (priority 50)
progress: X/Y (priority 30)
elapsed Xm Ys (priority 20)
ended HH:MM:SS (priority 20)
```

**Line 2 right parts** (keep as-is):
```
err X (red, if > 0) (priority 10)
blk X (yellow, if > 0) (priority 10)
```

Add import: `renderContextBar` from `./contextBar.js`

Add session_id truncation helper:
```typescript
function truncateSessionId(id: string, maxWidth: number): string {
	if (id.length <= maxWidth) return id;
	if (maxWidth >= 12) {
		// sess_...xyz form
		const tail = id.slice(-6);
		return `${id.slice(0, maxWidth - 7)}…${tail}`;
	}
	// S1234 fallback
	const alphanumeric = id.replace(/[^a-zA-Z0-9]/g, '').slice(-4);
	return `S${alphanumeric || '–'}`;
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run source/utils/renderHeaderLines.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add source/utils/renderHeaderLines.ts source/utils/renderHeaderLines.test.ts
git commit -m "feat(header): new 2-line layout with context bar, session_id, harness, runs"
```

---

### Task 5: Wire into `app.tsx`

**Files:**
- Modify: `source/app.tsx` (around lines 579-600)

**Step 1: Update `buildHeaderModel` call in app.tsx**

The call at ~line 579 currently passes:
```typescript
buildHeaderModel({
	session,
	currentRun: currentRun ? { run_id, trigger, started_at } : null,
	runSummaries,
	metrics,
	todoPanel,
	tailFollow: feedNav.tailFollow,
	now,
	workflowRef,
})
```

Update to also pass `contextUsed` and `contextMax` (null for now until hook event is wired):
```typescript
buildHeaderModel({
	session,
	currentRun: currentRun ? { run_id, trigger, started_at } : null,
	runSummaries,
	metrics,
	todoPanel,
	tailFollow: feedNav.tailFollow,
	now,
	workflowRef,
	contextUsed: null,     // TODO: wire from future hook event
	contextMax: 200000,
})
```

**Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add source/app.tsx
git commit -m "feat(header): wire new header fields into app"
```

---

### Task 6: Run full lint + typecheck + tests

**Files:** None (verification only)

**Step 1: Run lint**

Run: `npm run lint`
Expected: PASS — no lint errors

**Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS — no type errors

**Step 3: Run all tests**

Run: `npm test`
Expected: PASS — all tests pass

**Step 4: Fix any issues found**

If lint/typecheck/tests fail, fix and re-run.

**Step 5: Final commit (if fixes needed)**

```bash
git add -A
git commit -m "fix(header): lint and type fixes from header field expansion"
```
