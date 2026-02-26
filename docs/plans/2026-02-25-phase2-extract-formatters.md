# Phase 2: Extract Cell Formatters — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extract all feed line formatting logic from `timeline.ts` and `feedLineStyle.ts` into pure, independently testable cell formatter functions — with zero visual change.

**Architecture:** Current pipeline is two-pass: `formatFeedLine()` does layout (column widths, padding, segment positions) then `styleFeedLine()` applies ANSI colors via position-based segment painting. Phase 2 replaces this with per-cell pure functions `(data, contentWidth, theme) → chalk-styled string`. The old code path stays active — new formatters are proven equivalent via side-by-side tests before Phase 3 wires them into the grid.

**Tech Stack:** TypeScript, chalk, string-width, slice-ansi, vitest, strip-ansi

---

## Reference: Existing Code Locations

| What                                                     | Where                                 |
| -------------------------------------------------------- | ------------------------------------- |
| `TimelineEntry` type                                     | `source/feed/timeline.ts:28-47`       |
| `SummarySegment` / `SummarySegmentRole`                  | `source/feed/timeline.ts:20-26`       |
| `formatFeedLine()`                                       | `source/feed/timeline.ts:666-742`     |
| `styleFeedLine()`                                        | `source/feed/feedLineStyle.ts:65-240` |
| `opCategoryColor()`                                      | `source/feed/feedLineStyle.ts:44-57`  |
| `actorStyle()`                                           | `source/feed/feedLineStyle.ts:59-63`  |
| `fit()` / `fitAnsi()` / `formatClock()` / `actorLabel()` | `source/utils/format.ts`              |
| `getGlyphs()` / `GLYPH_REGISTRY`                         | `source/glyphs/index.ts`              |
| Column constants (`FEED_*`)                              | `source/feed/timeline.ts:642-652`     |
| `darkTheme` (for tests)                                  | `source/theme/themes.ts`              |
| `Theme` type                                             | `source/theme/types.ts`               |
| `useTimeline()`                                          | `source/hooks/useTimeline.ts`         |
| `buildBodyLines()` (consumer)                            | `source/utils/buildBodyLines.ts`      |

---

### Task 1: Create `cellFormatters.ts` with `fit`, `opCategoryColor`, and `formatGutter`

Start with the foundation: re-export `fit` from `format.ts`, extract `opCategoryColor` from `feedLineStyle.ts`, and implement `formatGutter`.

**Files:**

- Create: `source/feed/cellFormatters.ts`
- Create: `source/feed/cellFormatters.test.ts`
- Reference: `source/feed/feedLineStyle.ts:44-57` (opCategoryColor), `source/feed/feedLineStyle.ts:110-132` (gutter logic), `source/glyphs/index.ts`

**Step 1: Write the failing tests**

```ts
// source/feed/cellFormatters.test.ts
import {describe, test, expect} from 'vitest';
import stripAnsi from 'strip-ansi';
import {darkTheme} from '../theme/themes.js';
import {formatGutter, opCategoryColor, fit} from './cellFormatters.js';

const theme = darkTheme;

describe('fit', () => {
	test('pads short text to width', () => {
		expect(fit('hi', 5)).toBe('hi   ');
	});
	test('truncates long text with ellipsis', () => {
		expect(fit('hello world', 8)).toBe('hello...');
	});
	test('returns empty for width 0', () => {
		expect(fit('hi', 0)).toBe('');
	});
});

describe('opCategoryColor', () => {
	test('tool.fail returns error color', () => {
		expect(opCategoryColor('tool.fail', theme)).toBe(theme.status.error);
	});
	test('tool.ok returns textMuted', () => {
		expect(opCategoryColor('tool.ok', theme)).toBe(theme.textMuted);
	});
	test('perm.* returns accentSecondary', () => {
		expect(opCategoryColor('perm.req', theme)).toBe(theme.accentSecondary);
	});
	test('agent.msg returns info', () => {
		expect(opCategoryColor('agent.msg', theme)).toBe(theme.status.info);
	});
	test('unknown returns undefined', () => {
		expect(opCategoryColor('unknown', theme)).toBeUndefined();
	});
});

describe('formatGutter', () => {
	test('focused returns ▎', () => {
		const r = formatGutter({
			focused: true,
			matched: false,
			categoryBreak: false,
			minuteBreak: false,
			isUserBorder: false,
			ascii: false,
			theme,
		});
		expect(stripAnsi(r)).toBe('▎');
	});

	test('matched returns ▌', () => {
		const r = formatGutter({
			focused: false,
			matched: true,
			categoryBreak: false,
			minuteBreak: false,
			isUserBorder: false,
			ascii: false,
			theme,
		});
		expect(stripAnsi(r)).toBe('▌');
	});

	test('user border returns ▎', () => {
		const r = formatGutter({
			focused: false,
			matched: false,
			categoryBreak: false,
			minuteBreak: false,
			isUserBorder: true,
			ascii: false,
			theme,
		});
		expect(stripAnsi(r)).toBe('▎');
	});

	test('minute break (no category) returns ─', () => {
		const r = formatGutter({
			focused: false,
			matched: false,
			categoryBreak: false,
			minuteBreak: true,
			isUserBorder: false,
			ascii: false,
			theme,
		});
		expect(stripAnsi(r)).toBe('─');
	});

	test('category break returns ·', () => {
		const r = formatGutter({
			focused: false,
			matched: false,
			categoryBreak: true,
			minuteBreak: false,
			isUserBorder: false,
			ascii: false,
			theme,
		});
		expect(stripAnsi(r)).toBe('·');
	});

	test('default returns space', () => {
		const r = formatGutter({
			focused: false,
			matched: false,
			categoryBreak: false,
			minuteBreak: false,
			isUserBorder: false,
			ascii: false,
			theme,
		});
		expect(stripAnsi(r)).toBe(' ');
	});

	test('ascii mode: focused returns |', () => {
		const r = formatGutter({
			focused: true,
			matched: false,
			categoryBreak: false,
			minuteBreak: false,
			isUserBorder: false,
			ascii: true,
			theme,
		});
		expect(stripAnsi(r)).toBe('|');
	});

	test('priority: matched > userBorder > minuteBreak > categoryBreak', () => {
		const r = formatGutter({
			focused: false,
			matched: true,
			categoryBreak: true,
			minuteBreak: true,
			isUserBorder: true,
			ascii: false,
			theme,
		});
		expect(stripAnsi(r)).toBe('▌'); // matched wins
	});
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run source/feed/cellFormatters.test.ts`
Expected: FAIL — module not found

**Step 3: Implement the formatters**

```ts
// source/feed/cellFormatters.ts
import chalk from 'chalk';
import {type Theme} from '../theme/types.js';
import {fit as fitImpl} from '../utils/format.js';
import {getGlyphs} from '../glyphs/index.js';

// Re-export fit so all formatter consumers import from one place
export {fit} from '../utils/format.js';

export function opCategoryColor(op: string, theme: Theme): string | undefined {
	if (op === 'tool.fail') return theme.status.error;
	if (op === 'tool.ok' || op.startsWith('tool.')) return theme.textMuted;
	if (op.startsWith('perm.')) return theme.accentSecondary;
	if (op === 'agent.msg') return theme.status.info;
	if (
		op.startsWith('run.') ||
		op.startsWith('sess.') ||
		op.startsWith('stop.') ||
		op.startsWith('sub.')
	)
		return theme.textMuted;
	return undefined;
}

export type FormatGutterOpts = {
	focused: boolean;
	matched: boolean;
	categoryBreak: boolean;
	minuteBreak: boolean;
	isUserBorder: boolean;
	ascii: boolean;
	theme: Theme;
};

export function formatGutter(opts: FormatGutterOpts): string {
	const {
		focused,
		matched,
		categoryBreak,
		minuteBreak,
		isUserBorder,
		ascii,
		theme,
	} = opts;
	const g = getGlyphs(ascii);

	if (focused) {
		return chalk.hex(theme.accent)(g['feed.focusBorder']);
	}
	if (matched) {
		return chalk.hex(theme.accent)(g['feed.searchMatch']);
	}
	if (isUserBorder) {
		const borderColor = theme.userMessage.border ?? theme.accent;
		return chalk.hex(borderColor)(g['feed.userBorder']);
	}
	if (minuteBreak && !categoryBreak) {
		return chalk.dim.hex(theme.textMuted)('─');
	}
	if (categoryBreak) {
		return chalk.dim.hex(theme.textMuted)('·');
	}
	return ' ';
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run source/feed/cellFormatters.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add source/feed/cellFormatters.ts source/feed/cellFormatters.test.ts
git commit -m "feat(feed): add cellFormatters with fit, opCategoryColor, formatGutter"
```

---

### Task 2: Add `formatTime`, `formatEvent`, `formatActor`, `formatTool`, `formatSuffix`

The five simple cell formatters. Each takes `(data, contentWidth, theme) → string`.

**Files:**

- Modify: `source/feed/cellFormatters.ts`
- Modify: `source/feed/cellFormatters.test.ts`
- Reference: `source/feed/timeline.ts:682-685` (time/event/actor in formatFeedLine), `source/feed/feedLineStyle.ts:59-63` (actorStyle), `source/feed/feedLineStyle.ts:212-232` (glyph styling)

**Step 1: Write the failing tests**

Add to `source/feed/cellFormatters.test.ts`:

```ts
import {
	formatTime,
	formatEvent,
	formatActor,
	formatTool,
	formatSuffix,
} from './cellFormatters.js';

describe('formatTime', () => {
	test('formats timestamp as HH:MM padded to contentWidth', () => {
		const ts = new Date('2025-06-15T14:30:00').getTime();
		const r = formatTime(ts, 5, theme);
		expect(stripAnsi(r)).toHaveLength(5);
		expect(stripAnsi(r)).toMatch(/\d{2}:\d{2}/);
	});

	test('fills exactly contentWidth chars', () => {
		const r = formatTime(Date.now(), 5, theme);
		expect(stripAnsi(r)).toHaveLength(5);
	});
});

describe('formatEvent', () => {
	test('pads short opTag to contentWidth', () => {
		const r = formatEvent('Agent', 12, theme);
		expect(stripAnsi(r)).toHaveLength(12);
	});

	test('truncates long opTag to contentWidth', () => {
		const r = formatEvent('Tool Response Long', 12, theme);
		expect(stripAnsi(r)).toHaveLength(12);
	});

	test('applies opCategoryColor for tool.fail', () => {
		const r = formatEvent('Tool Fail', 12, theme, 'tool.fail');
		// Should contain ANSI (error color)
		expect(r).not.toBe(stripAnsi(r));
	});
});

describe('formatActor', () => {
	test('non-duplicate shows actor name padded to width', () => {
		const r = formatActor('AGENT', false, 10, theme, 'agent:root');
		expect(stripAnsi(r)).toHaveLength(10);
		expect(stripAnsi(r)).toContain('AGENT');
	});

	test('duplicate shows centered dot', () => {
		const r = formatActor('AGENT', true, 10, theme, 'agent:root');
		expect(stripAnsi(r).trim()).toBe('·');
		expect(stripAnsi(r)).toHaveLength(10);
	});

	test('long actor name truncated with ellipsis', () => {
		const r = formatActor('VERY-LONG-ACTOR', false, 10, theme, 'agent:root');
		expect(stripAnsi(r)).toHaveLength(10);
		expect(stripAnsi(r)).toContain('...');
	});

	test('zero width returns empty', () => {
		expect(formatActor('AGENT', false, 0, theme, 'agent:root')).toBe('');
	});
});

describe('formatTool', () => {
	test('fits tool name to width', () => {
		const r = formatTool('Read', 12, theme);
		expect(stripAnsi(r)).toHaveLength(12);
	});

	test('truncates long tool name', () => {
		const r = formatTool('browser_navigate', 8, theme);
		expect(stripAnsi(r)).toHaveLength(8);
	});

	test('empty tool returns padded empty', () => {
		const r = formatTool('', 12, theme);
		expect(stripAnsi(r)).toHaveLength(12);
	});
});

describe('formatSuffix', () => {
	test('expandable collapsed shows ▸ ', () => {
		expect(stripAnsi(formatSuffix(true, false, false, theme))).toBe('▸ ');
	});

	test('expandable expanded shows ▾ ', () => {
		expect(stripAnsi(formatSuffix(true, true, false, theme))).toBe('▾ ');
	});

	test('not expandable shows two spaces', () => {
		expect(stripAnsi(formatSuffix(false, false, false, theme))).toBe('  ');
	});

	test('ascii mode collapsed shows > ', () => {
		expect(stripAnsi(formatSuffix(true, false, true, theme))).toBe('> ');
	});

	test('ascii mode expanded shows v ', () => {
		expect(stripAnsi(formatSuffix(true, true, true, theme))).toBe('v ');
	});
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run source/feed/cellFormatters.test.ts`
Expected: FAIL — functions not exported

**Step 3: Implement the formatters**

Add to `source/feed/cellFormatters.ts`:

```ts
import {formatClock} from '../utils/format.js';

export function formatTime(
	ts: number,
	contentWidth: number,
	theme: Theme,
): string {
	const clock = formatClock(ts);
	return chalk.hex(theme.textMuted)(fitImpl(clock, contentWidth));
}

export function formatEvent(
	opLabel: string,
	contentWidth: number,
	theme: Theme,
	opTag?: string,
): string {
	const fitted = fitImpl(opLabel, contentWidth);
	const color = opTag ? opCategoryColor(opTag, theme) : undefined;
	return color ? chalk.hex(color)(fitted) : chalk.hex(theme.text)(fitted);
}

export function formatActor(
	actor: string,
	duplicate: boolean,
	contentWidth: number,
	theme: Theme,
	actorId: string,
): string {
	if (contentWidth <= 0) return '';
	if (duplicate) {
		// Centered dot
		const pad = Math.floor((contentWidth - 1) / 2);
		const text = ' '.repeat(pad) + '·' + ' '.repeat(contentWidth - pad - 1);
		return chalk.dim.hex(theme.textMuted)(text);
	}
	const fitted = fitImpl(actor, contentWidth);
	// Actor color: system → dim muted, user → userMessage.text, else → text
	if (actorId === 'system') return chalk.dim.hex(theme.textMuted)(fitted);
	if (actorId === 'user') return chalk.hex(theme.userMessage.text)(fitted);
	return chalk.hex(theme.text)(fitted);
}

export function formatTool(
	toolColumn: string,
	contentWidth: number,
	theme: Theme,
): string {
	if (contentWidth <= 0) return '';
	return chalk.hex(theme.text)(fitImpl(toolColumn, contentWidth));
}

export function formatSuffix(
	expandable: boolean,
	expanded: boolean,
	ascii: boolean,
	theme: Theme,
): string {
	if (!expandable) return '  ';
	const g = getGlyphs(ascii);
	if (expanded) {
		return chalk.hex(theme.status.success)(g['feed.expandExpanded']) + ' ';
	}
	return chalk.hex(theme.accent)(g['feed.expandCollapsed']) + ' ';
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run source/feed/cellFormatters.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add source/feed/cellFormatters.ts source/feed/cellFormatters.test.ts
git commit -m "feat(feed): add formatTime, formatEvent, formatActor, formatTool, formatSuffix"
```

---

### Task 3: Add `buildDetailsPrefix` and `layoutTargetAndOutcome`

Two self-contained helpers that `formatDetails` will compose.

**Files:**

- Modify: `source/feed/cellFormatters.ts`
- Modify: `source/feed/cellFormatters.test.ts`

**Step 1: Write the failing tests**

Add to `source/feed/cellFormatters.test.ts`:

```ts
import {buildDetailsPrefix, layoutTargetAndOutcome} from './cellFormatters.js';

describe('buildDetailsPrefix', () => {
	test('full mode returns empty prefix', () => {
		const r = buildDetailsPrefix('full', 'Read', 'AGENT', theme);
		expect(r).toEqual({text: '', length: 0});
	});

	test('compact mode prepends tool only', () => {
		const r = buildDetailsPrefix('compact', 'Read', undefined, theme);
		expect(r.length).toBeGreaterThan(0);
		expect(stripAnsi(r.text)).toContain('Read');
	});

	test('narrow mode prepends actor then tool', () => {
		const r = buildDetailsPrefix('narrow', 'Read', 'AGENT', theme);
		const plain = stripAnsi(r.text);
		expect(plain.indexOf('AGENT')).toBeLessThan(plain.indexOf('Read'));
	});

	test('prefix length matches stripped text length', () => {
		const r = buildDetailsPrefix('narrow', 'Read', 'AGENT', theme);
		expect(r.length).toBe(stripAnsi(r.text).length);
	});

	test('compact with no tool returns empty', () => {
		const r = buildDetailsPrefix('compact', undefined, undefined, theme);
		expect(r).toEqual({text: '', length: 0});
	});
});

describe('layoutTargetAndOutcome', () => {
	test('no outcome returns fitted target', () => {
		const r = layoutTargetAndOutcome('src/app.tsx', undefined, 30);
		expect(r).toHaveLength(30);
	});

	test('right-aligns outcome when space permits', () => {
		const r = layoutTargetAndOutcome('src/app.tsx', '120 lines', 40);
		expect(r.endsWith('120 lines')).toBe(true);
		expect(r).toHaveLength(40);
	});

	test('inline fallback when width is tight', () => {
		const r = layoutTargetAndOutcome('src/app.tsx', '120 lines', 20);
		expect(r).toHaveLength(20);
	});

	test('zero width returns empty', () => {
		expect(layoutTargetAndOutcome('src/app.tsx', '120 lines', 0)).toBe('');
	});
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run source/feed/cellFormatters.test.ts`
Expected: FAIL — functions not exported

**Step 3: Implement**

Add to `source/feed/cellFormatters.ts`:

```ts
import stripAnsi from 'strip-ansi';

export function buildDetailsPrefix(
	mode: 'full' | 'compact' | 'narrow',
	toolColumn: string | undefined,
	actorStr: string | undefined,
	theme: Theme,
): {text: string; length: number} {
	if (mode === 'full') return {text: '', length: 0};

	let prefix = '';

	// Narrow: actor comes first
	if (mode === 'narrow' && actorStr) {
		prefix += chalk.hex(theme.textMuted)(fitImpl(actorStr, 10)) + ' ';
	}

	// Compact & narrow: tool as bright prefix
	if (toolColumn) {
		prefix += chalk.hex(theme.text)(toolColumn) + '  ';
	}

	if (!prefix) return {text: '', length: 0};
	return {text: prefix, length: stripAnsi(prefix).length};
}

export function layoutTargetAndOutcome(
	target: string,
	outcomeStr: string | undefined,
	width: number,
): string {
	if (width <= 0) return '';
	if (!outcomeStr) {
		return fitImpl(target, width);
	}

	const outcomeLen = outcomeStr.length;
	const targetBudget = width - outcomeLen - 2; // 2 = minimum gap

	// Not enough room to separate — inline fallback
	if (targetBudget < 10) {
		return fitImpl(`${target}  ${outcomeStr}`, width);
	}

	// Right-align outcome
	const fittedTarget = fitImpl(target, targetBudget);
	const padNeeded = width - fittedTarget.length - outcomeLen;
	const padding = padNeeded > 0 ? ' '.repeat(padNeeded) : '  ';
	return fittedTarget + padding + outcomeStr;
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run source/feed/cellFormatters.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add source/feed/cellFormatters.ts source/feed/cellFormatters.test.ts
git commit -m "feat(feed): add buildDetailsPrefix and layoutTargetAndOutcome"
```

---

### Task 4: Add `renderSegments`, `renderOutcome`, and `formatDetails`

The main details formatter that composes the helpers from Task 3.

**Files:**

- Modify: `source/feed/cellFormatters.ts`
- Modify: `source/feed/cellFormatters.test.ts`
- Reference: `source/feed/feedLineStyle.ts:170-210` (roleStyle + segment painting), `source/feed/timeline.ts:689-707` (outcome layout)

**Step 1: Write the failing tests**

Add to `source/feed/cellFormatters.test.ts`:

```ts
import {formatDetails} from './cellFormatters.js';
import type {SummarySegment} from './timeline.js';

describe('formatDetails', () => {
	test('full mode: no prefix, target + outcome', () => {
		const r = formatDetails({
			segments: [{text: 'src/app.tsx', role: 'target'}],
			summary: 'src/app.tsx',
			outcome: '120 lines',
			mode: 'full',
			contentWidth: 40,
			theme,
			opTag: 'tool.ok',
		});
		const plain = stripAnsi(r);
		expect(plain).toContain('src/app.tsx');
		expect(plain).toContain('120 lines');
		expect(plain.length).toBeLessThanOrEqual(40);
	});

	test('compact mode: tool prefix + target', () => {
		const r = formatDetails({
			segments: [{text: 'src/app.tsx', role: 'target'}],
			summary: 'src/app.tsx',
			outcome: '120 lines',
			mode: 'compact',
			toolColumn: 'Read',
			contentWidth: 40,
			theme,
			opTag: 'tool.ok',
		});
		const plain = stripAnsi(r);
		expect(plain).toMatch(/^Read/);
	});

	test('narrow mode: actor + tool prefix + target', () => {
		const r = formatDetails({
			segments: [{text: 'src/app.tsx', role: 'target'}],
			summary: 'src/app.tsx',
			mode: 'narrow',
			toolColumn: 'Read',
			actorStr: 'AGENT',
			contentWidth: 50,
			theme,
			opTag: 'tool.ok',
		});
		const plain = stripAnsi(r);
		const actorIdx = plain.indexOf('AGENT');
		const toolIdx = plain.indexOf('Read');
		expect(actorIdx).toBeLessThan(toolIdx);
	});

	test('empty segments falls back to summary', () => {
		const r = formatDetails({
			segments: [],
			summary: 'some fallback text',
			mode: 'full',
			contentWidth: 30,
			theme,
			opTag: 'agent.msg',
		});
		expect(stripAnsi(r)).toContain('some fallback text');
	});

	test('outcomeZero gets distinct styling', () => {
		const noZero = formatDetails({
			segments: [{text: 'test', role: 'target'}],
			summary: 'test',
			outcome: '0 files',
			mode: 'full',
			contentWidth: 40,
			theme,
			opTag: 'tool.ok',
		});
		const withZero = formatDetails({
			segments: [{text: 'test', role: 'target'}],
			summary: 'test',
			outcome: '0 files',
			outcomeZero: true,
			mode: 'full',
			contentWidth: 40,
			theme,
			opTag: 'tool.ok',
		});
		// Different ANSI because outcomeZero → warning color
		expect(noZero).not.toBe(withZero);
	});
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run source/feed/cellFormatters.test.ts`
Expected: FAIL — formatDetails not exported

**Step 3: Implement**

Add to `source/feed/cellFormatters.ts`:

```ts
import type {SummarySegment, SummarySegmentRole} from './timeline.js';

// ── Internal: render segments with role-based styling ────────
function renderSegments(
	segments: SummarySegment[],
	summary: string,
	width: number,
	theme: Theme,
	opTag: string,
	isError: boolean,
): string {
	if (width <= 0) return '';
	if (segments.length === 0) {
		return fitImpl(summary, width);
	}

	const isAgentMsg = opTag === 'agent.msg';
	const baseColor = isAgentMsg ? theme.status.info : theme.text;

	const roleColor = (role: SummarySegmentRole): string => {
		if (isError) return theme.status.error;
		switch (role) {
			case 'verb':
				return baseColor;
			case 'target':
				return theme.textMuted;
			case 'filename':
				return theme.text;
			case 'outcome':
				return theme.textMuted;
			case 'plain':
				return baseColor;
		}
	};

	let result = '';
	let usedWidth = 0;
	for (const seg of segments) {
		if (usedWidth >= width) break;
		const remaining = width - usedWidth;
		const text =
			seg.text.length > remaining ? seg.text.slice(0, remaining) : seg.text;
		result += chalk.hex(roleColor(seg.role))(text);
		usedWidth += text.length;
	}

	// Pad to width
	if (usedWidth < width) {
		result += ' '.repeat(width - usedWidth);
	}
	return result;
}

// ── Internal: style outcome string ──────────────────────────
function renderOutcome(
	outcome: string | undefined,
	outcomeZero: boolean | undefined,
	theme: Theme,
): string | undefined {
	if (!outcome) return undefined;
	if (outcomeZero) return chalk.hex(theme.status.warning)(outcome);
	return chalk.hex(theme.textMuted)(outcome);
}

export type FormatDetailsOpts = {
	segments: SummarySegment[];
	summary: string;
	outcome?: string;
	outcomeZero?: boolean;
	mode: 'full' | 'compact' | 'narrow';
	toolColumn?: string;
	actorStr?: string;
	contentWidth: number;
	theme: Theme;
	opTag: string;
	isError?: boolean;
};

export function formatDetails(opts: FormatDetailsOpts): string {
	const {
		segments,
		summary,
		outcome,
		outcomeZero,
		mode,
		toolColumn,
		actorStr,
		contentWidth,
		theme,
		opTag,
		isError = false,
	} = opts;

	// Step 1: merged-column prefix
	const prefix = buildDetailsPrefix(mode, toolColumn, actorStr, theme);
	const innerWidth = Math.max(0, contentWidth - prefix.length);

	// Step 2: render outcome
	const outcomeStr = renderOutcome(outcome, outcomeZero, theme);
	const outcomeClean = outcomeStr ? stripAnsi(outcomeStr) : undefined;

	// Step 3: render target segments (budget = innerWidth minus outcome)
	const target = renderSegments(
		segments,
		summary,
		innerWidth,
		theme,
		opTag,
		isError,
	);
	const targetClean = stripAnsi(target).trimEnd();

	// Step 4: lay out target + outcome
	const body = layoutTargetAndOutcome(targetClean, outcomeClean, innerWidth);

	// Re-apply segment styling to the laid-out body:
	// For simplicity in Phase 2, render segments into the target budget,
	// then overlay outcome styling.
	if (!outcomeStr || innerWidth <= 0) {
		return (
			prefix.text +
			renderSegments(segments, summary, innerWidth, theme, opTag, isError)
		);
	}

	const outcomeLen = outcomeClean!.length;
	const targetBudget = innerWidth - outcomeLen - 2;
	if (targetBudget < 10) {
		// Inline: segments + gap + outcome, all truncated
		const segStr = renderSegments(
			segments,
			summary,
			innerWidth - outcomeLen - 2,
			theme,
			opTag,
			isError,
		);
		const segClean = stripAnsi(segStr).trimEnd();
		const padNeeded = innerWidth - segClean.length - outcomeLen;
		const pad = padNeeded >= 2 ? ' '.repeat(padNeeded) : '  ';
		const truncated = fitImpl(
			segClean + pad + stripAnsi(outcomeStr),
			innerWidth,
		);
		// Re-style: best effort plain fit
		return prefix.text + truncated;
	}

	const segStr = renderSegments(
		segments,
		summary,
		targetBudget,
		theme,
		opTag,
		isError,
	);
	const segClean = stripAnsi(segStr);
	const padNeeded = innerWidth - segClean.length - outcomeLen;
	const pad = padNeeded > 0 ? ' '.repeat(padNeeded) : '  ';
	return prefix.text + segStr + pad + outcomeStr;
}
```

> **Note to implementer**: The `renderSegments` and `renderOutcome` internal helpers are not exported. The composed `formatDetails` is the public API. The actual implementation may need adjustment to exactly match the old `styleFeedLine` behavior — the side-by-side test in Task 6 will catch any drift.

**Step 4: Run tests to verify they pass**

Run: `npx vitest run source/feed/cellFormatters.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add source/feed/cellFormatters.ts source/feed/cellFormatters.test.ts
git commit -m "feat(feed): add renderSegments, renderOutcome, and formatDetails"
```

---

### Task 5: Pre-compute `duplicateActor` on `TimelineEntry`

Add `duplicateActor: boolean` to `TimelineEntry` and compute it in `useTimeline()`.

**Files:**

- Modify: `source/feed/timeline.ts:28-47` (add field to type)
- Modify: `source/hooks/useTimeline.ts` (compute after building entries)
- Modify: `source/hooks/useTodoPanel.test.ts` (add field to any test fixtures)
- Modify: `source/feed/timeline.test.ts` (add field to any test fixtures)
- Modify: `source/utils/buildBodyLines.test.ts` (add field to any test fixtures)

**Step 1: Write the failing test**

Add a new test in `source/hooks/useTimeline.ts` test file (or create a focused test). Since `useTimeline` is a React hook, test the computation logic directly. Add a helper function that computes duplicateActor on an array:

First, add the test expectation to an existing timeline test that creates entries — verify the new field exists and is correctly set.

If no unit test file exists for `useTimeline`, add the computation as a standalone exported function:

```ts
// In source/feed/timeline.ts (or cellFormatters.ts):
export function computeDuplicateActors(entries: TimelineEntry[]): void {
	for (let i = 0; i < entries.length; i++) {
		entries[i]!.duplicateActor =
			i > 0 && entries[i]!.actorId === entries[i - 1]!.actorId;
	}
}
```

Test:

```ts
// In source/feed/cellFormatters.test.ts (or timeline.test.ts)
import {computeDuplicateActors} from './timeline.js';

describe('computeDuplicateActors', () => {
	test('marks consecutive same-actor entries as duplicate', () => {
		const entries = [
			{actorId: 'a'},
			{actorId: 'a'},
			{actorId: 'b'},
			{actorId: 'b'},
		] as TimelineEntry[];
		computeDuplicateActors(entries);
		expect(entries[0]!.duplicateActor).toBe(false);
		expect(entries[1]!.duplicateActor).toBe(true);
		expect(entries[2]!.duplicateActor).toBe(false);
		expect(entries[3]!.duplicateActor).toBe(true);
	});

	test('first entry is never duplicate', () => {
		const entries = [{actorId: 'a'}] as TimelineEntry[];
		computeDuplicateActors(entries);
		expect(entries[0]!.duplicateActor).toBe(false);
	});

	test('empty array is a no-op', () => {
		const entries: TimelineEntry[] = [];
		computeDuplicateActors(entries);
		expect(entries).toHaveLength(0);
	});
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/feed/cellFormatters.test.ts`
Expected: FAIL — computeDuplicateActors not found

**Step 3: Implement**

In `source/feed/timeline.ts`, add to `TimelineEntry`:

```ts
export type TimelineEntry = {
	// ... existing fields ...
	duplicateActor: boolean;
};
```

Add the exported function:

```ts
export function computeDuplicateActors(entries: TimelineEntry[]): void {
	for (let i = 0; i < entries.length; i++) {
		entries[i]!.duplicateActor =
			i > 0 && entries[i]!.actorId === entries[i - 1]!.actorId;
	}
}
```

In `source/hooks/useTimeline.ts`, call it after building the entries array:

```ts
import {computeDuplicateActors} from '../feed/timeline.js';
// ... after entries are built:
computeDuplicateActors(entries);
```

**Update all test fixtures** that create `TimelineEntry` objects — add `duplicateActor: false` to each. Files to check:

- `source/feed/timeline.test.ts`
- `source/utils/buildBodyLines.test.ts`
- `source/hooks/useTodoPanel.test.ts`
- Any other file importing `TimelineEntry`

**Step 4: Run all tests**

Run: `npx vitest run source/`
Expected: PASS (all tests, including existing ones with updated fixtures)

**Step 5: Run typecheck**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 6: Commit**

```bash
git add source/feed/timeline.ts source/hooks/useTimeline.ts source/feed/cellFormatters.test.ts \
  source/feed/timeline.test.ts source/utils/buildBodyLines.test.ts source/hooks/useTodoPanel.test.ts
git commit -m "feat(feed): pre-compute duplicateActor on TimelineEntry"
```

---

### Task 6: Side-by-side verification test

Prove that the new formatters produce byte-identical stripped output compared to the old `formatFeedLine` + `styleFeedLine` path.

**Files:**

- Create: `source/feed/cellFormatters.verify.test.ts` (temporary — deleted after Phase 2 sign-off)
- Reference: `source/feed/timeline.ts:666-742`, `source/feed/feedLineStyle.ts:65-240`

**Step 1: Write the verification test**

```ts
// source/feed/cellFormatters.verify.test.ts
import {describe, test, expect} from 'vitest';
import stripAnsi from 'strip-ansi';
import chalk from 'chalk';
import {darkTheme} from '../theme/themes.js';
import {formatFeedLine, type TimelineEntry} from './timeline.js';
import {styleFeedLine} from './feedLineStyle.js';
import {
	formatGutter,
	formatTime,
	formatEvent,
	formatActor,
	formatTool,
	formatSuffix,
	formatDetails,
} from './cellFormatters.js';

const theme = darkTheme;
const WIDTH = 80;

// Helper: assemble a line from the new formatters
function assembleNewLine(
	entry: TimelineEntry,
	width: number,
	focused: boolean,
	expanded: boolean,
	matched: boolean,
	ascii: boolean,
	duplicateActor: boolean,
	categoryBreak: boolean,
	minuteBreak: boolean,
): string {
	const gutter = formatGutter({
		focused,
		matched,
		categoryBreak,
		minuteBreak,
		isUserBorder: entry.opTag === 'prompt' || entry.opTag === 'msg.user',
		ascii,
		theme,
	});
	const time = formatTime(entry.ts, 5, theme);
	const event = formatEvent(entry.op, 12, theme, entry.opTag);
	const actor = formatActor(
		entry.actor,
		duplicateActor,
		10,
		theme,
		entry.actorId,
	);
	const bodyWidth = Math.max(0, width - 3);
	const summaryWidth = Math.max(0, bodyWidth - 30);
	const details = formatDetails({
		segments: entry.summarySegments,
		summary: entry.summary,
		outcome: entry.summaryOutcome,
		outcomeZero: entry.summaryOutcomeZero,
		mode: 'full',
		contentWidth: summaryWidth,
		theme,
		opTag: entry.opTag,
		isError: entry.error,
	});
	const suffix = formatSuffix(entry.expandable, expanded, ascii, theme);
	// Assemble: gutter + time + ' ' + event + ' ' + actor + ' ' + details + suffix
	return (
		gutter +
		time +
		' ' +
		event +
		' ' +
		actor +
		' ' +
		stripAnsi(details) +
		suffix
	);
}

// Create snapshot entries covering all branches
function makeEntry(overrides: Partial<TimelineEntry>): TimelineEntry {
	return {
		id: 'test-1',
		ts: new Date('2025-06-15T14:30:00').getTime(),
		op: 'Tool OK',
		opTag: 'tool.ok',
		actor: 'AGENT',
		actorId: 'agent:root',
		toolColumn: 'Read',
		summary: 'src/app.tsx',
		summarySegments: [{text: 'src/app.tsx', role: 'target'}],
		searchText: 'src/app.tsx',
		error: false,
		expandable: false,
		details: '',
		duplicateActor: false,
		...overrides,
	};
}

describe('side-by-side: new formatters match old output', () => {
	const cases: Array<{
		name: string;
		entry: TimelineEntry;
		focused?: boolean;
		expanded?: boolean;
		matched?: boolean;
		duplicateActor?: boolean;
		categoryBreak?: boolean;
	}> = [
		{name: 'tool.ok basic', entry: makeEntry({})},
		{
			name: 'tool.fail error',
			entry: makeEntry({opTag: 'tool.fail', op: 'Tool Fail', error: true}),
		},
		{
			name: 'agent message',
			entry: makeEntry({
				opTag: 'agent.msg',
				op: 'Agent Msg',
				toolColumn: '',
				summary: 'Hello user',
			}),
		},
		{name: 'with outcome', entry: makeEntry({summaryOutcome: '120 lines'})},
		{
			name: 'outcome zero',
			entry: makeEntry({summaryOutcome: '0 files', summaryOutcomeZero: true}),
		},
		{name: 'duplicate actor', entry: makeEntry({}), duplicateActor: true},
		{name: 'expandable collapsed', entry: makeEntry({expandable: true})},
		{
			name: 'expandable expanded',
			entry: makeEntry({expandable: true}),
			expanded: true,
		},
		{name: 'category break', entry: makeEntry({}), categoryBreak: true},
		{
			name: 'long path truncation',
			entry: makeEntry({
				summary: 'src/very/deeply/nested/path/to/component.tsx',
				summarySegments: [
					{
						text: 'src/very/deeply/nested/path/to/component.tsx',
						role: 'target',
					},
				],
			}),
		},
	];

	for (const tc of cases) {
		test(`stripped text matches: ${tc.name}`, () => {
			const focused = tc.focused ?? false;
			const expanded = tc.expanded ?? false;
			const matched = tc.matched ?? false;
			const dup = tc.duplicateActor ?? false;

			// Old path
			const {line, summarySegments} = formatFeedLine(
				tc.entry,
				WIDTH,
				focused,
				expanded,
				matched,
				false,
				dup,
			);
			const oldStyled = styleFeedLine(line, {
				focused,
				matched,
				actorId: tc.entry.actorId,
				isError: tc.entry.error,
				theme,
				opTag: tc.entry.opTag,
				summarySegments,
				outcomeZero: tc.entry.summaryOutcomeZero,
				categoryBreak: tc.categoryBreak ?? false,
				duplicateActor: dup,
			});
			const oldStripped = stripAnsi(oldStyled);

			// New path
			const newLine = assembleNewLine(
				tc.entry,
				WIDTH,
				focused,
				expanded,
				matched,
				false,
				dup,
				tc.categoryBreak ?? false,
				false,
			);

			expect(newLine).toBe(oldStripped);
		});
	}
});
```

**Step 2: Run the verification tests**

Run: `npx vitest run source/feed/cellFormatters.verify.test.ts`
Expected: PASS — if any fail, fix the formatter to match

**Step 3: Iterate on failures**

If stripped text doesn't match, the diff will show exactly which column is off. Fix the formatter, re-run. This is the most important step — it proves behavioral equivalence.

**Step 4: Commit**

```bash
git add source/feed/cellFormatters.verify.test.ts
git commit -m "test(feed): side-by-side verification of new formatters vs old path"
```

---

### Task 7: Run full suite, typecheck, lint

Final validation that nothing is broken.

**Files:** None modified — validation only.

**Step 1: Run full test suite**

Run: `npx vitest run source/`
Expected: ALL PASS

**Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Lint**

Run: `npm run lint`
Expected: Clean

**Step 4: Final commit if any lint fixes needed**

```bash
git add -A && git commit -m "chore: lint fixes for Phase 2 formatters"
```

---

## File Inventory (after Phase 2)

```
NEW:
  source/feed/cellFormatters.ts              — all pure formatters (9 exports)
  source/feed/cellFormatters.test.ts         — formatter unit tests
  source/feed/cellFormatters.verify.test.ts  — side-by-side verification (temporary)

MODIFIED:
  source/feed/timeline.ts                    — TimelineEntry.duplicateActor + computeDuplicateActors()
  source/hooks/useTimeline.ts                — calls computeDuplicateActors()
  source/feed/timeline.test.ts               — fixture updates (duplicateActor field)
  source/utils/buildBodyLines.test.ts        — fixture updates
  source/hooks/useTodoPanel.test.ts          — fixture updates

UNCHANGED:
  source/feed/feedLineStyle.ts               — old code path still active
  All Ink components                         — not touched until Phase 3
```

## Exit Criteria

1. ✅ `cellFormatters.ts` exports: `fit`, `opCategoryColor`, `formatGutter`, `formatTime`, `formatEvent`, `formatActor`, `formatTool`, `formatSuffix`, `buildDetailsPrefix`, `layoutTargetAndOutcome`, `formatDetails`
2. ✅ Every formatter takes `contentWidth` — no formatter computes gaps
3. ✅ All chalk styling in formatters, zero `<Text>` style props
4. ✅ `formatDetails` split into composable functions
5. ✅ `duplicateActor` pre-computed on `TimelineEntry`
6. ✅ Pure-function tests pass with width invariants
7. ✅ Side-by-side verification confirms byte-identical stripped output
8. ✅ Existing UI unchanged — old code path still active
