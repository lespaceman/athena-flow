# Feed UI Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Merge tool.pre + tool.post into a single visual event in the feed, and filter lifecycle events when --verbose is not set.

**Architecture:** Approach C — component-layer pairing. Feed model is untouched. `HookEvent` receives a `postByToolUseId` lookup map. When a `tool.pre` has a matching post, the component renders a merged single-line view. `tool.post`/`tool.failure` events with a matching pre render as `null`. A `VERBOSE_ONLY_KINDS` set gates lifecycle events.

**Tech Stack:** React/Ink, TypeScript, vitest, ink-testing-library

---

### Task 1: Add `tool.success` and `tool.failure` glyphs to registry

**Files:**

- Modify: `source/glyphs/registry.ts:8-68` (GlyphKey type)
- Modify: `source/glyphs/registry.ts:70-146` (GLYPH_REGISTRY object)
- Test: `source/glyphs/registry.test.ts` (if exists, else skip — registry is type-checked)

**Step 1: Add glyph keys to GlyphKey type**

In `source/glyphs/registry.ts`, add to the `GlyphKey` type union inside the `// Tool` section:

```typescript
	// Tool
	| 'tool.bullet'
	| 'tool.gutter'
	| 'tool.arrow'
	| 'tool.success'
	| 'tool.failure'
	| 'tool.pending'
```

**Step 2: Add glyph entries to GLYPH_REGISTRY**

In `source/glyphs/registry.ts`, add inside the `// Tool` section of the registry:

```typescript
	'tool.success': {unicode: '✔', ascii: '+'},
	'tool.failure': {unicode: '✘', ascii: '!'},
	'tool.pending': {unicode: '◐', ascii: '~'},
```

**Step 3: Verify build passes**

Run: `npm run build`
Expected: Clean compile, no errors

**Step 4: Commit**

```bash
git add source/glyphs/registry.ts
git commit -m "feat(glyphs): add tool.success, tool.failure, tool.pending glyphs"
```

---

### Task 2: Create `summarizeToolResult` function

**Files:**

- Create: `source/utils/toolSummary.ts`
- Create: `source/utils/toolSummary.test.ts`

**Step 1: Write the failing tests**

Create `source/utils/toolSummary.test.ts`:

```typescript
import {describe, it, expect} from 'vitest';
import {summarizeToolResult} from './toolSummary.js';

describe('summarizeToolResult', () => {
	it('summarizes Bash success with exit 0', () => {
		const result = summarizeToolResult(
			'Bash',
			{command: 'ls'},
			{
				stdout: 'file1\nfile2\n',
				stderr: '',
				exitCode: 0,
			},
		);
		expect(result).toBe('exit 0');
	});

	it('summarizes Bash failure with exit code and first stderr line', () => {
		const result = summarizeToolResult(
			'Bash',
			{command: 'bad-cmd'},
			{
				stdout: '',
				stderr: 'command not found: bad-cmd\nsome other line',
				exitCode: 127,
			},
		);
		expect(result).toBe('exit 127 — command not found: bad-cmd');
	});

	it('summarizes Read with line count', () => {
		const result = summarizeToolResult('Read', {file_path: '/tmp/f.ts'}, [
			{type: 'text', file: {content: 'line1\nline2\nline3'}},
		]);
		expect(result).toBe('3 lines');
	});

	it('summarizes Edit with line count', () => {
		const result = summarizeToolResult(
			'Edit',
			{
				file_path: 'src/app.tsx',
				old_string: 'foo\nbar',
				new_string: 'baz\nqux\nquux',
			},
			{filePath: 'src/app.tsx', success: true},
		);
		expect(result).toBe('replaced 2 → 3 lines');
	});

	it('summarizes Write with file path', () => {
		const result = summarizeToolResult(
			'Write',
			{
				file_path: '/tmp/output.txt',
				content: 'hello',
			},
			{filePath: '/tmp/output.txt', success: true},
		);
		expect(result).toBe('wrote /tmp/output.txt');
	});

	it('summarizes Glob with file count', () => {
		const result = summarizeToolResult(
			'Glob',
			{pattern: '**/*.ts'},
			{
				filenames: ['a.ts', 'b.ts', 'c.ts'],
				numFiles: 3,
			},
		);
		expect(result).toBe('3 files');
	});

	it('summarizes Grep with match count', () => {
		const result = summarizeToolResult(
			'Grep',
			{pattern: 'foo'},
			'a.ts:1:foo\nb.ts:5:foo bar',
		);
		expect(result).toBe('2 matches');
	});

	it('summarizes WebSearch with result count', () => {
		const result = summarizeToolResult(
			'WebSearch',
			{query: 'test'},
			{
				results: [{content: [{title: 'A'}, {title: 'B'}]}],
			},
		);
		expect(result).toBe('2 results');
	});

	it('summarizes Task with agent type', () => {
		const result = summarizeToolResult(
			'Task',
			{
				subagent_type: 'Explore',
				description: 'Find files',
			},
			{status: 'completed', content: [{type: 'text', text: 'done'}]},
		);
		expect(result).toBe('Explore — done');
	});

	it('returns "done" for unknown tools', () => {
		const result = summarizeToolResult('CustomTool', {}, 'some result');
		expect(result).toBe('done');
	});

	it('summarizes failure with error string', () => {
		const result = summarizeToolResult(
			'Bash',
			{command: 'x'},
			undefined,
			'command not found',
		);
		expect(result).toBe('command not found');
	});
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run source/utils/toolSummary.test.ts`
Expected: FAIL — module not found

**Step 3: Write the implementation**

Create `source/utils/toolSummary.ts`:

```typescript
// source/utils/toolSummary.ts

import {isBashToolResponse} from '../components/hookEventUtils.js';

function prop(obj: unknown, key: string): unknown {
	if (typeof obj === 'object' && obj !== null) {
		return (obj as Record<string, unknown>)[key];
	}
	return undefined;
}

function countLines(text: unknown): number {
	if (typeof text !== 'string') return 0;
	return text.split('\n').filter(Boolean).length;
}

function extractFileContent(response: unknown): string | undefined {
	if (Array.isArray(response)) {
		for (const block of response) {
			const fc = prop(prop(block, 'file'), 'content');
			if (typeof fc === 'string') return fc;
			const text = prop(block, 'text');
			if (typeof text === 'string') return text;
		}
	}
	return undefined;
}

type Summarizer = (input: Record<string, unknown>, response: unknown) => string;

function summarizeBash(
	_input: Record<string, unknown>,
	response: unknown,
): string {
	if (isBashToolResponse(response)) {
		const exitCode = prop(response, 'exitCode') ?? 0;
		const stderr = response.stderr.trim();
		const firstLine = stderr.split('\n')[0] ?? '';
		if (stderr && Number(exitCode) !== 0) {
			return `exit ${exitCode} — ${firstLine}`;
		}
		return `exit ${exitCode}`;
	}
	return 'done';
}

function summarizeRead(
	_input: Record<string, unknown>,
	response: unknown,
): string {
	const content = extractFileContent(response);
	if (content) {
		const lines = content.split('\n').length;
		return `${lines} lines`;
	}
	return 'done';
}

function summarizeEdit(
	input: Record<string, unknown>,
	_response: unknown,
): string {
	const oldStr =
		typeof input['old_string'] === 'string' ? input['old_string'] : '';
	const newStr =
		typeof input['new_string'] === 'string' ? input['new_string'] : '';
	const oldLines = oldStr.split('\n').length;
	const newLines = newStr.split('\n').length;
	return `replaced ${oldLines} → ${newLines} lines`;
}

function summarizeWrite(
	input: Record<string, unknown>,
	response: unknown,
): string {
	const filePath = prop(response, 'filePath') ?? input['file_path'];
	return `wrote ${filePath}`;
}

function summarizeGlob(
	_input: Record<string, unknown>,
	response: unknown,
): string {
	const filenames = prop(response, 'filenames');
	if (Array.isArray(filenames)) return `${filenames.length} files`;
	const numFiles = prop(response, 'numFiles');
	if (typeof numFiles === 'number') return `${numFiles} files`;
	return 'done';
}

function summarizeGrep(
	_input: Record<string, unknown>,
	response: unknown,
): string {
	const text = typeof response === 'string' ? response : '';
	const matches = text.split('\n').filter(Boolean).length;
	return `${matches} matches`;
}

function summarizeWebSearch(
	_input: Record<string, unknown>,
	response: unknown,
): string {
	const results = prop(response, 'results');
	if (Array.isArray(results)) {
		let count = 0;
		for (const entry of results) {
			const content = prop(entry, 'content');
			count += Array.isArray(content) ? content.length : 1;
		}
		return `${count} results`;
	}
	return 'done';
}

function summarizeTask(
	input: Record<string, unknown>,
	_response: unknown,
): string {
	const agentType = input['subagent_type'] ?? 'agent';
	return `${agentType} — done`;
}

const SUMMARIZERS: Record<string, Summarizer> = {
	Bash: summarizeBash,
	Read: summarizeRead,
	Edit: summarizeEdit,
	Write: summarizeWrite,
	Glob: summarizeGlob,
	Grep: summarizeGrep,
	WebSearch: summarizeWebSearch,
	Task: summarizeTask,
};

/**
 * Produce a short one-line outcome summary for a completed tool call.
 * If `error` is provided, it's a failure summary.
 */
export function summarizeToolResult(
	toolName: string,
	toolInput: Record<string, unknown>,
	toolResponse: unknown,
	error?: string,
): string {
	if (error) {
		const firstLine = error.split('\n')[0] ?? error;
		return firstLine.length > 80 ? firstLine.slice(0, 77) + '...' : firstLine;
	}

	const summarizer = SUMMARIZERS[toolName];
	if (summarizer) {
		try {
			return summarizer(toolInput, toolResponse);
		} catch {
			return 'done';
		}
	}
	return 'done';
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run source/utils/toolSummary.test.ts`
Expected: All tests PASS

**Step 5: Run lint**

Run: `npm run lint`
Expected: Clean

**Step 6: Commit**

```bash
git add source/utils/toolSummary.ts source/utils/toolSummary.test.ts
git commit -m "feat(feed): add summarizeToolResult for merged tool event summaries"
```

---

### Task 3: Create `MergedToolCallEvent` component

This is the core visual component. It replaces `UnifiedToolCallEvent` for `tool.pre` events, rendering differently based on whether a paired `tool.post`/`tool.failure` exists.

**Files:**

- Create: `source/components/MergedToolCallEvent.tsx`
- Create: `source/components/MergedToolCallEvent.test.tsx`

**Step 1: Write the failing tests**

Create `source/components/MergedToolCallEvent.test.tsx`:

```typescript
import React from 'react';
import {describe, it, expect} from 'vitest';
import {render} from 'ink-testing-library';
import stripAnsi from 'strip-ansi';
import MergedToolCallEvent from './MergedToolCallEvent.js';
import type {FeedEvent} from '../feed/types.js';

function makeFeedEvent(
	kind: FeedEvent['kind'],
	data: Record<string, unknown>,
	overrides: Partial<FeedEvent> = {},
): FeedEvent {
	return {
		event_id: 'test-1',
		seq: 1,
		ts: Date.now(),
		session_id: 's1',
		run_id: 's1:R1',
		kind,
		level: 'info',
		actor_id: 'agent:root',
		title: 'test',
		data,
		...overrides,
	} as FeedEvent;
}

describe('MergedToolCallEvent', () => {
	it('renders pending state with streaming glyph when no postEvent', () => {
		const event = makeFeedEvent('tool.pre', {
			tool_name: 'Bash',
			tool_input: {command: 'npm test'},
		});
		const {lastFrame} = render(
			<MergedToolCallEvent event={event} />,
		);
		const frame = stripAnsi(lastFrame() ?? '');
		expect(frame).toContain('◐');
		expect(frame).toContain('Bash');
	});

	it('renders success state with checkmark when postEvent is tool.post', () => {
		const preEvent = makeFeedEvent('tool.pre', {
			tool_name: 'Bash',
			tool_input: {command: 'echo hi'},
			tool_use_id: 'tu-1',
		});
		const postEvent = makeFeedEvent('tool.post', {
			tool_name: 'Bash',
			tool_input: {command: 'echo hi'},
			tool_use_id: 'tu-1',
			tool_response: {stdout: 'hi\n', stderr: '', exitCode: 0},
		});
		const {lastFrame} = render(
			<MergedToolCallEvent event={preEvent} postEvent={postEvent} />,
		);
		const frame = stripAnsi(lastFrame() ?? '');
		expect(frame).toContain('✔');
		expect(frame).toContain('Bash');
		expect(frame).toContain('exit 0');
	});

	it('renders failure state with cross when postEvent is tool.failure', () => {
		const preEvent = makeFeedEvent('tool.pre', {
			tool_name: 'Bash',
			tool_input: {command: 'bad'},
			tool_use_id: 'tu-2',
		});
		const postEvent = makeFeedEvent('tool.failure', {
			tool_name: 'Bash',
			tool_input: {command: 'bad'},
			tool_use_id: 'tu-2',
			error: 'command not found',
		});
		const {lastFrame} = render(
			<MergedToolCallEvent event={preEvent} postEvent={postEvent} />,
		);
		const frame = stripAnsi(lastFrame() ?? '');
		expect(frame).toContain('✘');
		expect(frame).toContain('Bash');
		expect(frame).toContain('command not found');
	});

	it('shows input + output when expanded and postEvent present', () => {
		const preEvent = makeFeedEvent('tool.pre', {
			tool_name: 'Bash',
			tool_input: {command: 'echo hi'},
			tool_use_id: 'tu-3',
		});
		const postEvent = makeFeedEvent('tool.post', {
			tool_name: 'Bash',
			tool_input: {command: 'echo hi'},
			tool_use_id: 'tu-3',
			tool_response: {stdout: 'hi\n', stderr: '', exitCode: 0},
		});
		const {lastFrame} = render(
			<MergedToolCallEvent
				event={preEvent}
				postEvent={postEvent}
				expanded
			/>,
		);
		const frame = stripAnsi(lastFrame() ?? '');
		// Input section
		expect(frame).toContain('command');
		// Output section
		expect(frame).toContain('hi');
	});

	it('renders permission.request events (no merge, same as pending)', () => {
		const event = makeFeedEvent('permission.request', {
			tool_name: 'Bash',
			tool_input: {command: 'rm -rf /'},
		});
		const {lastFrame} = render(
			<MergedToolCallEvent event={event} />,
		);
		const frame = stripAnsi(lastFrame() ?? '');
		expect(frame).toContain('Bash');
	});

	it('returns null for non-tool.pre/permission.request events', () => {
		const event = makeFeedEvent('tool.post', {
			tool_name: 'Bash',
			tool_input: {},
			tool_response: 'hello',
		});
		const {lastFrame} = render(
			<MergedToolCallEvent event={event} />,
		);
		expect(lastFrame()).toBe('');
	});
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run source/components/MergedToolCallEvent.test.tsx`
Expected: FAIL — module not found

**Step 3: Write the component**

Create `source/components/MergedToolCallEvent.tsx`:

```typescript
import React from 'react';
import {Box, Text} from 'ink';
import type {FeedEvent} from '../feed/types.js';
import {parseToolName, formatInlineParams} from '../utils/toolNameParser.js';
import {truncateLine} from '../utils/truncate.js';
import {summarizeToolResult} from '../utils/toolSummary.js';
import {useTheme} from '../theme/index.js';
import {getGlyphs} from '../glyphs/index.js';
import {ToolOutputRenderer, ToolResultContainer} from './ToolOutput/index.js';
import {extractToolOutput} from '../utils/toolExtractors.js';

type Props = {
	event: FeedEvent;
	postEvent?: FeedEvent;
	verbose?: boolean;
	expanded?: boolean;
	parentWidth?: number;
};

const MAX_EXPANDED_LINES = 40;

export default function MergedToolCallEvent({
	event,
	postEvent,
	verbose,
	expanded,
	parentWidth,
}: Props): React.ReactNode {
	const theme = useTheme();
	const g = getGlyphs();

	if (event.kind !== 'tool.pre' && event.kind !== 'permission.request')
		return null;

	const toolName = event.data.tool_name;
	const toolInput = event.data.tool_input ?? {};
	const parsed = parseToolName(toolName);

	// Determine state: pending, success, or failure
	const isResolved = postEvent != null;
	const isFailed = postEvent?.kind === 'tool.failure';

	// Pick glyph and color
	let glyph: string;
	let color: string;
	if (!isResolved) {
		glyph = g['tool.pending'];
		color = theme.textMuted;
	} else if (isFailed) {
		glyph = g['tool.failure'];
		color = theme.status.error;
	} else {
		glyph = g['tool.success'];
		color = theme.status.success;
	}

	// Build summary text for resolved events
	let summary = '';
	if (isResolved) {
		if (isFailed && postEvent.kind === 'tool.failure') {
			summary = summarizeToolResult(toolName, toolInput, undefined, postEvent.data.error);
		} else if (postEvent.kind === 'tool.post') {
			summary = summarizeToolResult(toolName, toolInput, postEvent.data.tool_response);
		}
	}

	// Build header line
	const terminalWidth = parentWidth ?? process.stdout.columns ?? 80;
	const glyphWidth = 2; // "✔ "
	const nameWidth = parsed.displayName.length;

	let headerSuffix: string;
	if (isResolved && summary) {
		// "✔ Tool — summary"
		headerSuffix = ` — ${summary}`;
		const available = terminalWidth - glyphWidth - nameWidth - headerSuffix.length;
		// If summary fits, no inline params needed
		if (available < 0) {
			headerSuffix = truncateLine(headerSuffix, terminalWidth - glyphWidth - nameWidth);
		}
	} else {
		// Pending: show inline params like old UnifiedToolCallEvent
		const inlineParams = formatInlineParams(toolInput);
		const availableForParams = terminalWidth - glyphWidth - nameWidth;
		headerSuffix = truncateLine(inlineParams, Math.max(availableForParams, 10));
	}

	// Expanded view: input JSON + output (if resolved)
	const jsonStr = JSON.stringify(toolInput, null, 2);
	const allLines = jsonStr.split('\n');
	const jsonTruncated = allLines.length > MAX_EXPANDED_LINES;
	const displayLines = jsonTruncated
		? allLines.slice(0, MAX_EXPANDED_LINES)
		: allLines;
	const omitted = allLines.length - displayLines.length;

	return (
		<Box flexDirection="column" marginTop={1}>
			{/* Header line */}
			<Box>
				<Text color={color}>{glyph} </Text>
				<Text color={color} bold>
					{parsed.displayName}
				</Text>
				{isResolved && summary ? (
					<Text dimColor>{headerSuffix}</Text>
				) : (
					<Text dimColor>{headerSuffix}</Text>
				)}
			</Box>

			{/* Expanded: input section */}
			{(verbose || expanded) && (
				<Box paddingLeft={3} flexDirection="column">
					<Text dimColor>{displayLines.join('\n')}</Text>
					{jsonTruncated && <Text dimColor>({omitted} more lines)</Text>}
				</Box>
			)}

			{/* Expanded: output section (only when resolved) */}
			{(verbose || expanded) && isResolved && postEvent && renderOutput(postEvent, parentWidth)}
		</Box>
	);
}

function renderOutput(
	postEvent: FeedEvent,
	parentWidth?: number,
): React.ReactNode {
	if (postEvent.kind === 'tool.failure') {
		return (
			<ToolResultContainer
				gutterColor="red"
				dimGutter={false}
				parentWidth={parentWidth}
			>
				<Text color="red">{postEvent.data.error}</Text>
			</ToolResultContainer>
		);
	}
	if (postEvent.kind === 'tool.post') {
		const toolName = postEvent.data.tool_name;
		const toolInput = postEvent.data.tool_input ?? {};
		const toolResponse = postEvent.data.tool_response;
		const outputMeta = extractToolOutput(toolName, toolInput, toolResponse);
		return (
			<ToolResultContainer
				previewLines={outputMeta?.previewLines}
				totalLineCount={outputMeta?.totalLineCount}
				toolId={postEvent.data.tool_use_id}
				parentWidth={parentWidth}
			>
				{(availableWidth: number) => (
					<ToolOutputRenderer
						toolName={toolName}
						toolInput={toolInput}
						toolResponse={toolResponse}
						availableWidth={availableWidth}
					/>
				)}
			</ToolResultContainer>
		);
	}
	return null;
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run source/components/MergedToolCallEvent.test.tsx`
Expected: All tests PASS

**Step 5: Run lint + typecheck**

Run: `npm run lint && npm run build`
Expected: Clean

**Step 6: Commit**

```bash
git add source/components/MergedToolCallEvent.tsx source/components/MergedToolCallEvent.test.tsx
git commit -m "feat(feed): add MergedToolCallEvent component for paired tool rendering"
```

---

### Task 4: Build `postByToolUseId` lookup map in `useFeed`

**Files:**

- Modify: `source/hooks/useFeed.ts:357-373` (items useMemo)
- Modify: `source/hooks/useFeed.ts:52-77` (UseFeedResult type)

**Step 1: Write the failing test**

Create `source/hooks/useFeed.postIndex.test.ts`:

```typescript
import {describe, it, expect} from 'vitest';
import {buildPostByToolUseId} from '../hooks/useFeed.js';
import type {FeedEvent} from '../feed/types.js';

function makeFeedEvent(
	kind: FeedEvent['kind'],
	data: Record<string, unknown>,
): FeedEvent {
	return {
		event_id: `evt-${Math.random()}`,
		seq: 1,
		ts: Date.now(),
		session_id: 's1',
		run_id: 's1:R1',
		kind,
		level: 'info',
		actor_id: 'agent:root',
		title: 'test',
		data,
	} as FeedEvent;
}

describe('buildPostByToolUseId', () => {
	it('maps tool.post events by tool_use_id', () => {
		const events: FeedEvent[] = [
			makeFeedEvent('tool.pre', {
				tool_name: 'Bash',
				tool_input: {},
				tool_use_id: 'tu-1',
			}),
			makeFeedEvent('tool.post', {
				tool_name: 'Bash',
				tool_input: {},
				tool_use_id: 'tu-1',
				tool_response: 'ok',
			}),
		];
		const map = buildPostByToolUseId(events);
		expect(map.get('tu-1')).toBeDefined();
		expect(map.get('tu-1')?.kind).toBe('tool.post');
	});

	it('maps tool.failure events by tool_use_id', () => {
		const events: FeedEvent[] = [
			makeFeedEvent('tool.pre', {
				tool_name: 'Bash',
				tool_input: {},
				tool_use_id: 'tu-2',
			}),
			makeFeedEvent('tool.failure', {
				tool_name: 'Bash',
				tool_input: {},
				tool_use_id: 'tu-2',
				error: 'fail',
			}),
		];
		const map = buildPostByToolUseId(events);
		expect(map.get('tu-2')?.kind).toBe('tool.failure');
	});

	it('returns empty map for events without tool_use_id', () => {
		const events: FeedEvent[] = [
			makeFeedEvent('tool.post', {
				tool_name: 'Bash',
				tool_input: {},
				tool_response: 'ok',
			}),
		];
		const map = buildPostByToolUseId(events);
		expect(map.size).toBe(0);
	});

	it('ignores non-tool events', () => {
		const events: FeedEvent[] = [
			makeFeedEvent('notification', {message: 'hello'}),
		];
		const map = buildPostByToolUseId(events);
		expect(map.size).toBe(0);
	});
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run source/hooks/useFeed.postIndex.test.ts`
Expected: FAIL — `buildPostByToolUseId` not exported

**Step 3: Add the builder function to useFeed.ts**

Add this exported function in `source/hooks/useFeed.ts` (before the `useFeed` hook function, around line 89):

```typescript
/** Build a lookup index: tool_use_id → post/failure FeedEvent */
export function buildPostByToolUseId(
	events: FeedEvent[],
): Map<string, FeedEvent> {
	const map = new Map<string, FeedEvent>();
	for (const e of events) {
		if (e.kind !== 'tool.post' && e.kind !== 'tool.failure') continue;
		const toolUseId = e.data.tool_use_id;
		if (toolUseId) map.set(toolUseId, e);
	}
	return map;
}
```

**Step 4: Add `postByToolUseId` to the `UseFeedResult` type and the returned object**

In `UseFeedResult` type (around line 52), add:

```typescript
postByToolUseId: Map<string, FeedEvent>;
```

In the useMemo or return block, add a computed map. Add a new `useMemo` after the `items` memo (around line 373):

```typescript
const postByToolUseId = useMemo(
	() => buildPostByToolUseId(feedEvents),
	[feedEvents],
);
```

Then add `postByToolUseId` to the return object (around line 392).

**Step 5: Run tests to verify they pass**

Run: `npx vitest run source/hooks/useFeed.postIndex.test.ts`
Expected: All tests PASS

**Step 6: Run full typecheck**

Run: `npm run build`
Expected: Clean (may need to update callers of `useFeed` that destructure the result — check `app.tsx` and `HookContext.tsx`)

**Step 7: Commit**

```bash
git add source/hooks/useFeed.ts source/hooks/useFeed.postIndex.test.ts
git commit -m "feat(feed): add postByToolUseId lookup map to useFeed"
```

---

### Task 5: Wire `postByToolUseId` through FeedList → HookEvent → MergedToolCallEvent

**Files:**

- Modify: `source/components/FeedList.tsx:9-15` (Props type), `source/components/FeedList.tsx:21-58` (renderItem), `source/components/FeedList.tsx:60-125` (FeedList component)
- Modify: `source/components/HookEvent.tsx:10-20` (Props type), `source/components/HookEvent.tsx:22-104` (routing logic)
- Modify: `source/feed/expandable.ts` (add `tool.post` and `tool.failure` to expandable set for merged events)
- Modify: Callers that render `<FeedList>` to pass the new prop (likely `app.tsx` or wherever FeedList is used)

**Step 1: Update `HookEvent` props and routing**

In `source/components/HookEvent.tsx`:

1. Add `postByToolUseId` to the Props type:

```typescript
type Props = {
	event: FeedEvent;
	postByToolUseId?: Map<string, FeedEvent>;
	verbose?: boolean;
	expanded?: boolean;
	parentWidth?: number;
};
```

2. Import `MergedToolCallEvent`:

```typescript
import MergedToolCallEvent from './MergedToolCallEvent.js';
```

3. Add `VERBOSE_ONLY_KINDS` set (from design doc) at top of file:

```typescript
const VERBOSE_ONLY_KINDS: ReadonlySet<FeedEventKind> = new Set([
	'session.start',
	'session.end',
	'run.start',
	'run.end',
	'user.prompt',
	'notification',
	'unknown.hook',
	'compact.pre',
	'config.change',
]);
```

4. Replace the existing `!verbose` check and `tool.pre`/`tool.post` routing:

- First guard: `if (!verbose && VERBOSE_ONLY_KINDS.has(event.kind)) return null;`
- `tool.pre` (non-Task, non-AskUserQuestion): look up `postByToolUseId?.get(event.data.tool_use_id)` and pass as `postEvent` to `MergedToolCallEvent`
- `tool.post`/`tool.failure` (non-Task): check if paired → `postByToolUseId` has this event's `tool_use_id` as a value AND a matching `tool.pre` exists → return null. Actually simpler: check if the event's `tool_use_id` exists as a key in a reverse lookup. **Better approach**: check if the event has a `cause.tool_use_id` that corresponds to an existing `tool.pre` in the feed. Since we don't have that reverse map, the simplest approach: if `postByToolUseId` is provided and `postByToolUseId.get(event.data.tool_use_id) === event`, then this post event is paired → return null.

Actually, the simplest check: for `tool.post`/`tool.failure`, check if `postByToolUseId` is provided (meaning the caller is using the new merge model). If the map exists and the event's `tool_use_id` is a key in the map, AND the value matches this exact event, then it's paired and the pre event will render it → return null.

```typescript
// tool.post / tool.failure — check if paired with a tool.pre (merged rendering)
if (
	(event.kind === 'tool.post' || event.kind === 'tool.failure') &&
	event.data.tool_name !== 'Task' &&
	postByToolUseId &&
	event.data.tool_use_id &&
	postByToolUseId.get(event.data.tool_use_id) === event
) {
	return null; // Rendered by the paired tool.pre's MergedToolCallEvent
}
```

5. For `tool.pre` (non-special tools), replace `UnifiedToolCallEvent` with:

```typescript
if (event.kind === 'tool.pre' || event.kind === 'permission.request') {
	const postEvent = event.data.tool_use_id
		? postByToolUseId?.get(event.data.tool_use_id)
		: undefined;
	return (
		<MergedToolCallEvent
			event={event}
			postEvent={postEvent}
			verbose={verbose}
			expanded={expanded}
			parentWidth={parentWidth}
		/>
	);
}
```

**Step 2: Update FeedList to pass postByToolUseId**

In `source/components/FeedList.tsx`:

1. Add to Props:

```typescript
type Props = {
	items: FeedItem[];
	focusedId: string | undefined;
	expandedSet: ReadonlySet<string>;
	verbose?: boolean;
	dialogActive: boolean;
	postByToolUseId?: Map<string, FeedEvent>;
};
```

2. Update `renderItem` to accept and forward `postByToolUseId`:

```typescript
function renderItem(
	item: FeedItem,
	focusedId: string | undefined,
	expandedSet: ReadonlySet<string>,
	verbose?: boolean,
	parentWidth?: number,
	postByToolUseId?: Map<string, FeedEvent>,
): React.ReactNode {
```

3. Pass it to `HookEvent`:

```typescript
<HookEvent
	event={event}
	postByToolUseId={postByToolUseId}
	verbose={verbose}
	expanded={expandedSet.has(event.event_id)}
	parentWidth={parentWidth}
/>
```

4. Update both call sites in `FeedList` (Static + viewport) to pass it through.

**Step 3: Update the caller of FeedList**

Find where `<FeedList>` is rendered (likely `app.tsx`) and pass `postByToolUseId` from the `useFeed` result.

**Step 4: Run existing tests**

Run: `npx vitest run source/components/`
Expected: Some `HookEvent.test.tsx` tests may need updates since `tool.post` events now render as null when not paired (but tests don't pass `postByToolUseId`, so they'll still render via `PostToolResult` — the null check requires `postByToolUseId` to be provided AND the event to be in the map). Actually, existing tests don't pass `postByToolUseId`, so the map check `postByToolUseId && ...` will be falsy → old behavior preserved. Good.

Run: `npm run build`
Expected: Clean compile

**Step 5: Update HookEvent tests to cover new behavior**

Add to `source/components/HookEvent.test.tsx`:

```typescript
it('renders tool.post as null when paired via postByToolUseId', () => {
	const postEvent = makeFeedEvent('tool.post', {
		tool_name: 'Bash',
		tool_input: {command: 'echo hi'},
		tool_use_id: 'tu-1',
		tool_response: 'hi',
	});
	const map = new Map([['tu-1', postEvent]]);
	const {lastFrame} = render(
		<HookEvent event={postEvent} postByToolUseId={map} />,
	);
	expect(lastFrame()).toBe('');
});

it('renders tool.pre as merged event with success glyph when post exists', () => {
	const preEvent = makeFeedEvent('tool.pre', {
		tool_name: 'Bash',
		tool_input: {command: 'echo hi'},
		tool_use_id: 'tu-1',
	});
	const postEvent = makeFeedEvent('tool.post', {
		tool_name: 'Bash',
		tool_input: {command: 'echo hi'},
		tool_use_id: 'tu-1',
		tool_response: {stdout: 'hi\n', stderr: '', exitCode: 0},
	});
	const map = new Map([['tu-1', postEvent]]);
	const {lastFrame} = render(
		<HookEvent event={preEvent} postByToolUseId={map} />,
	);
	const frame = lastFrame() ?? '';
	expect(frame).toContain('✔');
	expect(frame).toContain('Bash');
});

it('hides verbose-only events when verbose is false', () => {
	for (const kind of ['session.end', 'run.start', 'run.end', 'notification', 'unknown.hook', 'compact.pre', 'config.change'] as const) {
		const event = makeFeedEvent(kind, {} as Record<string, unknown>);
		const {lastFrame} = render(<HookEvent event={event} />);
		expect(lastFrame()).toBe('');
	}
});

it('shows verbose-only events when verbose is true', () => {
	const event = makeFeedEvent('session.end', {reason: 'done'});
	const {lastFrame} = render(<HookEvent event={event} verbose />);
	const frame = lastFrame() ?? '';
	expect(frame).not.toBe('');
});
```

**Step 6: Run all tests**

Run: `npx vitest run source/`
Expected: All PASS

**Step 7: Run lint + typecheck**

Run: `npm run lint && npm run build`
Expected: Clean

**Step 8: Commit**

```bash
git add source/components/HookEvent.tsx source/components/FeedList.tsx source/components/HookEvent.test.tsx
git add -A  # catch any caller updates (app.tsx etc.)
git commit -m "feat(feed): wire merged tool events through FeedList → HookEvent → MergedToolCallEvent"
```

---

### Task 6: Update expandable set for merged events

The expand/collapse affordance (`▸`/`▾`) should work on merged tool events.

**Files:**

- Modify: `source/feed/expandable.ts`

**Step 1: Verify current behavior**

`tool.pre` is already in `EXPANDABLE_KINDS`. Since we're keeping `tool.pre` as the event in the feed, the expand affordance already works. However, `tool.post` and `tool.failure` are NOT expandable, which is correct — they render as null when paired.

No changes needed to `expandable.ts`. Skip this task.

---

### Task 7: Clean up — remove UnifiedToolCallEvent import from HookEvent

**Files:**

- Modify: `source/components/HookEvent.tsx` — remove `UnifiedToolCallEvent` import if no longer used

**Step 1: Check if UnifiedToolCallEvent is still needed**

After Task 5, `HookEvent` no longer renders `UnifiedToolCallEvent` — it uses `MergedToolCallEvent` for all `tool.pre`/`permission.request` events. Remove the import.

Note: Do NOT delete `UnifiedToolCallEvent.tsx` itself — it may be imported in tests or other places. Check first. If only imported by `HookEvent`, it can be deleted. If tests import it directly, keep it or migrate those tests to `MergedToolCallEvent`.

**Step 2: Verify no other imports of UnifiedToolCallEvent**

Run: `grep -r "UnifiedToolCallEvent" source/ --include="*.ts" --include="*.tsx" -l`

If only `HookEvent.tsx` and its own test file import it:

- Remove the import from `HookEvent.tsx`
- Update `UnifiedToolCallEvent.test.tsx` tests to use `MergedToolCallEvent` instead, or delete them if fully covered by new tests

**Step 3: Run all tests and lint**

Run: `npx vitest run source/ && npm run lint && npm run build`
Expected: All clean

**Step 4: Commit**

```bash
git add -A
git commit -m "refactor(feed): remove UnifiedToolCallEvent in favor of MergedToolCallEvent"
```

---

### Task 8: Final integration test — end-to-end feed rendering

**Files:**

- Verify: `source/components/__tests__/FeedList.test.tsx` or add a new integration-level test

**Step 1: Write an integration test**

Add to `source/components/__tests__/FeedList.test.tsx` (or create if not suitable):

```typescript
it('renders merged tool event as single line in feed', () => {
	// Create a feed with tool.pre + tool.post
	const preEvent = makeFeedEvent('tool.pre', {
		tool_name: 'Edit',
		tool_input: {file_path: 'app.ts', old_string: 'a', new_string: 'b'},
		tool_use_id: 'tu-1',
	});
	const postEvent = makeFeedEvent('tool.post', {
		tool_name: 'Edit',
		tool_input: {file_path: 'app.ts', old_string: 'a', new_string: 'b'},
		tool_use_id: 'tu-1',
		tool_response: {filePath: 'app.ts', success: true},
	});
	const items: FeedItem[] = [
		{type: 'feed', data: {...preEvent, seq: 1}},
		{type: 'feed', data: {...postEvent, seq: 2}},
	];
	const postMap = new Map([['tu-1', postEvent]]);
	const {lastFrame} = render(
		<FeedList
			items={items}
			focusedId={undefined}
			expandedSet={new Set()}
			postByToolUseId={postMap}
			dialogActive={false}
		/>,
	);
	const frame = stripAnsi(lastFrame() ?? '');
	// Should show merged line with success glyph
	expect(frame).toContain('✔');
	expect(frame).toContain('Edit');
	// Should NOT show the tool.post as a separate line
	const lines = frame.split('\n').filter(l => l.includes('Edit'));
	expect(lines.length).toBe(1);
});
```

**Step 2: Run the test**

Run: `npx vitest run source/components/__tests__/FeedList.test.tsx`
Expected: PASS

**Step 3: Run full test suite + lint + typecheck**

Run: `npm test && npm run lint && npm run build`
Expected: All clean

**Step 4: Commit**

```bash
git add -A
git commit -m "test(feed): add integration test for merged tool event rendering"
```

---

### Summary

| Task | Description                                         | Estimated Steps |
| ---- | --------------------------------------------------- | --------------- |
| 1    | Add glyphs to registry                              | 4 steps         |
| 2    | Create `summarizeToolResult`                        | 6 steps         |
| 3    | Create `MergedToolCallEvent` component              | 6 steps         |
| 4    | Build `postByToolUseId` lookup in useFeed           | 7 steps         |
| 5    | Wire everything through FeedList → HookEvent        | 8 steps         |
| 6    | ~~Update expandable set~~ (skipped — already works) | 0               |
| 7    | Clean up UnifiedToolCallEvent                       | 4 steps         |
| 8    | Integration test                                    | 4 steps         |

**Total: 7 tasks, ~39 steps**

Dependencies: Task 1 and 2 are independent (parallel). Task 3 depends on 1+2. Task 4 is independent. Task 5 depends on 3+4. Task 7 depends on 5. Task 8 depends on 5.
