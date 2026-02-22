# Rich Detail View Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the raw JSON detail view with rich rendering (markdown, syntax-highlighted code, diffs) while preserving line-based scrolling.

**Architecture:** New pure function `renderDetailLines()` in `source/utils/` renders FeedEvents to ANSI-colored string lines using marked-terminal and cli-highlight. The existing scroll machinery in `useLayout`/`buildBodyLines` continues to work with `string[]`. The `TimelineEntry` type gains a `feedEvent` reference so the detail view can access typed data.

**Tech Stack:** marked + marked-terminal (markdown), cli-highlight (code), chalk (diff coloring), vitest (tests)

---

### Task 1: Add `feedEvent` to TimelineEntry

**Files:**

- Modify: `source/feed/timeline.ts:13-24` (TimelineEntry type)
- Modify: `source/hooks/useTimeline.ts:65-113` (entry construction)
- Test: `source/feed/timeline.test.ts`

**Step 1: Update TimelineEntry type**

In `source/feed/timeline.ts`, add optional `feedEvent` field:

```typescript
export type TimelineEntry = {
	id: string;
	ts: number;
	runId?: string;
	op: string;
	actor: string;
	summary: string;
	searchText: string;
	error: boolean;
	expandable: boolean;
	details: string;
	feedEvent?: FeedEvent; // <-- add this
};
```

**Step 2: Populate feedEvent in useTimeline**

In `source/hooks/useTimeline.ts`, in the `timelineEntries` memo, add `feedEvent: event` to the feed event entries (line ~96):

```typescript
entries.push({
	id: event.event_id,
	ts: event.ts,
	runId: event.run_id,
	op: eventOperation(event),
	actor: actorLabel(event.actor_id),
	summary,
	searchText: `${summary}\n${details}`,
	error: isEventError(event),
	expandable: isEventExpandable(event),
	details,
	feedEvent: event, // <-- add this
});
```

For message entries (~line 75), leave `feedEvent` undefined (messages aren't FeedEvents).

**Step 3: Run existing tests**

Run: `npx vitest run source/feed/timeline.test.ts`
Expected: All existing tests still pass (additive change)

**Step 4: Commit**

```bash
git add source/feed/timeline.ts source/hooks/useTimeline.ts
git commit -m "feat(timeline): add feedEvent reference to TimelineEntry"
```

---

### Task 2: Create `renderDetailLines` utility

**Files:**

- Create: `source/utils/renderDetailLines.ts`
- Create: `source/utils/renderDetailLines.test.ts`

**Step 1: Write failing tests**

Create `source/utils/renderDetailLines.test.ts`:

```typescript
import {describe, it, expect} from 'vitest';
import {renderDetailLines} from './renderDetailLines.js';
import type {FeedEvent} from '../feed/types.js';

function makeEvent(
	overrides: Partial<FeedEvent> & Pick<FeedEvent, 'kind' | 'data'>,
): FeedEvent {
	return {
		event_id: 'E1',
		session_id: 'S1',
		run_id: 'R1',
		ts: Date.now(),
		actor_id: 'agent:root',
		level: 'info',
		collapsed: false,
		...overrides,
	} as FeedEvent;
}

describe('renderDetailLines', () => {
	it('renders agent.message as markdown', () => {
		const event = makeEvent({
			kind: 'agent.message',
			data: {message: '**bold** text', source: 'transcript', scope: 'root'},
		});
		const result = renderDetailLines(event, 80);
		expect(result.showLineNumbers).toBe(false);
		// marked-terminal renders **bold** with ANSI bold escape
		const joined = result.lines.join('\n');
		expect(joined).toContain('bold');
		expect(joined).not.toContain('**bold**');
	});

	it('renders user.prompt as markdown', () => {
		const event = makeEvent({
			kind: 'user.prompt',
			data: {prompt: 'Hello **world**'},
		});
		const result = renderDetailLines(event, 80);
		expect(result.showLineNumbers).toBe(false);
		const joined = result.lines.join('\n');
		expect(joined).toContain('world');
	});

	it('renders tool.post Read with syntax highlighting', () => {
		const event = makeEvent({
			kind: 'tool.post',
			data: {
				tool_name: 'Read',
				tool_input: {file_path: 'test.ts'},
				tool_response: [{type: 'text', file: {content: 'const x = 1;'}}],
			},
		});
		const result = renderDetailLines(event, 80);
		expect(result.showLineNumbers).toBe(true);
		expect(result.lines.some(l => l.includes('const'))).toBe(true);
	});

	it('renders tool.post Edit as diff', () => {
		const event = makeEvent({
			kind: 'tool.post',
			data: {
				tool_name: 'Edit',
				tool_input: {old_string: 'foo', new_string: 'bar'},
				tool_response: {filePath: 'test.ts', success: true},
			},
		});
		const result = renderDetailLines(event, 80);
		expect(result.showLineNumbers).toBe(true);
		const joined = result.lines.join('\n');
		expect(joined).toContain('foo');
		expect(joined).toContain('bar');
	});

	it('renders tool.pre as highlighted JSON', () => {
		const event = makeEvent({
			kind: 'tool.pre',
			data: {
				tool_name: 'Bash',
				tool_input: {command: 'echo hello'},
			},
		});
		const result = renderDetailLines(event, 80);
		expect(result.showLineNumbers).toBe(true);
		expect(result.lines.some(l => l.includes('echo hello'))).toBe(true);
	});

	it('falls back to JSON for unknown event kinds', () => {
		const event = makeEvent({
			kind: 'session.start',
			data: {source: 'startup', model: 'claude'},
		});
		const result = renderDetailLines(event, 80);
		expect(result.showLineNumbers).toBe(true);
		expect(result.lines.length).toBeGreaterThan(0);
	});
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run source/utils/renderDetailLines.test.ts`
Expected: FAIL — module not found

**Step 3: Implement renderDetailLines**

Create `source/utils/renderDetailLines.ts`:

```typescript
import {type FeedEvent} from '../feed/types.js';
import {extractToolOutput} from './toolExtractors.js';
import {highlight} from 'cli-highlight';
import {Marked} from 'marked';
import {markedTerminal} from 'marked-terminal';
import chalk from 'chalk';

export type DetailRenderResult = {
	lines: string[];
	showLineNumbers: boolean;
};

const MAX_HIGHLIGHT_SIZE = 50_000;

function createMarkedRenderer(width: number): Marked {
	const m = new Marked();
	m.use(
		markedTerminal({
			width,
			reflowText: true,
			tab: 2,
			showSectionPrefix: false,
			unescape: true,
			emoji: true,
			paragraph: chalk.reset,
			strong: chalk.bold,
			em: chalk.italic,
			del: chalk.dim.strikethrough,
			heading: chalk.bold,
			firstHeading: chalk.bold.underline,
			codespan: chalk.yellow,
			code: chalk.gray,
			blockquote: chalk.gray.italic,
			link: chalk.cyan,
			href: chalk.cyan.underline,
			hr: chalk.dim,
			listitem: chalk.reset,
			table: chalk.reset,
		}) as Parameters<typeof m.use>[0],
	);
	return m;
}

function renderMarkdown(content: string, width: number): string[] {
	if (!content.trim()) return ['(empty)'];
	const m = createMarkedRenderer(width);
	try {
		const result = m.parse(content);
		const rendered = typeof result === 'string' ? result.trimEnd() : content;
		return rendered.replace(/\n{3,}/g, '\n').split('\n');
	} catch {
		return content.split('\n');
	}
}

function highlightCode(content: string, language?: string): string[] {
	if (!content.trim()) return ['(empty)'];
	try {
		const highlighted =
			language && content.length <= MAX_HIGHLIGHT_SIZE
				? highlight(content, {language})
				: content;
		return highlighted.split('\n');
	} catch {
		return content.split('\n');
	}
}

function renderDiff(oldText: string, newText: string): string[] {
	const lines: string[] = [];
	for (const line of oldText.split('\n')) {
		lines.push(chalk.red(`- ${line}`));
	}
	for (const line of newText.split('\n')) {
		lines.push(chalk.green(`+ ${line}`));
	}
	return lines;
}

function renderList(items: {primary: string; secondary?: string}[]): string[] {
	return items.map(item =>
		item.secondary
			? `  ${chalk.dim(item.secondary)}  ${item.primary}`
			: `  ${item.primary}`,
	);
}

function renderToolPost(
	event: Extract<FeedEvent, {kind: 'tool.post'} | {kind: 'tool.failure'}>,
	width: number,
): DetailRenderResult {
	const {tool_name, tool_input, tool_response} = event.data;
	const output = extractToolOutput(
		tool_name,
		tool_input as Record<string, unknown>,
		tool_response,
	);

	// Header line
	const header = chalk.bold.cyan(`● ${tool_name}`);

	switch (output.type) {
		case 'code':
			return {
				lines: [header, '', ...highlightCode(output.content, output.language)],
				showLineNumbers: true,
			};
		case 'diff':
			return {
				lines: [header, '', ...renderDiff(output.oldText, output.newText)],
				showLineNumbers: true,
			};
		case 'list':
			return {
				lines: [header, '', ...renderList(output.items)],
				showLineNumbers: false,
			};
		case 'text':
			return {
				lines: [header, '', ...renderMarkdown(output.content, width - 2)],
				showLineNumbers: false,
			};
	}
}

function renderToolPre(
	event: Extract<FeedEvent, {kind: 'tool.pre'} | {kind: 'permission.request'}>,
	width: number,
): DetailRenderResult {
	const {tool_name, tool_input} = event.data;
	const header = chalk.bold.cyan(`● ${tool_name}`);
	const json = JSON.stringify(tool_input, null, 2);
	return {
		lines: [header, '', ...highlightCode(json, 'json')],
		showLineNumbers: true,
	};
}

export function renderDetailLines(
	event: FeedEvent,
	width: number,
): DetailRenderResult {
	switch (event.kind) {
		case 'agent.message':
			return {
				lines: [
					chalk.bold.cyan(
						`💬 ${event.data.scope === 'subagent' ? 'Subagent' : 'Agent'} response`,
					),
					'',
					...renderMarkdown(event.data.message, width - 2),
				],
				showLineNumbers: false,
			};

		case 'user.prompt':
			return {
				lines: [
					chalk.bold.magenta('❯ User prompt'),
					'',
					...renderMarkdown(event.data.prompt, width - 2),
				],
				showLineNumbers: false,
			};

		case 'tool.post':
		case 'tool.failure':
			return renderToolPost(event, width);

		case 'tool.pre':
		case 'permission.request':
			return renderToolPre(event, width);

		case 'notification':
			return {
				lines: [
					chalk.bold.yellow('🔔 Notification'),
					'',
					...renderMarkdown(event.data.message, width - 2),
				],
				showLineNumbers: false,
			};

		default: {
			// Fallback: syntax-highlighted JSON
			const json = JSON.stringify(event.raw ?? event.data, null, 2);
			return {
				lines: highlightCode(json, 'json'),
				showLineNumbers: true,
			};
		}
	}
}
```

**Step 4: Run tests**

Run: `npx vitest run source/utils/renderDetailLines.test.ts`
Expected: All PASS

**Step 5: Commit**

```bash
git add source/utils/renderDetailLines.ts source/utils/renderDetailLines.test.ts
git commit -m "feat(detail): add renderDetailLines for rich ANSI rendering"
```

---

### Task 3: Wire renderDetailLines into useLayout

**Files:**

- Modify: `source/hooks/useLayout.ts:42-157`
- Modify: `source/utils/buildBodyLines.ts:72-101` (line number toggle)

**Step 1: Update useLayout to accept feedEvents and use renderDetailLines**

In `source/hooks/useLayout.ts`:

1. Add import: `import {renderDetailLines} from '../utils/renderDetailLines.js';`
2. Add `feedEvents: FeedEvent[]` to `UseLayoutOptions`
3. Add `detailShowLineNumbers: boolean` to `UseLayoutResult`
4. Replace the `detailLines` computation (lines 99-102):

```typescript
// Old:
const detailLines = useMemo(() => {
	if (!expandedEntry) return [];
	return expandedEntry.details.split(/\r?\n/).map(line => toAscii(line));
}, [expandedEntry]);

// New:
const {detailLines, detailShowLineNumbers} = useMemo(() => {
	if (!expandedEntry) return {detailLines: [], detailShowLineNumbers: true};
	if (expandedEntry.feedEvent) {
		const result = renderDetailLines(expandedEntry.feedEvent, innerWidth);
		return {
			detailLines: result.lines,
			detailShowLineNumbers: result.showLineNumbers,
		};
	}
	// Fallback for message entries (no feedEvent)
	return {
		detailLines: expandedEntry.details
			.split(/\r?\n/)
			.map(line => toAscii(line)),
		detailShowLineNumbers: false,
	};
}, [expandedEntry, innerWidth]);
```

5. Add `detailShowLineNumbers` to return object.

**Step 2: Update buildBodyLines to respect showLineNumbers**

In `source/utils/buildBodyLines.ts`:

1. Add `showLineNumbers?: boolean` to `DetailViewState` type
2. In the detail rendering block (lines 93-100), conditionally show line numbers:

```typescript
// Old:
const lineNo = String(start + i + 1).padStart(lineNumberWidth, ' ');
bodyLines.push(fit(`${lineNo} | ${line}`, innerWidth));

// New:
if (detail.showLineNumbers !== false) {
	const lineNo = String(start + i + 1).padStart(lineNumberWidth, ' ');
	bodyLines.push(fit(`${lineNo} | ${line}`, innerWidth));
} else {
	bodyLines.push(fit(line, innerWidth));
}
```

**Step 3: Update app.tsx to pass feedEvents and showLineNumbers**

In `source/app.tsx`, pass `feedEvents` to `useLayout` options and thread `detailShowLineNumbers` through to `buildBodyLines`:

1. Add `feedEvents` to useLayout call
2. Extract `detailShowLineNumbers` from layout result
3. Add `showLineNumbers: detailShowLineNumbers` to the detail object passed to buildBodyLines

**Step 4: Run all tests**

Run: `npm test`
Expected: All pass

**Step 5: Run lint and typecheck**

Run: `npm run lint && npx tsc --noEmit`
Expected: Clean

**Step 6: Commit**

```bash
git add source/hooks/useLayout.ts source/utils/buildBodyLines.ts source/app.tsx
git commit -m "feat(detail): wire renderDetailLines into layout pipeline"
```

---

### Task 4: Handle message entries (user/agent messages from transcript)

**Files:**

- Modify: `source/hooks/useTimeline.ts:70-87` (message entry construction)

Message entries in the timeline have `details: item.data.content` (plain text) and no `feedEvent`. They're already handled by the fallback in useLayout (markdown rendered via the text split path). But we should render them with markdown too.

**Step 1: Update message entry detail rendering**

The fallback path in useLayout already handles message entries by splitting on newlines. To get markdown rendering for messages, create a synthetic render in the fallback:

In `useLayout.ts`, update the fallback for entries without `feedEvent`:

```typescript
// For message entries, render content as markdown
if (!expandedEntry.feedEvent) {
	const content = expandedEntry.details;
	// Use renderMarkdown directly for message content
	const markdownLines = renderMarkdownToLines(content, innerWidth);
	return {detailLines: markdownLines, detailShowLineNumbers: false};
}
```

Add a small exported helper `renderMarkdownToLines` in `renderDetailLines.ts` that just does the markdown rendering.

**Step 2: Run tests**

Run: `npm test`
Expected: All pass

**Step 3: Commit**

```bash
git add source/hooks/useLayout.ts source/utils/renderDetailLines.ts
git commit -m "feat(detail): render message entries with markdown"
```

---

### Task 5: Final integration test and cleanup

**Files:**

- Test: Manual testing with `npm run start`

**Step 1: Build and run**

Run: `npm run build`
Expected: Clean build

**Step 2: Run full test suite**

Run: `npm test`
Expected: All pass

**Step 3: Run lint + typecheck**

Run: `npm run lint && npx tsc --noEmit`
Expected: Clean

**Step 4: Final commit if any cleanup needed**

---

## Notes

- The `toAscii()` call is removed for rich content because ANSI escape codes contain non-ASCII bytes. The detail view now preserves ANSI colors.
- `expansionForEvent()` is kept as-is for `searchText` generation in `useTimeline` — search still works against JSON text.
- The `MarkdownText` React component and `renderDetailLines` utility both use marked-terminal but create separate `Marked` instances. This is intentional — the React component manages its own lifecycle, the utility is stateless.
