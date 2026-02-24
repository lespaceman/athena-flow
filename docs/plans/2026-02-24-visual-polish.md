# Visual Polish Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Improve visual polish of the Athena CLI dashboard — agent messages, input area, dialogs, event separators, and user messages.

**Architecture:** All changes stay within the existing frame-based rendering pipeline (buildFrameLines → buildBodyLines → styleFeedLine → app.tsx). We add new theme fields, new glyphs, and modify styling functions. No structural changes to the feed model or event flow.

**Tech Stack:** Ink + chalk (terminal colors), existing theme/glyph registries, vitest for tests.

---

### Task 1: Add new theme fields for visual polish

**Files:**

- Modify: `source/theme/types.ts`
- Modify: `source/theme/themes.ts`

**Step 1: Write the failing test**

File: `source/theme/themes.test.ts` (create)

```typescript
import {describe, expect, it} from 'vitest';
import {darkTheme, lightTheme} from './themes.js';

describe('theme visual polish fields', () => {
	it('has dialog border colors', () => {
		expect(darkTheme.dialog).toEqual({
			borderPermission: expect.any(String),
			borderQuestion: expect.any(String),
		});
		expect(lightTheme.dialog).toEqual({
			borderPermission: expect.any(String),
			borderQuestion: expect.any(String),
		});
	});

	it('has inputPrompt accent color', () => {
		expect(darkTheme.inputPrompt).toEqual(expect.any(String));
		expect(lightTheme.inputPrompt).toEqual(expect.any(String));
	});

	it('has userMessage border color', () => {
		expect(darkTheme.userMessage.border).toEqual(expect.any(String));
		expect(lightTheme.userMessage.border).toEqual(expect.any(String));
	});
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/theme/themes.test.ts`
Expected: FAIL — `dialog`, `inputPrompt`, `userMessage.border` do not exist on Theme.

**Step 3: Add theme fields**

In `source/theme/types.ts`, add to the `Theme` type:

```typescript
// Add these fields to the Theme type:
dialog: {
	borderPermission: string;
	borderQuestion: string;
}
inputPrompt: string;
// Extend existing userMessage:
userMessage: {
	text: string;
	background: string;
	border: string; // NEW
}
```

In `source/theme/themes.ts`, add values:

Dark theme additions:

```typescript
dialog: {
	borderPermission: '#f9e2af',  // warning yellow — draws attention
	borderQuestion: '#89dceb',     // info blue — informational tone
},
inputPrompt: '#89b4fa',          // accent blue — matches frame border
// Update userMessage to include border:
userMessage: {
	text: '#bac2de',
	background: '#313244',
	border: '#89b4fa',            // accent blue left-border
},
```

Light theme additions:

```typescript
dialog: {
	borderPermission: '#df8e1d',  // warning yellow
	borderQuestion: '#1e66f5',     // info blue
},
inputPrompt: '#5c5cff',          // accent
userMessage: {
	text: '#4c4f69',
	background: '#ccd0da',
	border: '#5c5cff',            // accent
},
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run source/theme/themes.test.ts`
Expected: PASS

**Step 5: Run typecheck**

Run: `npx tsc --noEmit`
Expected: May have errors in files that destructure `userMessage` — those will be fixed in later tasks.

**Step 6: Commit**

```bash
git add source/theme/types.ts source/theme/themes.ts source/theme/themes.test.ts
git commit -m "feat(theme): add dialog, inputPrompt, and userMessage.border theme fields"
```

---

### Task 2: Agent message redesign — replace emoji with glyph

The `AgentMessageEvent` component uses `💬` emoji. Replace with `message.agent` glyph (`◆`) from the registry. This change is in the **component-based** rendering path (used when a feed event is expanded via `<HookEvent>`).

For the **frame-based** timeline path, agent messages already show as `agent.msg` op with summary text — no emoji there. The timeline `eventSummary` for `agent.message` just returns `compactText(event.data.message, 200)` which is fine.

**Files:**

- Modify: `source/components/AgentMessageEvent.tsx`

**Step 1: Write the failing test**

File: `source/components/AgentMessageEvent.test.tsx` (create)

```tsx
import {describe, expect, it} from 'vitest';
import React from 'react';
import {render} from 'ink-testing-library';
import AgentMessageEvent from './AgentMessageEvent.js';
import type {FeedEvent} from '../feed/types.js';

function makeAgentMessage(scope: 'root' | 'subagent'): FeedEvent {
	return {
		kind: 'agent.message',
		id: 'ev-1',
		seq: 1,
		ts: Date.now(),
		run_id: 'run-1',
		actor_id: scope === 'subagent' ? 'subagent:s1' : 'agent:root',
		level: 'info',
		data: {message: 'Hello world', scope},
	} as FeedEvent;
}

describe('AgentMessageEvent', () => {
	it('uses glyph instead of emoji for label', () => {
		const {lastFrame} = render(
			<AgentMessageEvent event={makeAgentMessage('root')} />,
		);
		const output = lastFrame();
		expect(output).not.toContain('💬');
		expect(output).toContain('Agent response');
	});

	it('uses subagent label for subagent scope', () => {
		const {lastFrame} = render(
			<AgentMessageEvent event={makeAgentMessage('subagent')} />,
		);
		const output = lastFrame();
		expect(output).not.toContain('💬');
		expect(output).toContain('Subagent response');
	});
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/components/AgentMessageEvent.test.tsx`
Expected: FAIL — output contains `💬`.

**Step 3: Replace emoji with glyph**

In `source/components/AgentMessageEvent.tsx`:

Replace the label construction (around line 27-28):

```typescript
// OLD:
const label =
	scope === 'subagent' ? '💬 Subagent response' : '💬 Agent response';

// NEW:
import {getGlyphs} from '../glyphs/index.js';

const g = getGlyphs();
const glyph = g['message.agent'];
const label =
	scope === 'subagent'
		? `${glyph} Subagent response`
		: `${glyph} Agent response`;
```

The `message.agent` glyph is `◆` (unicode) / `>` (ascii), which is a solid diamond — clean and distinctive.

**Step 4: Run test to verify it passes**

Run: `npx vitest run source/components/AgentMessageEvent.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add source/components/AgentMessageEvent.tsx source/components/AgentMessageEvent.test.tsx
git commit -m "feat(ui): replace agent message emoji with glyph"
```

---

### Task 3: Input area styling — accent color on `input>` prompt

The input line is built in `buildFrameLines.ts` as a plain string. Color must be applied in `app.tsx` where `frameLine(frame.inputLine)` is called, since `buildFrameLines` returns plain text and `frameLine()` wraps it in `│...│` borders.

**Approach:** Split the input line into prefix and rest in `buildFrameLines`, return both parts so `app.tsx` can colorize the prefix. Alternatively, apply chalk in `buildFrameLines` itself (simpler, since `fitAnsi` in `app.tsx` already handles ANSI).

We'll apply chalk directly in `buildFrameLines.ts` since `frameLine()` uses `fitAnsi()` which correctly measures ANSI-escaped strings.

**Files:**

- Modify: `source/utils/buildFrameLines.ts`

**Step 1: Write the failing test**

File: `source/utils/buildFrameLines.test.ts` (create)

```typescript
import {describe, expect, it, afterEach} from 'vitest';
import chalk from 'chalk';
import {buildFrameLines, type FrameContext} from './buildFrameLines.js';

function makeCtx(overrides: Partial<FrameContext> = {}): FrameContext {
	return {
		innerWidth: 80,
		focusMode: 'feed',
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
		accentColor: '#89b4fa',
		...overrides,
	};
}

describe('buildFrameLines input accent', () => {
	const savedLevel = chalk.level;
	afterEach(() => {
		chalk.level = savedLevel;
	});

	it('applies accent color to input> prefix', () => {
		chalk.level = 3;
		const ctx = makeCtx({accentColor: '#ff0000'});
		const {inputLine} = buildFrameLines(ctx);
		// The prefix "input> " should contain ANSI escape codes (colored)
		expect(inputLine).toContain('\u001B[');
		// And should still contain the text "input>"
		expect(inputLine).toContain('input>');
	});
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/utils/buildFrameLines.test.ts`
Expected: FAIL — `accentColor` is not a property of `FrameContext`, and the output contains no ANSI escapes.

**Step 3: Add accent color to input prompt**

In `source/utils/buildFrameLines.ts`:

Add `accentColor` to `FrameContext`:

```typescript
export type FrameContext = {
	// ... existing fields ...
	accentColor?: string; // NEW: hex color for input prompt accent
};
```

In `buildFrameLines()`, colorize the prefix:

```typescript
import chalk from 'chalk';

// Replace:
const inputPrefix = 'input> ';

// With:
const rawPrefix = 'input> ';
const inputPrefix = ctx.accentColor
	? chalk.hex(ctx.accentColor)(rawPrefix)
	: rawPrefix;
```

Then fix the width calculation — since the prefix is now ANSI-colored, its visual width differs from `.length`. Use the raw prefix length for width math:

```typescript
const inputContentWidth = Math.max(
	1,
	innerWidth - rawPrefix.length - badgeText.length, // use rawPrefix.length
);
```

And assemble:

```typescript
// Use fitAnsi-aware assembly:
import {fitAnsi} from './format.js';

const inputLine = fitAnsi(
	`${inputPrefix}${inputBuffer}${badgeText}`,
	innerWidth,
);
```

Wait — `buildFrameLines` currently uses `fit()` (non-ANSI-aware) for the final line. Since we're introducing ANSI in the prefix, switch to `fitAnsi`:

```typescript
// Change import:
import {fit, formatInputBuffer, fitAnsi} from './format.js';

// Change final assembly:
const inputLine = fitAnsi(
	`${inputPrefix}${inputBuffer}${badgeText}`,
	innerWidth,
);
```

**Step 4: Wire accentColor from app.tsx**

In `source/app.tsx`, where `buildFrameLines` is called (around line 577), pass the theme accent:

```typescript
const frame = buildFrameLines({
	// ... existing fields ...
	accentColor: theme.inputPrompt, // NEW
});
```

**Step 5: Run test to verify it passes**

Run: `npx vitest run source/utils/buildFrameLines.test.ts`
Expected: PASS

**Step 6: Run full test suite + lint + typecheck**

Run: `npm test && npm run lint && npx tsc --noEmit`
Expected: PASS (may need to fix FrameContext usage in other test files)

**Step 7: Commit**

```bash
git add source/utils/buildFrameLines.ts source/utils/buildFrameLines.test.ts source/app.tsx
git commit -m "feat(ui): accent color on input> prompt"
```

---

### Task 4: Dialog prominence — colored separator when dialog active

The permission and question dialogs use `'-'.repeat(columns)` with `dimColor` as a separator. Replace with a colored horizontal rule using the theme's dialog border colors.

**Files:**

- Modify: `source/components/PermissionDialog.tsx`
- Modify: `source/components/QuestionDialog.tsx`

**Step 1: Write failing tests**

File: `source/components/PermissionDialog.test.tsx` — if this file exists, add a test. If not, create a minimal one:

```tsx
import {describe, expect, it, afterEach} from 'vitest';
import React from 'react';
import chalk from 'chalk';
import {render} from 'ink-testing-library';
import PermissionDialog from './PermissionDialog.js';

describe('PermissionDialog separator color', () => {
	const savedLevel = chalk.level;
	afterEach(() => {
		chalk.level = savedLevel;
	});

	it('uses themed separator instead of dim dashes', () => {
		chalk.level = 3;
		const {lastFrame} = render(
			<PermissionDialog
				request={{
					event_id: 'e1',
					tool_name: 'Bash',
					tool_input: {},
				}}
				queuedCount={0}
				onDecision={() => {}}
			/>,
		);
		const output = lastFrame() ?? '';
		// Should NOT contain a dim plain-dash separator
		// Should contain horizontal rule glyphs (─)
		expect(output).toContain('─');
	});
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/components/PermissionDialog.test.tsx`
Expected: FAIL — output contains `-` dashes, not `─` box-drawing chars.

**Step 3: Replace dim dash separator with colored horizontal rule**

In `source/components/PermissionDialog.tsx`, replace line 61:

```tsx
// OLD:
<Text dimColor>{'-'.repeat(columns)}</Text>;

// NEW:
import {useTheme} from '../theme/index.js';
import {getGlyphs} from '../glyphs/index.js';

// Inside the component:
const theme = useTheme();
const g = getGlyphs();
const rule = g['general.divider'].repeat(columns);

// In JSX:
<Text color={theme.dialog.borderPermission}>{rule}</Text>;
```

Also bold the title with permission color:

```tsx
// OLD:
<Text bold>{title}</Text>

// NEW:
<Text bold color={theme.dialog.borderPermission}>{title}</Text>
```

Apply same pattern to `source/components/QuestionDialog.tsx` (around line 292 for the separator), using `theme.dialog.borderQuestion` color.

**Step 4: Run tests**

Run: `npx vitest run source/components/PermissionDialog.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add source/components/PermissionDialog.tsx source/components/QuestionDialog.tsx source/components/PermissionDialog.test.tsx
git commit -m "feat(ui): colored separator and title for permission/question dialogs"
```

---

### Task 5: Event group separators — visual rules between event categories

In the frame-based feed, events are rendered as fixed-width text lines in `buildBodyLines.ts`. Currently all events are visually uniform. Add a blank separator line between different event **categories** (tool, permission, subagent, lifecycle, agent message, etc.).

**Approach:** In `buildBodyLines`, when iterating `filteredEntries`, detect when the event category changes between consecutive entries and insert a blank line. Categories are derived from the `op` field prefix (e.g., `tool.*`, `perm.*`, `sub.*`, `agent.*`, `run.*`, `todo.*`).

**Files:**

- Modify: `source/utils/buildBodyLines.ts`
- Create: `source/utils/buildBodyLines.test.ts`

**Step 1: Write a helper + test**

First, define the category extractor:

```typescript
/** Extract coarse event category from op string for visual grouping. */
export function opCategory(op: string): string {
	const dot = op.indexOf('.');
	return dot >= 0 ? op.slice(0, dot) : op;
}
```

File: `source/utils/buildBodyLines.test.ts`

```typescript
import {describe, expect, it} from 'vitest';
import {opCategory} from './buildBodyLines.js';

describe('opCategory', () => {
	it('extracts prefix before first dot', () => {
		expect(opCategory('tool.call')).toBe('tool');
		expect(opCategory('tool.ok')).toBe('tool');
		expect(opCategory('perm.req')).toBe('perm');
		expect(opCategory('sub.start')).toBe('sub');
		expect(opCategory('agent.msg')).toBe('agent');
		expect(opCategory('run.start')).toBe('run');
	});

	it('returns full op when no dot', () => {
		expect(opCategory('prompt')).toBe('prompt');
		expect(opCategory('notify')).toBe('notify');
	});
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/utils/buildBodyLines.test.ts`
Expected: FAIL — `opCategory` not exported.

**Step 3: Implement category extraction and separator insertion**

In `source/utils/buildBodyLines.ts`, export `opCategory` and modify the feed rendering loop (around line 222):

```typescript
export function opCategory(op: string): string {
	const dot = op.indexOf('.');
	return dot >= 0 ? op.slice(0, dot) : op;
}
```

In the feed content rendering loop, track the previous category and insert blank lines on change:

```typescript
// Inside the feed rendering loop (feedContentRows > 0 branch):
let prevCategory: string | undefined;
for (let i = 0; i < feedContentRows; i++) {
	const idx = feedViewportStart + i;
	const entry = filteredEntries[idx];
	if (!entry) {
		bodyLines.push(fitAnsi('', innerWidth));
		continue;
	}

	// Category separator: insert blank line when category changes
	const category = opCategory(entry.op);
	if (prevCategory !== undefined && category !== prevCategory) {
		// Only insert if we still have budget (don't overflow bodyHeight)
		// Since we're in a fixed-size viewport, the separator replaces the line
		// at the viewport boundary. This is just visual padding — we shift nothing.
		// Actually, the viewport is fixed-size. We can't insert extra lines.
		// Instead, style the line differently to create visual separation.
	}
	prevCategory = category;

	// ... existing line formatting ...
}
```

Wait — the viewport is fixed-height. We can't insert extra lines without consuming a feed entry slot. Better approach: **add a top-border visual indicator** to the first entry of each new category. We can prepend a dim `─` rule to the time column of the line (replacing the time with a thin rule) for the separator effect.

**Revised approach:** In `styleFeedLine`, when the entry is the first of a new category group, render its TIME column with a dim horizontal rule prefix. But `styleFeedLine` doesn't know about neighbors.

**Simpler revised approach:** Add a `groupBreak` boolean to `TimelineEntry` (or pass it into `styleFeedLine`). In `buildBodyLines`, compute which entries start a new category group and set a flag. Then in `styleFeedLine`, when `groupBreak` is true, prepend a dim `┄` or use a dim top-accent on the line.

**Simplest approach:** In `buildBodyLines`, when category changes, replace the blank padding at the left edge of the line with a dim `·` dot separator or dim `─` char. This requires modifying the formatted string.

Actually, the simplest and cleanest approach: in `buildBodyLines`, when the category changes, **dim out the previous line's trailing whitespace and insert a subtle top-border on the current line** using chalk underline on the previous line, or insert a thin separator row that replaces one empty line.

Let's go with the most pragmatic approach: **add `categoryBreak` to `FeedLineStyleOptions`** and render a dim top-border (underline on the previous line or a leading `╌` in the time column).

**Final approach (simple):** Add a `categoryBreak` boolean to `FeedLineStyleOptions`. When true, `styleFeedLine` adds `chalk.underline` to the line, creating a subtle visual separator.

In `source/feed/feedLineStyle.ts`, add to `FeedLineStyleOptions`:

```typescript
/** True when this line starts a new event category group. */
categoryBreak?: boolean;
```

In `styleFeedLine`, after building the styled string, if `categoryBreak` and not `focused`:

```typescript
if (opts.categoryBreak && !focused) {
	// Prepend a dim dot to the time column for visual break
	const breakGlyph = chalk.dim.hex(theme.textMuted)('·');
	styled = breakGlyph + styled.slice(1);
}
```

In `buildBodyLines`, track previous category and pass `categoryBreak`:

```typescript
let prevCat: string | undefined;
// In the loop:
const cat = entry.op.split('.')[0] ?? entry.op;
const isBreak = prevCat !== undefined && cat !== prevCat;
prevCat = cat;

const styled = styleFeedLine(plain, {
	// ... existing opts ...
	categoryBreak: isBreak,
});
```

**Step 4: Run test**

Run: `npx vitest run source/utils/buildBodyLines.test.ts`
Expected: PASS for opCategory test.

**Step 5: Run full tests + lint + typecheck**

Run: `npm test && npm run lint && npx tsc --noEmit`

**Step 6: Commit**

```bash
git add source/feed/feedLineStyle.ts source/utils/buildBodyLines.ts source/utils/buildBodyLines.test.ts
git commit -m "feat(ui): visual group separators between event categories in feed"
```

---

### Task 6: User message prominence — accent left-border in timeline

User prompt events (`user.prompt` kind, op `prompt`) are hidden by default (verbose-only). But user messages from the `messages[]` array are rendered by `Message.tsx` in the component-based path. In the frame-based timeline, `user.prompt` events that DO appear in verbose mode use the standard actor color (`userMessage.text`) with no special treatment.

**Approach:** In `styleFeedLine`, when the `op` is `prompt`, apply a left-border accent (replace the first char of the line with a colored `▎` block).

**Files:**

- Modify: `source/feed/feedLineStyle.ts`
- Modify: `source/feed/feedLineStyle.test.ts`
- Modify: `source/glyphs/registry.ts` (add `feed.userBorder` glyph)

**Step 1: Add glyph**

In `source/glyphs/registry.ts`, add to the `GlyphKey` type and `GLYPH_REGISTRY`:

```typescript
// GlyphKey union:
| 'feed.userBorder'

// GLYPH_REGISTRY:
'feed.userBorder': {unicode: '▎', ascii: '|'},
```

**Step 2: Write failing test**

In `source/feed/feedLineStyle.test.ts`, add:

```typescript
it('applies user border accent for prompt op', () => {
	chalk.level = 3;
	try {
		const line = 'HH:MM prompt       user         Tell me about X    ';
		const styled = styleFeedLine(line, {
			focused: false,
			matched: false,
			actorId: 'user',
			isError: false,
			theme: darkTheme,
			op: 'prompt',
		});
		// First visible char should be the user border glyph ▎
		// (the raw line starts with 'H', styled version starts with colored ▎)
		expect(styled).toContain('▎');
	} finally {
		chalk.level = savedLevel;
	}
});
```

**Step 3: Run test to verify it fails**

Run: `npx vitest run source/feed/feedLineStyle.test.ts`
Expected: FAIL — no `▎` in output.

**Step 4: Implement user border accent**

In `styleFeedLine`, after the final styled string is built, add user prompt handling:

```typescript
// After building styled string, before return:
if (opts.op === 'prompt' && !focused && !matched) {
	const g = getGlyphs(ascii);
	const borderGlyph = chalk.hex(theme.userMessage.border ?? theme.accent)(
		g['feed.userBorder'],
	);
	styled = borderGlyph + styled.slice(1);
}
```

**Step 5: Run test to verify it passes**

Run: `npx vitest run source/feed/feedLineStyle.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add source/glyphs/registry.ts source/feed/feedLineStyle.ts source/feed/feedLineStyle.test.ts
git commit -m "feat(ui): accent left-border for user prompt events in feed"
```

---

### Task 7: Final integration check

**Step 1: Run full test suite**

Run: `npm test`
Expected: All tests pass.

**Step 2: Run lint**

Run: `npm run lint`
Expected: No lint errors.

**Step 3: Run typecheck**

Run: `npx tsc --noEmit`
Expected: No type errors.

**Step 4: Manual smoke test**

Run: `npm run build && node dist/cli.js --help`
Verify it starts without errors.

**Step 5: Final commit if any fixups needed**

```bash
git add -A
git commit -m "chore: fixup lint/type issues from visual polish"
```
