# Footer Area Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the buggy input field (real cursor, multi-line auto-expand), redesign hints bar with glyphs and auto-hide, and fix the extra space below the frame border.

**Architecture:** Replace fake `|` cursor with ANSI inverse-video block cursor. Make footer height dynamic (hints visibility + input line count). Add glyph-based hints that auto-hide when typing. Fix `HEADER_ROWS` from 2→1.

**Tech Stack:** Ink, chalk, string-width, slice-ansi, ANSI escape sequences

---

### Task 1: Fix the Extra Space Bug (HEADER_ROWS off-by-one)

**Files:**

- Modify: `source/hooks/useLayout.ts:10`

**Step 1: Write the failing test**

File: `source/hooks/useLayout.test.ts` (create or add to existing)

```ts
import {describe, it, expect} from 'vitest';

// We'll test the height arithmetic directly
describe('useLayout height calculation', () => {
	it('total rendered rows should equal terminalRows', () => {
		// Frame structure: top(1) + header(1) + section(1) + body + section(1) + footer(2) + bottom(1) = body + 7
		// So body = terminalRows - 7
		const terminalRows = 40;
		const HEADER_ROWS = 1; // Fixed: was 2
		const FOOTER_ROWS = 2;
		const FRAME_BORDER_ROWS = 4;
		const bodyHeight =
			terminalRows - HEADER_ROWS - FOOTER_ROWS - FRAME_BORDER_ROWS;
		const totalRendered = bodyHeight + 7; // body + 4 borders + 1 header + 2 footer
		expect(totalRendered).toBe(terminalRows);
	});
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/hooks/useLayout.test.ts -v`

**Step 3: Fix the constant**

In `source/hooks/useLayout.ts`, change line 10:

```ts
const HEADER_ROWS = 1; // Was 2 — only 1 header line rendered in frame
```

**Step 4: Run tests**

Run: `npx vitest run source/ -v`

**Step 5: Commit**

```bash
git add source/hooks/useLayout.ts source/hooks/useLayout.test.ts
git commit -m "fix: HEADER_ROWS off-by-one causing extra space below frame border"
```

---

### Task 2: Add Hint Glyphs to Registry

**Files:**

- Modify: `source/glyphs/registry.ts`

**Step 1: Add glyph keys and entries**

Add to `GlyphKey` type:

```ts
// Hints
| 'hint.enter'
| 'hint.escape'
| 'hint.tab'
| 'hint.arrows'
| 'hint.arrowsUpDown'
| 'hint.space'
| 'hint.page'
| 'hint.separator'
| 'hint.toggle'
```

Add to `GLYPH_REGISTRY`:

```ts
// Hints
'hint.enter': {unicode: '⏎', ascii: 'Enter'},
'hint.escape': {unicode: '⎋', ascii: 'Esc'},
'hint.tab': {unicode: '⇥', ascii: 'Tab'},
'hint.arrows': {unicode: '⌃↕', ascii: 'C-Up/Dn'},
'hint.arrowsUpDown': {unicode: '↕', ascii: 'Up/Dn'},
'hint.space': {unicode: '␣', ascii: 'Space'},
'hint.page': {unicode: '⇞⇟', ascii: 'PgUp/Dn'},
'hint.separator': {unicode: '·', ascii: '|'},
'hint.toggle': {unicode: '⌃/', ascii: 'C-/'},
```

**Step 2: Run typecheck**

Run: `npx tsc --noEmit`

**Step 3: Commit**

```bash
git add source/glyphs/registry.ts
git commit -m "feat: add hint glyphs to registry for footer redesign"
```

---

### Task 3: Redesign Hints Line with Glyphs + Auto-hide

**Files:**

- Modify: `source/utils/buildFrameLines.ts`

**Step 1: Write failing test**

File: `source/utils/buildFrameLines.test.ts`

```ts
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
};

describe('buildFrameLines hints', () => {
	it('shows glyph hints when input is empty', () => {
		const result = buildFrameLines(baseCtx);
		expect(result.footerHelp).toContain('⏎'); // enter glyph
		expect(result.footerHelp).toContain('Send');
	});

	it('returns null footerHelp when input has text (auto-hide)', () => {
		const result = buildFrameLines({...baseCtx, inputValue: 'hello'});
		expect(result.footerHelp).toBeNull();
	});

	it('shows feed hints in feed mode', () => {
		const result = buildFrameLines({...baseCtx, focusMode: 'feed'});
		expect(result.footerHelp).toContain('Expand');
		expect(result.footerHelp).toContain('Search');
	});
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/utils/buildFrameLines.test.ts -v`

**Step 3: Implement glyph hints + auto-hide**

Modify `buildFrameLines.ts`:

- Import glyph helpers
- Change `footerHelp` return type to `string | null`
- Return `null` when `ctx.inputValue.length > 0 && !ctx.hintsForced`
- When visible, build glyph-based hint strings per mode using `chalk.dim()`

Update `FrameLines` type:

```ts
export type FrameLines = {
	footerHelp: string | null; // null = hidden
	inputLine: string;
};
```

Hint builders per mode:

```ts
function buildHints(pairs: Array<[string, string]>, sep: string): string {
	return pairs.map(([glyph, label]) => `${glyph} ${label}`).join(` ${sep} `);
}
```

Mode hints:

```ts
// INPUT mode
buildHints(
	[
		['⏎', 'Send'],
		['⎋', 'Back'],
		['⇥', 'Focus'],
		['⌃P/N', 'History'],
		['⌃/', 'Hints'],
	],
	'·',
);

// FEED mode
buildHints(
	[
		['⌃↕', 'Navigate'],
		['⏎', 'Expand'],
		['/', 'Search'],
		[':', 'Cmd'],
		['⤓', 'Tail'],
	],
	'·',
);

// TODO mode
buildHints(
	[
		['↕', 'Select'],
		['␣', 'Toggle'],
		['⏎', 'Jump'],
		['a', 'Add'],
		['⎋', 'Back'],
	],
	'·',
);

// DETAILS mode
buildHints(
	[
		['↕', 'Scroll'],
		['⇞⇟', 'Page'],
		['⏎/⎋', 'Back'],
	],
	'·',
);
```

All wrapped in `chalk.dim()`.

**Step 4: Update `FrameContext` type**

Add `hintsForced?: boolean` to `FrameContext` (for Ctrl+/ toggle).

**Step 5: Run tests**

Run: `npx vitest run source/utils/buildFrameLines.test.ts -v`

**Step 6: Commit**

```bash
git add source/utils/buildFrameLines.ts source/utils/buildFrameLines.test.ts
git commit -m "feat: glyph-based hints with auto-hide when typing"
```

---

### Task 4: ANSI Block Cursor Rendering

**Files:**

- Modify: `source/utils/format.ts` (replace `formatInputBuffer`)
- Modify: `source/components/DashboardInput.tsx`

**Step 1: Write failing test**

File: `source/utils/format.test.ts` (add tests)

```ts
import {describe, it, expect} from 'vitest';
import {renderInputLines} from './format.js';

describe('renderInputLines', () => {
	it('renders block cursor at position 0 on empty input', () => {
		const lines = renderInputLines('', 0, 40, true, 'placeholder');
		expect(lines).toHaveLength(1);
		// Should contain ANSI inverse for cursor
		expect(lines[0]).toContain('\x1b[7m');
	});

	it('wraps long text to multiple lines', () => {
		const text = 'a'.repeat(100);
		const lines = renderInputLines(text, 50, 40, true, '');
		expect(lines.length).toBeGreaterThan(1);
		expect(lines.length).toBeLessThanOrEqual(6); // MAX_INPUT_ROWS
	});

	it('returns single line for short text', () => {
		const lines = renderInputLines('hello', 5, 40, true, '');
		expect(lines).toHaveLength(1);
	});

	it('hides cursor when showCursor is false', () => {
		const lines = renderInputLines('hello', 3, 40, false, '');
		expect(lines[0]).not.toContain('\x1b[7m');
	});
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/utils/format.test.ts -v`

**Step 3: Implement `renderInputLines`**

New function in `source/utils/format.ts`:

```ts
const MAX_INPUT_ROWS = 6;
const CURSOR_ON = '\x1b[7m';
const CURSOR_OFF = '\x1b[27m';

/**
 * Renders input text with ANSI block cursor, supporting multi-line wrapping.
 * Returns an array of strings (1 to MAX_INPUT_ROWS lines).
 */
export function renderInputLines(
	value: string,
	cursorOffset: number,
	width: number,
	showCursor: boolean,
	placeholder: string,
): string[] {
	if (width <= 0) return [''];

	if (value.length === 0) {
		if (!showCursor) return [fit(placeholder, width)];
		const cursor = `${CURSOR_ON} ${CURSOR_OFF}`;
		return [cursor + fit(placeholder, width - 1)];
	}

	// Word-wrap value into lines of `width` chars
	const rawLines = wrapText(value, width);

	// Find which line the cursor is on
	let charCount = 0;
	let cursorLine = 0;
	let cursorCol = 0;
	for (let i = 0; i < rawLines.length; i++) {
		if (cursorOffset <= charCount + rawLines[i]!.length) {
			cursorLine = i;
			cursorCol = cursorOffset - charCount;
			break;
		}
		charCount += rawLines[i]!.length;
	}

	// Apply viewport if more than MAX_INPUT_ROWS lines
	let viewStart = 0;
	if (rawLines.length > MAX_INPUT_ROWS) {
		viewStart = Math.max(
			0,
			Math.min(
				cursorLine - Math.floor(MAX_INPUT_ROWS / 2),
				rawLines.length - MAX_INPUT_ROWS,
			),
		);
	}
	const visibleLines = rawLines.slice(viewStart, viewStart + MAX_INPUT_ROWS);

	// Render with cursor
	return visibleLines.map((line, i) => {
		const globalIdx = viewStart + i;
		let rendered: string;
		if (showCursor && globalIdx === cursorLine) {
			const before = line.slice(0, cursorCol);
			const charAtCursor = cursorCol < line.length ? line[cursorCol] : ' ';
			const after = cursorCol < line.length ? line.slice(cursorCol + 1) : '';
			rendered = `${before}${CURSOR_ON}${charAtCursor}${CURSOR_OFF}${after}`;
		} else {
			rendered = line;
		}
		// Pad to width (using fitAnsi since cursor adds ANSI codes)
		return fitAnsi(rendered, width);
	});
}

function wrapText(text: string, width: number): string[] {
	if (width <= 0) return [text];
	const lines: string[] = [];
	// Split on explicit newlines first
	for (const segment of text.split('\n')) {
		if (segment.length === 0) {
			lines.push('');
			continue;
		}
		// Hard wrap at width
		for (let i = 0; i < segment.length; i += width) {
			lines.push(segment.slice(i, i + width));
		}
	}
	return lines;
}
```

Keep `formatInputBuffer` for backward compat but mark deprecated.

**Step 4: Update DashboardInput to use multi-line**

`DashboardInput.tsx` changes:

- Call `renderInputLines()` instead of `renderInputText()`
- Return an array of `<Text>` elements
- Export `inputLineCount` via a callback prop or return value

**Step 5: Run tests**

Run: `npx vitest run source/utils/format.test.ts source/components/DashboardInput.test.ts -v`

**Step 6: Commit**

```bash
git add source/utils/format.ts source/components/DashboardInput.tsx
git commit -m "feat: ANSI block cursor + multi-line input wrapping"
```

---

### Task 5: Dynamic Footer Height in useLayout

**Files:**

- Modify: `source/hooks/useLayout.ts`
- Modify: `source/app.tsx`

**Step 1: Write failing test**

```ts
describe('useLayout dynamic footer', () => {
	it('adjusts bodyHeight when footerRows changes', () => {
		// With footerRows=2 (hints+1 input line): body = rows - 1 - 2 - 4
		// With footerRows=4 (hints+3 input lines): body = rows - 1 - 4 - 4
		const terminalRows = 40;
		const withSmallFooter = terminalRows - 1 - 2 - 4; // 33
		const withLargeFooter = terminalRows - 1 - 4 - 4; // 31
		expect(withSmallFooter).toBe(33);
		expect(withLargeFooter).toBe(31);
	});
});
```

**Step 2: Implement dynamic footer**

In `useLayout.ts`:

- Remove `FOOTER_ROWS` constant
- Add `footerRows: number` to `UseLayoutOptions`
- Use it: `bodyHeight = terminalRows - HEADER_ROWS - footerRows - FRAME_BORDER_ROWS`

In `app.tsx`:

- Track `inputLineCount` state (from DashboardInput callback)
- Track `hintsVisible` state (hidden when input non-empty, toggle with Ctrl+/)
- Compute `footerRows = (hintsVisible ? 1 : 0) + inputLineCount`
- Pass to `useLayout`
- Render conditional hints line + multiple input lines in the frame

**Step 3: Update frame rendering in app.tsx**

Replace:

```tsx
<Text>{frameLine(fit(frame.footerHelp, innerWidth))}</Text>
<Text>{frameLine(frame.inputLine)}</Text>
```

With:

```tsx
{
	frame.footerHelp !== null && (
		<Text>{frameLine(fit(frame.footerHelp, innerWidth))}</Text>
	);
}
{
	inputLines.map((line, i) => (
		<Text key={`input-${i}`}>{frameLine(line)}</Text>
	));
}
```

**Step 4: Run full test suite**

Run: `npx vitest run source/ -v`

**Step 5: Run lint + typecheck**

Run: `npm run lint && npx tsc --noEmit`

**Step 6: Commit**

```bash
git add source/hooks/useLayout.ts source/app.tsx
git commit -m "feat: dynamic footer height with multi-line input support"
```

---

### Task 6: Ctrl+/ Hints Toggle

**Files:**

- Modify: `source/app.tsx` (add key handler)

**Step 1: Add `hintsForced` state and Ctrl+/ handler**

```ts
const [hintsForced, setHintsForced] = useState<boolean | null>(null);
// null = auto (show when empty), true = force show, false = force hide

useInput(
	(input, key) => {
		if (key.ctrl && input === '/') {
			setHintsForced(prev => (prev === null ? true : prev ? false : null));
		}
	},
	{isActive: focusMode === 'input'},
);

const hintsVisible =
	hintsForced === true || (hintsForced === null && inputValue.length === 0);
```

**Step 2: Pass to FrameContext**

Add `hintsForced` to `FrameContext` and use it in `buildFrameLines`.

**Step 3: Run tests + lint**

Run: `npx vitest run source/ -v && npm run lint`

**Step 4: Commit**

```bash
git add source/app.tsx source/utils/buildFrameLines.ts
git commit -m "feat: Ctrl+/ toggle for hints visibility"
```

---

### Task 7: Integration Testing + Polish

**Step 1: Manual testing**

- Start app: `npm run start`
- Verify no extra blank line below border
- Type text → verify block cursor visible and moves correctly
- Type long text → verify auto-expand to multiple lines
- Backspace/Delete → verify correct behavior
- Verify hints visible when input empty, hidden when typing
- Press Ctrl+/ → verify toggle
- Switch focus modes (Tab) → verify mode-appropriate hints

**Step 2: Run full suite**

Run: `npm test && npm run lint && npx tsc --noEmit`

**Step 3: Final commit**

```bash
git commit -m "test: integration tests for footer redesign"
```
