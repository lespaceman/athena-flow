# Workflow-First Header Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the current `buildFrameLines()` header with a pure-function pipeline (`buildHeaderModel()` → `renderHeaderLines()`) that renders a stable 2-line workflow-first header.

**Architecture:** Two pure functions: `buildHeaderModel()` assembles a flat `HeaderModel` from existing app state + optional `workflow_ref` CLI arg; `renderHeaderLines()` renders it to exactly 3 lines (2 header + separator) with deterministic truncation. A small `statusBadge.ts` module handles glyph/color mapping with NO_COLOR fallback.

**Tech Stack:** TypeScript, vitest, chalk (for ANSI coloring in pure strings), string-width (already in project)

---

### Task 1: Create statusBadge.ts

**Files:**

- Create: `source/utils/statusBadge.ts`

**Step 1: Write the failing test**

Create `source/utils/statusBadge.test.ts`:

```typescript
import {describe, it, expect} from 'vitest';
import {getStatusBadge, type HeaderStatus} from './statusBadge.js';

describe('getStatusBadge', () => {
	it('returns colored glyph + label when hasColor is true', () => {
		const badge = getStatusBadge('running', true);
		expect(badge).toContain('RUNNING');
		expect(badge).toContain('●');
	});

	it('returns text-only fallback when hasColor is false', () => {
		expect(getStatusBadge('running', false)).toBe('[RUN]');
		expect(getStatusBadge('succeeded', false)).toBe('[OK]');
		expect(getStatusBadge('failed', false)).toBe('[FAIL]');
		expect(getStatusBadge('stopped', false)).toBe('[STOP]');
		expect(getStatusBadge('idle', false)).toBe('[IDLE]');
	});

	it('all statuses produce non-empty output', () => {
		const statuses: HeaderStatus[] = [
			'running',
			'succeeded',
			'failed',
			'stopped',
			'idle',
		];
		for (const s of statuses) {
			expect(getStatusBadge(s, true).length).toBeGreaterThan(0);
			expect(getStatusBadge(s, false).length).toBeGreaterThan(0);
		}
	});
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/utils/statusBadge.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

Create `source/utils/statusBadge.ts`:

```typescript
import chalk from 'chalk';

export type HeaderStatus =
	| 'running'
	| 'succeeded'
	| 'failed'
	| 'stopped'
	| 'idle';

type BadgeDef = {glyph: string; label: string; color: (s: string) => string};

const BADGES: Record<HeaderStatus, BadgeDef> = {
	running: {glyph: '●', label: 'RUNNING', color: chalk.cyan},
	succeeded: {glyph: '●', label: 'SUCCEEDED', color: chalk.green},
	failed: {glyph: '■', label: 'FAILED', color: chalk.red},
	stopped: {glyph: '■', label: 'STOPPED', color: chalk.yellow},
	idle: {glyph: '●', label: 'IDLE', color: chalk.dim},
};

const NO_COLOR_BADGES: Record<HeaderStatus, string> = {
	running: '[RUN]',
	succeeded: '[OK]',
	failed: '[FAIL]',
	stopped: '[STOP]',
	idle: '[IDLE]',
};

export function getStatusBadge(
	status: HeaderStatus,
	hasColor: boolean,
): string {
	if (!hasColor) return NO_COLOR_BADGES[status];
	const b = BADGES[status];
	return b.color(`${b.glyph} ${b.label}`);
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run source/utils/statusBadge.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add source/utils/statusBadge.ts source/utils/statusBadge.test.ts
git commit -m "feat(header): add statusBadge module with NO_COLOR fallback"
```

---

### Task 2: Create HeaderModel type and buildHeaderModel()

**Files:**

- Create: `source/utils/headerModel.ts`

**Step 1: Write the failing test**

Create `source/utils/headerModel.test.ts`:

```typescript
import {describe, it, expect} from 'vitest';
import {buildHeaderModel} from './headerModel.js';

const baseInput = {
	session: {session_id: 'abc123', agent_type: 'claude-code'},
	currentRun: null as {
		run_id: string;
		trigger: {prompt_preview?: string};
		started_at: number;
	} | null,
	runSummaries: [] as {status: string; endedAt?: number}[],
	metrics: {failures: 0, blocks: 0},
	todoPanel: {doneCount: 0, doingCount: 0, todoItems: {length: 0}},
	tailFollow: false,
	now: 1000000,
};

describe('buildHeaderModel', () => {
	it('returns idle status when no run exists', () => {
		const model = buildHeaderModel(baseInput);
		expect(model.status).toBe('idle');
		expect(model.session_id_short).toBeTruthy();
		expect(model.run_id_short).toBeUndefined();
		expect(model.elapsed_ms).toBeUndefined();
	});

	it('returns running status with active run', () => {
		const model = buildHeaderModel({
			...baseInput,
			currentRun: {
				run_id: 'run1',
				trigger: {prompt_preview: 'Fix the bug'},
				started_at: 999000,
			},
		});
		expect(model.status).toBe('running');
		expect(model.run_title).toBe('Fix the bug');
		expect(model.elapsed_ms).toBe(1000);
		expect(model.run_id_short).toBeTruthy();
	});

	it('prefers workflow_ref over run_title', () => {
		const model = buildHeaderModel({
			...baseInput,
			currentRun: {
				run_id: 'run1',
				trigger: {prompt_preview: 'Fix the bug'},
				started_at: 999000,
			},
			workflowRef: 'web.login.smoke@7c91f2',
		});
		expect(model.workflow_ref).toBe('web.login.smoke@7c91f2');
		expect(model.run_title).toBe('Fix the bug');
	});

	it('derives status from last runSummary when no active run', () => {
		const model = buildHeaderModel({
			...baseInput,
			runSummaries: [{status: 'FAILED', endedAt: 998000}],
		});
		expect(model.status).toBe('failed');
		expect(model.ended_at).toBe(998000);
	});

	it('includes progress only when total > 0', () => {
		const noProgress = buildHeaderModel(baseInput);
		expect(noProgress.progress).toBeUndefined();

		const withProgress = buildHeaderModel({
			...baseInput,
			todoPanel: {doneCount: 3, doingCount: 1, todoItems: {length: 10}},
		});
		expect(withProgress.progress).toEqual({done: 3, total: 10});
	});

	it('maps metrics correctly', () => {
		const model = buildHeaderModel({
			...baseInput,
			metrics: {failures: 5, blocks: 2},
		});
		expect(model.err_count).toBe(5);
		expect(model.block_count).toBe(2);
	});
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/utils/headerModel.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

Create `source/utils/headerModel.ts`:

```typescript
import {formatSessionLabel, formatRunLabel} from './format.js';
import type {HeaderStatus} from './statusBadge.js';

export type {HeaderStatus} from './statusBadge.js';

export interface HeaderModel {
	workflow_ref?: string;
	run_title?: string;
	session_id_short: string;
	run_id_short?: string;
	engine?: string;

	progress?: {done: number; total: number};

	status: HeaderStatus;
	err_count: number;
	block_count: number;

	elapsed_ms?: number;
	ended_at?: number;

	tail_mode: boolean;
}

export interface HeaderModelInput {
	session: {session_id?: string; agent_type?: string} | null;
	currentRun: {
		run_id: string;
		trigger: {prompt_preview?: string};
		started_at: number;
	} | null;
	runSummaries: {status: string; endedAt?: number}[];
	metrics: {failures: number; blocks: number};
	todoPanel: {
		doneCount: number;
		doingCount: number;
		todoItems: {length: number};
	};
	tailFollow: boolean;
	now: number;
	workflowRef?: string;
}

export function buildHeaderModel(input: HeaderModelInput): HeaderModel {
	const {
		session,
		currentRun,
		runSummaries,
		metrics,
		todoPanel,
		tailFollow,
		now,
		workflowRef,
	} = input;

	const status: HeaderStatus = (() => {
		if (currentRun) return 'running';
		const tail = runSummaries[runSummaries.length - 1];
		if (!tail) return 'idle';
		if (tail.status === 'FAILED') return 'failed';
		if (tail.status === 'CANCELLED') return 'stopped';
		if (tail.status === 'SUCCEEDED') return 'succeeded';
		return 'idle';
	})();

	const progress =
		todoPanel.todoItems.length > 0
			? {done: todoPanel.doneCount, total: todoPanel.todoItems.length}
			: undefined;

	const lastSummary = runSummaries[runSummaries.length - 1];

	return {
		workflow_ref: workflowRef,
		run_title: currentRun?.trigger.prompt_preview ?? undefined,
		session_id_short: formatSessionLabel(session?.session_id),
		run_id_short: currentRun ? formatRunLabel(currentRun.run_id) : undefined,
		engine: session?.agent_type ?? undefined,
		progress,
		status,
		err_count: metrics.failures,
		block_count: metrics.blocks,
		elapsed_ms: currentRun ? now - currentRun.started_at : undefined,
		ended_at:
			!currentRun && lastSummary?.endedAt ? lastSummary.endedAt : undefined,
		tail_mode: tailFollow,
	};
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run source/utils/headerModel.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add source/utils/headerModel.ts source/utils/headerModel.test.ts
git commit -m "feat(header): add HeaderModel type and buildHeaderModel()"
```

---

### Task 3: Create renderHeaderLines()

**Files:**

- Create: `source/utils/renderHeaderLines.ts`
- Create: `source/utils/renderHeaderLines.test.ts`

This is the largest task. The test file covers invariants, truncation order, golden snapshots, and conditional rendering.

**Step 1: Write the failing tests**

Create `source/utils/renderHeaderLines.test.ts`:

```typescript
import {describe, it, expect} from 'vitest';
import stripAnsi from 'strip-ansi';
import {renderHeaderLines} from './renderHeaderLines.js';
import type {HeaderModel} from './headerModel.js';

function stripped(lines: string[]): string[] {
	return lines.map(l => stripAnsi(l));
}

const fullModel: HeaderModel = {
	workflow_ref: 'web.login.smoke@7c91f2',
	run_title: 'Fix the login bug',
	session_id_short: 'S1',
	run_id_short: 'R3',
	engine: 'claude-code',
	progress: {done: 3, total: 12},
	status: 'running',
	err_count: 2,
	block_count: 1,
	elapsed_ms: 264_000, // 4m24s
	tail_mode: false,
};

const idleModel: HeaderModel = {
	session_id_short: 'S1',
	status: 'idle',
	err_count: 0,
	block_count: 0,
	tail_mode: false,
};

describe('renderHeaderLines invariants', () => {
	const widths = [60, 80, 100, 120];
	const models = [
		fullModel,
		idleModel,
		{...fullModel, status: 'failed' as const},
	];

	for (const width of widths) {
		for (const model of models) {
			it(`always returns exactly 3 lines (width=${width}, status=${model.status})`, () => {
				const lines = renderHeaderLines(model, width, true);
				expect(lines).toHaveLength(3);
			});

			it(`no line exceeds width-1 chars (width=${width}, status=${model.status})`, () => {
				const lines = stripped(renderHeaderLines(model, width, true));
				for (const line of lines) {
					expect(line.length).toBeLessThanOrEqual(width - 1);
				}
			});
		}
	}

	it('right rail is stable across status changes at same width', () => {
		const statuses = [
			'running',
			'succeeded',
			'failed',
			'stopped',
			'idle',
		] as const;
		const width = 100;
		const railPositions = statuses.map(s => {
			const lines = stripped(
				renderHeaderLines({...fullModel, status: s}, width, true),
			);
			// Find position of status badge (last non-space content on line 1)
			const line1 = lines[0]!;
			return line1.length - line1.trimEnd().length;
		});
		// All should have same trailing space pattern (rail at same position)
		expect(new Set(railPositions).size).toBe(1);
	});
});

describe('renderHeaderLines truncation order', () => {
	it('drops engine before run id at narrow width', () => {
		const narrow = stripped(renderHeaderLines(fullModel, 70, false));
		const line1 = narrow[0]!;
		// Engine should be gone, run id should remain
		expect(line1).not.toContain('claude-code');
		expect(line1).toContain('R3');
	});

	it('drops run id only after engine is already gone', () => {
		const veryNarrow = stripped(renderHeaderLines(fullModel, 55, false));
		const line1 = veryNarrow[0]!;
		expect(line1).not.toContain('claude-code');
		expect(line1).not.toContain('R3');
		// But workflow label must remain
		expect(line1).toContain('workflow:');
	});

	it('never drops ATHENA or status badge', () => {
		const tiny = stripped(renderHeaderLines(fullModel, 40, false));
		const line1 = tiny[0]!;
		expect(line1).toContain('ATHENA');
		expect(line1).toMatch(/\[RUN\]|RUNNING/);
	});
});

describe('renderHeaderLines content', () => {
	it('shows workflow: label when workflow_ref is set', () => {
		const lines = stripped(renderHeaderLines(fullModel, 120, false));
		expect(lines[0]).toContain('workflow: web.login.smoke@7c91f2');
	});

	it('shows run: label when only run_title is set', () => {
		const model = {...fullModel, workflow_ref: undefined};
		const lines = stripped(renderHeaderLines(model, 120, false));
		expect(lines[0]).toContain('run: Fix the login bug');
	});

	it('shows progress on line 2 when total > 0', () => {
		const lines = stripped(renderHeaderLines(fullModel, 120, false));
		expect(lines[1]).toContain('progress: 3/12');
	});

	it('omits progress when not present', () => {
		const model = {...fullModel, progress: undefined};
		const lines = stripped(renderHeaderLines(model, 120, false));
		expect(lines[1]).not.toContain('progress');
	});

	it('shows elapsed on line 2 during active run', () => {
		const lines = stripped(renderHeaderLines(fullModel, 120, false));
		expect(lines[1]).toMatch(/elapsed\s+\d+m\d+s/);
	});

	it('shows ended time when run complete', () => {
		const model = {
			...fullModel,
			status: 'succeeded' as const,
			elapsed_ms: undefined,
			ended_at: 1708444497000,
		};
		const lines = stripped(renderHeaderLines(model, 120, false));
		expect(lines[1]).toContain('ended');
	});

	it('shows err and blk only when > 0', () => {
		const lines = stripped(renderHeaderLines(fullModel, 120, false));
		expect(lines[1]).toContain('err 2');
		expect(lines[1]).toContain('blk 1');
	});

	it('hides err and blk when both zero', () => {
		const model = {...fullModel, err_count: 0, block_count: 0};
		const lines = stripped(renderHeaderLines(model, 120, false));
		expect(lines[1]).not.toContain('err');
		expect(lines[1]).not.toContain('blk');
	});

	it('idle state shows minimal header', () => {
		const lines = stripped(renderHeaderLines(idleModel, 80, false));
		expect(lines[0]).toContain('ATHENA');
		expect(lines[0]).toContain('[IDLE]');
		expect(lines[0]).not.toContain('run');
		expect(lines[1]).not.toContain('elapsed');
	});

	it('separator line is dim dashes of width-1', () => {
		const lines = stripped(renderHeaderLines(fullModel, 80, false));
		expect(lines[2]).toMatch(/^─+$/);
		expect(lines[2]!.length).toBe(79);
	});
});

describe('renderHeaderLines NO_COLOR', () => {
	it('uses text badges when hasColor is false', () => {
		const lines = renderHeaderLines(fullModel, 120, false);
		// No ANSI escape sequences
		for (const line of lines) {
			expect(line).not.toMatch(/\x1b\[/);
		}
		expect(lines[0]).toContain('[RUN]');
	});

	it('uses colored badges when hasColor is true', () => {
		const lines = renderHeaderLines(fullModel, 120, true);
		// Should contain ANSI sequences
		expect(lines.some(l => /\x1b\[/.test(l))).toBe(true);
	});
});

describe('renderHeaderLines clock format', () => {
	it('shows HH:MM:SS at 80+ width', () => {
		const lines = stripped(renderHeaderLines(fullModel, 100, false));
		// Clock should be HH:MM:SS format (8 chars with colons)
		expect(lines[0]).toMatch(/\d{2}:\d{2}:\d{2}/);
	});
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run source/utils/renderHeaderLines.test.ts`
Expected: FAIL — module not found

**Step 3: Write the implementation**

Create `source/utils/renderHeaderLines.ts`:

```typescript
import chalk from 'chalk';
import stringWidth from 'string-width';
import {getStatusBadge} from './statusBadge.js';
import {formatDuration} from './formatters.js';
import {formatClock} from './format.js';
import type {HeaderModel} from './headerModel.js';

/**
 * Renders the workflow-first header as exactly 3 lines:
 * - Line 1: title + status rail
 * - Line 2: progress/time + health rail
 * - Line 3: dim separator
 *
 * All lines are at most `width - 1` chars (wrap-guard).
 */
export function renderHeaderLines(
	model: HeaderModel,
	width: number,
	hasColor: boolean,
): [string, string, string] {
	const maxLen = Math.max(10, width - 1);

	// ── Status badge (right rail, line 1) ──
	const badge = getStatusBadge(model.status, hasColor);
	const badgeVisual = hasColor ? stringWidth(badge) : badge.length;

	// ── Clock (right rail, line 1) ──
	const now = Date.now();
	const fullClock = formatClock(now); // HH:MM:SS (8 chars)
	const shortClock = fullClock.slice(0, 5); // HH:MM (5 chars)

	// Right rail: "  <badge>  <clock>" — fixed width
	const railGap = 2;
	const fullRailWidth = railGap + badgeVisual + railGap + 8; // badge + HH:MM:SS
	const shortRailWidth = railGap + badgeVisual + railGap + 5; // badge + HH:MM

	const useShortClock = maxLen < 70;
	const clock = useShortClock ? shortClock : fullClock;
	const railWidth = useShortClock ? shortRailWidth : fullRailWidth;

	const rightRail1 = hasColor ? `  ${badge}  ${clock}` : `  ${badge}  ${clock}`;

	// ── Left tokens (line 1) ──
	const leftBudget1 = maxLen - railWidth;
	const line1Left = buildLine1Left(model, leftBudget1, hasColor);

	// ── Line 1 assembly ──
	const line1 = padLine(line1Left, rightRail1, maxLen, hasColor);

	// ── Right rail (line 2): err/blk ──
	const healthParts: string[] = [];
	if (model.err_count > 0) {
		healthParts.push(
			hasColor ? chalk.red(`err ${model.err_count}`) : `err ${model.err_count}`,
		);
	}
	if (model.block_count > 0) {
		healthParts.push(
			hasColor
				? chalk.yellow(`blk ${model.block_count}`)
				: `blk ${model.block_count}`,
		);
	}
	const rightRail2 = healthParts.length > 0 ? `  ${healthParts.join(' ')}` : '';
	const rightRail2Visual =
		healthParts.length > 0
			? 2 +
				healthParts.reduce(
					(acc, p) => acc + (hasColor ? stringWidth(p) : p.length),
					0,
				) +
				(healthParts.length - 1)
			: 0;

	// ── Left tokens (line 2) ──
	const leftBudget2 = maxLen - rightRail2Visual;
	const line2Left = buildLine2Left(model, leftBudget2, hasColor);

	// ── Line 2 assembly ──
	const line2 = padLine(line2Left, rightRail2, maxLen, hasColor);

	// ── Line 3: separator ──
	const sep = hasColor ? chalk.dim('─'.repeat(maxLen)) : '─'.repeat(maxLen);

	return [line1, line2, sep];
}

function buildLine1Left(
	model: HeaderModel,
	budget: number,
	hasColor: boolean,
): string {
	const athena = hasColor ? chalk.bold('ATHENA') : 'ATHENA';
	const athenaWidth = 6; // "ATHENA"

	// Tokens to add in priority order (last dropped first)
	type Token = {text: string; visualWidth: number};
	const tokens: Token[] = [];

	// Title token (workflow: or run:)
	if (model.workflow_ref) {
		const label = hasColor ? chalk.dim('workflow: ') : 'workflow: ';
		const labelWidth = 10; // "workflow: "
		const maxValueWidth = Math.max(
			1,
			budget - athenaWidth - 3 - labelWidth - 3,
		); // 3 for " · "
		const value = truncateStr(model.workflow_ref, maxValueWidth);
		tokens.push({
			text: `${label}${value}`,
			visualWidth: labelWidth + value.length,
		});
	} else if (model.run_title) {
		const label = hasColor ? chalk.dim('run: ') : 'run: ';
		const labelWidth = 5;
		const maxValueWidth = Math.max(
			1,
			budget - athenaWidth - 3 - labelWidth - 3,
		);
		const value = truncateStr(model.run_title, maxValueWidth);
		tokens.push({
			text: `${label}${value}`,
			visualWidth: labelWidth + value.length,
		});
	}

	// Run ID token
	if (model.run_id_short) {
		const label = hasColor ? chalk.dim('run ') : 'run ';
		tokens.push({
			text: `${label}${model.run_id_short}`,
			visualWidth: 4 + model.run_id_short.length,
		});
	}

	// Engine token (dropped first when tight)
	if (model.engine) {
		tokens.push({text: model.engine, visualWidth: model.engine.length});
	}

	// Build from most important to least, drop from the end
	const sep = ' · ';
	const sepWidth = 3;

	// Calculate total width needed
	let totalWidth = athenaWidth;
	const included: Token[] = [];
	for (const token of tokens) {
		const needed = sepWidth + token.visualWidth;
		if (totalWidth + needed <= budget) {
			included.push(token);
			totalWidth += needed;
		}
	}

	// If title token doesn't fit, still try to include it truncated
	if (included.length === 0 && tokens.length > 0 && tokens[0]) {
		const titleToken = tokens[0];
		const available = budget - athenaWidth - sepWidth;
		if (available > 3) {
			const truncated = truncateStr(hasColor ? '' : '', 0);
			// Re-derive with available budget
			if (model.workflow_ref) {
				const label = 'workflow: ';
				const valBudget = Math.max(1, available - label.length);
				const val = truncateStr(model.workflow_ref, valBudget);
				included.push({
					text: `${hasColor ? chalk.dim(label) : label}${val}`,
					visualWidth: label.length + val.length,
				});
			} else if (model.run_title) {
				const label = 'run: ';
				const valBudget = Math.max(1, available - label.length);
				const val = truncateStr(model.run_title, valBudget);
				included.push({
					text: `${hasColor ? chalk.dim(label) : label}${val}`,
					visualWidth: label.length + val.length,
				});
			}
		}
	}

	const parts = [athena, ...included.map(t => t.text)];
	return parts.join(sep);
}

function buildLine2Left(
	model: HeaderModel,
	budget: number,
	hasColor: boolean,
): string {
	const parts: string[] = [];

	if (model.progress) {
		const label = hasColor ? chalk.dim('progress: ') : 'progress: ';
		parts.push(`${label}${model.progress.done}/${model.progress.total}`);
	}

	if (model.elapsed_ms !== undefined) {
		const label = hasColor ? chalk.dim('elapsed ') : 'elapsed ';
		parts.push(
			`${label}${formatDuration(Math.floor(model.elapsed_ms / 1000))}`,
		);
	} else if (model.ended_at !== undefined) {
		const label = hasColor ? chalk.dim('ended ') : 'ended ';
		parts.push(`${label}${formatClock(model.ended_at)}`);
	}

	return parts.join(' · ');
}

function truncateStr(s: string, max: number): string {
	if (s.length <= max) return s;
	if (max <= 1) return '…';
	return s.slice(0, max - 1) + '…';
}

function padLine(
	left: string,
	right: string,
	maxLen: number,
	hasColor: boolean,
): string {
	const leftWidth = hasColor ? stringWidth(left) : left.length;
	const rightWidth = hasColor ? stringWidth(right) : right.length;
	const gap = Math.max(0, maxLen - leftWidth - rightWidth);
	return left + ' '.repeat(gap) + right;
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run source/utils/renderHeaderLines.test.ts`
Expected: PASS

**Step 5: Iterate on any failing tests**

The truncation logic may need adjustment. Fix until all tests pass.

**Step 6: Commit**

```bash
git add source/utils/renderHeaderLines.ts source/utils/renderHeaderLines.test.ts
git commit -m "feat(header): add renderHeaderLines with truncation and NO_COLOR support"
```

---

### Task 4: Add --workflow CLI arg

**Files:**

- Modify: `source/cli.tsx:63-93` (flags section)
- Modify: `source/cli.tsx:168-181` (render call)
- Modify: `source/app.tsx:37-48` (Props type)
- Modify: `source/app.tsx:83-99` (AppContent params)

**Step 1: Add `workflow` flag to meow config**

In `source/cli.tsx`, add to the flags object (around line 92):

```typescript
workflow: {
	type: 'string',
},
```

And add to the help text (around line 40):

```
		--workflow       Workflow reference displayed in header (e.g. name@rev)
```

**Step 2: Thread `workflowRef` through App props**

In `source/app.tsx` Props type, add:

```typescript
workflowRef?: string;
```

Pass it from `cli.tsx` render call:

```typescript
workflowRef={cli.flags.workflow}
```

Thread through `AppContent` params.

**Step 3: Run lint + typecheck**

Run: `npm run lint && npx tsc --noEmit`
Expected: PASS

**Step 4: Commit**

```bash
git add source/cli.tsx source/app.tsx
git commit -m "feat(cli): add --workflow flag for header workflow reference"
```

---

### Task 5: Wire new header into app.tsx

**Files:**

- Modify: `source/app.tsx:551-586` (frame lines section)
- Modify: `source/app.tsx:634-639` (render section)

**Step 1: Replace buildFrameLines header with new pipeline**

In `source/app.tsx`, the frame lines section (around line 551-586) currently calls `buildFrameLines()`. Replace the header lines with:

```typescript
import {buildHeaderModel} from './utils/headerModel.js';
import {renderHeaderLines} from './utils/renderHeaderLines.js';
```

In the frame lines section, add after the existing `buildFrameLines` call:

```typescript
const hasColor = !process.env['NO_COLOR'];
const headerModel = buildHeaderModel({
	session,
	currentRun: currentRun
		? {
				run_id: currentRun.run_id,
				trigger: currentRun.trigger,
				started_at: currentRun.started_at,
			}
		: null,
	runSummaries,
	metrics,
	todoPanel,
	tailFollow: feedNav.tailFollow,
	now: Date.now(),
	workflowRef: props.workflowRef, // threaded from CLI
});
const [headerLine1, headerLine2, headerSep] = renderHeaderLines(
	headerModel,
	innerWidth,
	hasColor,
);
```

**Step 2: Update the render section**

Replace the header lines in the JSX (around line 636-639). Currently:

```tsx
<Text>{frameLine(frame.headerLine1)}</Text>
<Text>{frameLine(frame.headerLine2)}</Text>
<Text>{sectionBorder}</Text>
```

Replace with:

```tsx
<Text>{frameLine(headerLine1)}</Text>
<Text>{frameLine(headerLine2)}</Text>
<Text>{frameLine(headerSep)}</Text>
```

Note: `buildFrameLines` still provides `footerHelp` and `inputLine` — those stay unchanged. Only the header lines are replaced.

**Step 3: Run typecheck + tests**

Run: `npx tsc --noEmit && npm test`
Expected: PASS

**Step 4: Commit**

```bash
git add source/app.tsx
git commit -m "feat(header): wire renderHeaderLines into app, replacing buildFrameLines header"
```

---

### Task 6: Clean up buildFrameLines

**Files:**

- Modify: `source/utils/buildFrameLines.ts`

**Step 1: Remove header line generation from buildFrameLines**

Since `buildFrameLines` still produces `footerHelp` and `inputLine`, keep the function but remove `headerLine1` and `headerLine2` from its return type and implementation. Update `FrameLines` type to only have `footerHelp` and `inputLine`.

**Step 2: Update callers**

Update `app.tsx` to only destructure `footerHelp` and `inputLine` from `buildFrameLines`.

**Step 3: Remove unused imports from buildFrameLines.ts**

Remove `formatSessionLabel`, `formatRunLabel`, `compactText` if no longer used there.

**Step 4: Run typecheck + lint + tests**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add source/utils/buildFrameLines.ts source/app.tsx
git commit -m "refactor: remove header generation from buildFrameLines"
```

---

### Task 7: Run full validation

**Step 1: Run all tests**

Run: `npm test`
Expected: All PASS

**Step 2: Run lint**

Run: `npm run lint`
Expected: PASS

**Step 3: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 4: Build**

Run: `npm run build`
Expected: PASS

**Step 5: Manual smoke test**

Run: `npm run start -- --workflow=smoke.test@abc123`
Verify: Header shows `ATHENA · workflow: smoke.test@abc123` with `● IDLE` badge.

---

### Task 8: Final review commit

If any adjustments were needed during validation, commit them here.

```bash
git add -A
git commit -m "chore: final adjustments for workflow-first header"
```
