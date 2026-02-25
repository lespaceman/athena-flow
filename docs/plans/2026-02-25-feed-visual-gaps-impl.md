# Feed Visual Gaps Remediation — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix 8 visual/wiring gaps identified by screenshot review against the feed-table-columns, summary-column, and todo-panel-timeline specs — full-row dimming for lifecycle/Tool OK events, blue agent messages, Skill prefix cleanup, todo auto-scroll, done brightness, and outcome extractors.

**Architecture:** Five targeted changes across the styling pipeline (`feedLineStyle.ts`), input extractors (`format.ts`), todo panel (`useTodoPanel.ts`, `todoPanel.ts`), and outcome summarizers (`toolSummary.ts`). Each fix is independently shippable. The core pattern: propagate `opCategoryColor` results beyond the EVENT column into the full-row base style.

**Tech Stack:** TypeScript, vitest, chalk, Ink (React for CLIs)

---

### Task 1: Full-row dimming for lifecycle and Tool OK events (QW1, S9)

The EVENT column already gets `theme.textMuted` via `opCategoryColor`, but TIME, ACTOR, and SUMMARY segments use actor-derived `base` which stays bright white. Fix: override `base` with a `rowBase` for lifecycle/toolOk rows.

**Files:**

- Modify: `source/feed/feedLineStyle.ts:64-82` (styleFeedLine — after computing `base`)
- Test: `source/feed/feedLineStyle.test.ts`

**Step 1: Write failing tests**

Add to `source/feed/feedLineStyle.test.ts`:

```typescript
it('dims entire row for tool.ok events (QW1)', () => {
	const result = styleFeedLine(baseLine, {
		focused: false,
		matched: false,
		actorId: 'agent:root',
		isError: false,
		theme: darkTheme,
		opTag: 'tool.ok',
	});
	// The TIME segment (chars 1-7) should use textMuted (#6c7086 → 108;112;134)
	// not the default text color (#cdd6f4 → 205;214;244)
	const timeSegment = result.slice(0, 30); // approximate — includes ANSI
	expect(timeSegment).toContain('38;2;108;112;134');
	expect(timeSegment).not.toContain('38;2;205;214;244');
});

it('dims entire row for lifecycle events (S9)', () => {
	const result = styleFeedLine(baseLine, {
		focused: false,
		matched: false,
		actorId: 'agent:root',
		isError: false,
		theme: darkTheme,
		opTag: 'stop.request',
	});
	// TIME segment should use textMuted
	const timeSegment = result.slice(0, 30);
	expect(timeSegment).toContain('38;2;108;112;134');
});

it('dims entire row for session events (S9)', () => {
	const result = styleFeedLine(baseLine, {
		focused: false,
		matched: false,
		actorId: 'agent:root',
		isError: false,
		theme: darkTheme,
		opTag: 'sess.start',
	});
	const timeSegment = result.slice(0, 30);
	expect(timeSegment).toContain('38;2;108;112;134');
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run source/feed/feedLineStyle.test.ts`
Expected: FAIL — TIME segment still uses text color `205;214;244`, not `108;112;134`

**Step 3: Implement `rowBase` override in `styleFeedLine`**

In `source/feed/feedLineStyle.ts:78-81`, after computing `base`, add `rowBase`:

```typescript
// Error overrides actor color
const base = isError
	? chalk.hex(theme.status.error)
	: actorStyle(actorId, theme);

// Full-row dimming: lifecycle and Tool OK events get muted base for all segments
const isLifecycleRow =
	opts.opTag !== undefined && /^(run\.|sess\.|stop\.|sub\.)/.test(opts.opTag);
const isToolOk = opts.opTag === 'tool.ok';
const rowBase =
	!isError && (isLifecycleRow || isToolOk) ? chalk.hex(theme.textMuted) : base;
```

Then replace `base` with `rowBase` in the three segment-building sections:

1. **TIME segment** (line 128): `{start: 1, end: FEED_EVENT_COL_START, style: rowBase}`
2. **ACTOR segment** (line 145-149): change `style: actorStyle_` to use `rowBase` when `isLifecycleRow || isToolOk`:
   ```typescript
   const actorStyle_ =
   	isLifecycleRow || isToolOk
   		? rowBase
   		: opts.duplicateActor
   			? chalk.dim.hex(theme.textMuted)
   			: base;
   ```
3. **SUMMARY segment** (lines 162-172): replace all `base` references with `rowBase` in both branches (bright prefix and fallback single span)

**Step 4: Run tests to verify they pass**

Run: `npx vitest run source/feed/feedLineStyle.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add source/feed/feedLineStyle.ts source/feed/feedLineStyle.test.ts
git commit -m "fix(feed): dim entire row for lifecycle and Tool OK events (QW1, S9)"
```

---

### Task 2: Blue agent message summaries (S6)

Agent message summary text should use `theme.status.info` (blue), not the default text color. The EVENT column already colors `agent.msg` blue via `opCategoryColor`, but the summary segment doesn't.

**Files:**

- Modify: `source/feed/feedLineStyle.ts:82` (add agent message summary override)
- Test: `source/feed/feedLineStyle.test.ts`

**Step 1: Write failing test**

Add to `source/feed/feedLineStyle.test.ts`:

```typescript
it('applies info color to agent.msg summary (S6)', () => {
	const agentMsgLine =
		' 08:55 Agent Msg     AGENT      Here is a summary of the results       ?';
	const result = styleFeedLine(agentMsgLine, {
		focused: false,
		matched: false,
		actorId: 'agent:root',
		isError: false,
		theme: darkTheme,
		opTag: 'agent.msg',
	});
	// status.info is #89b4fa → RGB 137;180;250
	// The summary portion (after ACTOR) should contain this color
	expect(result).toContain('38;2;137;180;250');
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/feed/feedLineStyle.test.ts`
Expected: FAIL — summary uses default text color, not info blue

**Step 3: Add agent message summary override**

In `source/feed/feedLineStyle.ts`, after the `rowBase` computation, add:

```typescript
// Agent messages: summary text uses info color (blue)
const isAgentMsg = opts.opTag === 'agent.msg';
const summaryBase = isAgentMsg ? chalk.hex(theme.status.info) : rowBase;
```

Then in the SUMMARY segment section (lines 161-172), replace `base`/`rowBase` with `summaryBase` for the bright-prefix portion:

```typescript
if (effectiveDim !== undefined) {
	if (effectiveDim > summaryStart) {
		segments.push({start: summaryStart, end: effectiveDim, style: summaryBase});
	}
	// ...dim portion unchanged...
} else if (summaryStart < afterEventEnd) {
	segments.push({start: summaryStart, end: afterEventEnd, style: summaryBase});
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run source/feed/feedLineStyle.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add source/feed/feedLineStyle.ts source/feed/feedLineStyle.test.ts
git commit -m "fix(feed): apply blue info color to agent message summaries (S6)"
```

---

### Task 3: Strip Skill plugin prefix (S4)

The Skill input extractor returns raw `e2e-test-builder:add-e2e-tests`. Strip the `plugin-name:` prefix.

**Files:**

- Modify: `source/utils/format.ts:130` (Skill extractor)
- Test: `source/utils/format.test.ts`

**Step 1: Write failing test**

Add to `source/utils/format.test.ts` (find the `summarizeToolPrimaryInput` describe block):

```typescript
it('strips plugin prefix from Skill input', () => {
	const result = summarizeToolPrimaryInput('Skill', {
		skill: 'e2e-test-builder:add-e2e-tests',
	});
	expect(result).toBe('add-e2e-tests');
	expect(result).not.toContain('e2e-test-builder');
});

it('keeps Skill input without plugin prefix unchanged', () => {
	const result = summarizeToolPrimaryInput('Skill', {
		skill: 'commit',
	});
	expect(result).toBe('commit');
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/utils/format.test.ts`
Expected: FAIL — returns `e2e-test-builder:add-e2e-tests`

**Step 3: Update Skill extractor**

In `source/utils/format.ts:130`, replace:

```typescript
Skill: input => compactText(String(input.skill ?? ''), 40),
```

with:

```typescript
Skill: input => {
	const name = String(input.skill ?? '');
	const colonIdx = name.indexOf(':');
	return compactText(colonIdx >= 0 ? name.slice(colonIdx + 1) : name, 40);
},
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run source/utils/format.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add source/utils/format.ts source/utils/format.test.ts
git commit -m "fix(feed): strip plugin prefix from Skill event summaries (S4)"
```

---

### Task 4: Todo auto-scroll to keep active stage visible (QW3-collapse)

The `▼ +N more` scroll indicator can hide the active (`doing`) stage. Add a `useEffect` that adjusts `todoScroll` whenever the sorted items change.

**Files:**

- Modify: `source/hooks/useTodoPanel.ts:139-141` (add useEffect after cursor clamp)
- Test: (integration — verified via manual run + existing tests)

**Step 1: Write failing test**

This is best tested via the hook's output. Create or add to a test for `useTodoPanel`. If no test file exists, add a focused unit test:

```typescript
// source/hooks/useTodoPanel.test.ts (if it exists, add to it; if not, create it)
import {describe, it, expect} from 'vitest';
import {renderHook, act} from '@testing-library/react';
import {useTodoPanel} from './useTodoPanel.js';

describe('useTodoPanel auto-scroll', () => {
	it('scrolls to keep active item visible', () => {
		// Create 10 tasks where the 8th is 'doing' (beyond default viewport)
		const tasks = Array.from({length: 10}, (_, i) => ({
			content: `Task ${i}`,
			status:
				i < 7
					? ('completed' as const)
					: i === 7
						? ('in_progress' as const)
						: ('pending' as const),
		}));

		const {result} = renderHook(() =>
			useTodoPanel({tasks, todoVisible: true, focusMode: 'feed'}),
		);

		// The active item (index 7 in sorted, which maps to doing) should be visible.
		// With a conservative estimate of 4 visible slots, todoScroll should be >= 4
		expect(result.current.todoScroll).toBeGreaterThanOrEqual(4);
	});
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/hooks/useTodoPanel.test.ts`
Expected: FAIL — `todoScroll` is 0 (no auto-scroll)

**Step 3: Add auto-scroll effect**

In `source/hooks/useTodoPanel.ts`, after the cursor clamp effect (line 141), add:

```typescript
// Auto-scroll to keep active (doing) item visible
useEffect(() => {
	const activeIdx = sortedItems.findIndex(i => i.status === 'doing');
	if (activeIdx < 0) return;
	setTodoScroll(prev => {
		// Conservative estimate of visible slots (actual viewport may be larger)
		const maxVisible = 5;
		if (activeIdx < prev) return activeIdx;
		if (activeIdx >= prev + maxVisible)
			return Math.max(0, activeIdx - maxVisible + 1);
		return prev;
	});
}, [sortedItems]);
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run source/hooks/useTodoPanel.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add source/hooks/useTodoPanel.ts source/hooks/useTodoPanel.test.ts
git commit -m "fix(todo): auto-scroll to keep active stage visible (QW3)"
```

---

### Task 5: Dim completed todo text further (QW3-brightness)

Completed stage text uses `chalk.hex(colors.textMuted)` but still looks too bright. Add `chalk.dim()` wrapper for double-dimming.

**Files:**

- Modify: `source/feed/todoPanel.ts:101` (done case text function)
- Test: `source/feed/todoPanel.test.ts`

**Step 1: Write failing test**

Add to `source/feed/todoPanel.test.ts`:

```typescript
import chalk from 'chalk';
import {todoGlyphs, type TodoGlyphColors} from './todoPanel.js';

// Force chalk color in test
chalk.level = 3;

const testColors: TodoGlyphColors = {
	doing: '#f9e2af',
	done: '#a6e3a1',
	failed: '#f38ba8',
	blocked: '#f9e2af',
	text: '#cdd6f4',
	textMuted: '#6c7086',
	default: '#a6adc8',
};

describe('todoGlyphs styledRow', () => {
	it('applies chalk.dim to completed stage text for extra dimming', () => {
		const g = todoGlyphs(false, testColors);
		const row = g.styledRow({
			id: 't1',
			text: 'Check config',
			priority: 'P1',
			status: 'done',
		});
		const styled = row.text('Check config');
		// Should contain dim escape \x1b[2m
		expect(styled).toContain('\x1b[2m');
	});
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/feed/todoPanel.test.ts`
Expected: FAIL — done text uses `chalk.hex()` without `chalk.dim()`, no dim escape present

**Step 3: Add chalk.dim to done text**

In `source/feed/todoPanel.ts:101`, change:

```typescript
text: (raw: string) => chalk.hex(colors.textMuted)(raw),
```

to:

```typescript
text: (raw: string) => chalk.dim(chalk.hex(colors.textMuted)(raw)),
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run source/feed/todoPanel.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add source/feed/todoPanel.ts source/feed/todoPanel.test.ts
git commit -m "fix(todo): double-dim completed stage text for clearer visual hierarchy (QW3)"
```

---

### Task 6: Run lint, typecheck, and full test suite

**Files:** None (verification only)

**Step 1: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 2: Run lint**

Run: `npm run lint`
Expected: PASS (fix any issues)

**Step 3: Run full test suite**

Run: `npx vitest run source/`
Expected: All PASS

**Step 4: Fix any failures**

If there are test regressions (e.g., existing `styleFeedLine` tests checking for the old text color on lifecycle rows), update those test assertions to expect `textMuted` color.

**Step 5: Final commit (if fixes needed)**

```bash
git add -A
git commit -m "fix: resolve lint/type/test issues from visual gaps remediation"
```

---

### Summary of Changes

| File                                | Change                                                                       |
| ----------------------------------- | ---------------------------------------------------------------------------- |
| `source/feed/feedLineStyle.ts`      | Add `rowBase` and `summaryBase` overrides for lifecycle/toolOk/agentMsg rows |
| `source/feed/feedLineStyle.test.ts` | Add tests for full-row dimming and agent message blue                        |
| `source/utils/format.ts`            | Strip plugin prefix from Skill extractor                                     |
| `source/utils/format.test.ts`       | Add tests for Skill prefix stripping                                         |
| `source/hooks/useTodoPanel.ts`      | Add auto-scroll effect to keep active item visible                           |
| `source/hooks/useTodoPanel.test.ts` | Add auto-scroll test                                                         |
| `source/feed/todoPanel.ts`          | Add `chalk.dim()` to done text for extra dimming                             |
| `source/feed/todoPanel.test.ts`     | Add styledRow dimming test                                                   |
