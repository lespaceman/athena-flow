# Summary Column Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the feed summary column to follow a consistent verb+target+outcome structure, eliminating noise ("— done"), cleaning up MCP prefixes, compacting paths, and right-aligning informative outcomes.

**Architecture:** All changes are in the summary generation pipeline: `toolSummary.ts` (outcome text), `format.ts` (path shortening + input extraction), `timeline.ts` (assembly + verb extraction + right-alignment), and `feedLineStyle.ts` (zero-result tinting). No changes to the feed model, mapper, or event types.

**Tech Stack:** TypeScript, vitest, chalk (for styling in feedLineStyle)

---

### Task 1: Kill "— done" — toolSummary.ts

The biggest noise reduction. The `summarizeToolResult()` fallback returns `'done'` for unknown tools and several known tools. Change these to return `''` (empty string), and update `mergedEventSummary()` to omit the ` — ` separator when the result is empty.

**Files:**
- Modify: `source/utils/toolSummary.ts`
- Modify: `source/feed/timeline.ts:525-560` (mergedEventSummary)
- Test: `source/utils/toolSummary.test.ts`
- Test: `source/feed/timeline.test.ts`

**Step 1: Write failing tests in toolSummary.test.ts**

Add tests asserting that unknown tools return `''` and that known tools return `''` instead of `'done'` when they can't extract data:

```ts
it('returns empty string for unknown tools instead of done', () => {
	expect(summarizeToolResult('mcp__x__navigate', {}, {})).toBe('');
});

it('returns empty string for Read when no content extracted', () => {
	expect(summarizeToolResult('Read', {}, null)).toBe('');
});

it('returns empty string for Glob when no filenames or numFiles', () => {
	expect(summarizeToolResult('Glob', {}, {})).toBe('');
});

it('returns empty string for WebSearch when no results', () => {
	expect(summarizeToolResult('WebSearch', {}, {})).toBe('');
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run source/utils/toolSummary.test.ts`
Expected: FAIL — these currently return `'done'`

**Step 3: Update toolSummary.ts**

Change all `return 'done'` to `return ''`:
- Line 39: `summarizeBash` fallback → `return ''`
- Line 51: `summarizeRead` fallback → `return ''`
- Line 83: `summarizeGlob` fallback → `return ''`
- Line 108: `summarizeWebSearch` fallback → `return ''`
- Line 150: catch block → `return ''`
- Line 153: default fallback → `return ''`

Change `summarizeTask` (line 111-117) to return just the agent type (outcome badge):
```ts
function summarizeTask(
	input: Record<string, unknown>,
	_response: unknown,
): string {
	const agentType = input['subagent_type'] ?? 'agent';
	return String(agentType);
}
```

**Step 4: Update mergedEventSummary in timeline.ts**

In `mergedEventSummary()` (line 557-559), skip the ` — ` separator when resultText is empty:

```ts
const prefix = primaryInput ? `${name} ${primaryInput}` : name;
if (!resultText) {
	return {text: compactText(prefix, 200), dimStart: name.length};
}
const full = `${prefix} — ${resultText}`;
return {text: compactText(full, 200), dimStart: name.length};
```

**Step 5: Run tests to verify they pass**

Run: `npx vitest run source/utils/toolSummary.test.ts source/feed/timeline.test.ts`
Expected: PASS

**Step 6: Run lint and typecheck**

Run: `npm run lint && npx tsc --noEmit`

**Step 7: Commit**

```bash
git add source/utils/toolSummary.ts source/feed/timeline.ts source/utils/toolSummary.test.ts source/feed/timeline.test.ts
git commit -m "feat(feed): remove '— done' noise from summary column"
```

---

### Task 2: Clean verb extraction — strip MCP bracket prefix

Strip `[server-name]` prefix from MCP tool display names in the summary column. The ACTOR column already provides server context. Extract a clean human verb from the MCP action name.

**Files:**
- Modify: `source/feed/timeline.ts:222-235` (formatToolSummary)
- Create: `source/feed/verbMap.ts` (MCP action → clean verb mapping)
- Test: `source/feed/timeline.test.ts`

**Step 1: Write failing test in timeline.test.ts**

```ts
it('strips MCP bracket prefix and uses clean verb', () => {
	const event = makeToolPreEvent('mcp__plugin_x_agent-web-interface__navigate', {url: 'https://google.com'});
	const result = eventSummary(event);
	expect(result.text).toMatch(/^Navigate /);
	expect(result.text).not.toContain('[agent-web-interface]');
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/feed/timeline.test.ts`
Expected: FAIL — currently produces `[agent-web-interface] navigate ...`

**Step 3: Create verbMap.ts**

```ts
// source/feed/verbMap.ts

/** Maps MCP action names to clean human-readable verbs. */
const MCP_VERB_MAP: Record<string, string> = {
	navigate: 'Navigate',
	find_elements: 'Find',
	click: 'Click',
	close_session: 'Close',
	close_page: 'Close',
	type: 'Type',
	take_screenshot: 'Screenshot',
	capture_snapshot: 'Snapshot',
	scroll_page: 'Scroll',
	scroll_element_into_view: 'Scroll',
	hover: 'Hover',
	press: 'Press',
	select: 'Select',
	go_back: 'Back',
	go_forward: 'Forward',
	reload: 'Reload',
	list_pages: 'Pages',
	get_element_details: 'Inspect',
	get_form_understanding: 'FormScan',
	get_field_context: 'FieldInfo',
	ping: 'Ping',
	// context7
	'resolve-library-id': 'Resolve',
	'query-docs': 'QueryDocs',
};

/**
 * Resolve a clean verb for display.
 * For MCP tools, strips the [server] prefix and maps action → human verb.
 * For built-in tools, returns the tool name as-is (already a clean verb).
 */
export function resolveVerb(toolName: string, parsed: {isMcp: boolean; mcpAction?: string}): string {
	if (!parsed.isMcp || !parsed.mcpAction) return toolName;
	const mapped = MCP_VERB_MAP[parsed.mcpAction];
	if (mapped) return mapped;
	// Fallback: capitalize first letter of action
	const action = parsed.mcpAction;
	return action.charAt(0).toUpperCase() + action.slice(1).replace(/_/g, ' ');
}
```

**Step 4: Update formatToolSummary in timeline.ts**

Replace `resolveDisplayName()` usage with `resolveVerb()` for the summary column. Keep `resolveDisplayName()` for `eventDetail()` (the DETAIL column still shows `[server] action`).

```ts
import {resolveVerb} from './verbMap.js';

function formatToolSummary(
	toolName: string,
	toolInput: Record<string, unknown>,
	errorSuffix?: string,
): ToolSummaryResult {
	const parsed = parseToolName(toolName);
	const verb = resolveVerb(toolName, parsed);
	const primaryInput = summarizeToolPrimaryInput(toolName, toolInput);
	const secondary = [primaryInput, errorSuffix].filter(Boolean).join(' ');
	if (!secondary) {
		return {text: compactText(verb, 200)};
	}
	const full = `${verb} ${secondary}`;
	return {text: compactText(full, 200), dimStart: verb.length + 1};
}
```

**Step 5: Run tests**

Run: `npx vitest run source/feed/timeline.test.ts`
Expected: PASS

**Step 6: Run lint and typecheck**

Run: `npm run lint && npx tsc --noEmit`

**Step 7: Commit**

```bash
git add source/feed/verbMap.ts source/feed/timeline.ts source/feed/timeline.test.ts
git commit -m "feat(feed): extract clean verbs, strip MCP bracket prefix from summaries"
```

---

### Task 3: Compact paths with `…/` prefix

Update `shortenPath` to prefix with `…/` when segments are dropped, and strip leading `/` for absolute paths.

**Files:**
- Modify: `source/utils/format.ts:103-107` (shortenPath)
- Test: `source/utils/format.test.ts`

**Step 1: Write failing tests in format.test.ts**

```ts
describe('shortenPath', () => {
	it('prefixes with …/ when segments are dropped', () => {
		expect(shortenPath('/home/user/projects/athena/source/feed/timeline.ts'))
			.toBe('…/feed/timeline.ts');
	});

	it('leaves short paths unchanged', () => {
		expect(shortenPath('feed/timeline.ts')).toBe('feed/timeline.ts');
	});

	it('leaves single segment unchanged', () => {
		expect(shortenPath('timeline.ts')).toBe('timeline.ts');
	});

	it('strips absolute prefix even for 2-segment paths', () => {
		expect(shortenPath('/home/file.ts')).toBe('home/file.ts');
	});
});
```

Note: `shortenPath` is currently not exported. Export it to test, or test it through `summarizeToolPrimaryInput`.

**Step 2: Run tests to verify they fail**

Run: `npx vitest run source/utils/format.test.ts`
Expected: FAIL — currently no `…/` prefix

**Step 3: Update shortenPath**

```ts
export function shortenPath(filePath: string): string {
	const segments = filePath.split('/').filter(Boolean);
	if (segments.length <= 2) return segments.join('/');
	return '…/' + segments.slice(-2).join('/');
}
```

**Step 4: Run tests**

Run: `npx vitest run source/utils/format.test.ts`
Expected: PASS

**Step 5: Run lint and typecheck**

Run: `npm run lint && npx tsc --noEmit`

**Step 6: Commit**

```bash
git add source/utils/format.ts source/utils/format.test.ts
git commit -m "feat(feed): add …/ prefix to shortened paths"
```

---

### Task 4: Right-align outcomes in summary column

Add an `outcome` field to `SummaryResult` so the rendering layer can right-align it. Update `formatFeedLine` to pad between target and outcome.

**Files:**
- Modify: `source/feed/timeline.ts` (SummaryResult type, mergedEventSummary, formatFeedLine)
- Modify: `source/hooks/useTimeline.ts` (pass outcome to TimelineEntry)
- Modify: `source/utils/buildBodyLines.ts` (if it references summary)
- Test: `source/feed/timeline.test.ts`

**Step 1: Write failing test**

```ts
it('mergedEventSummary returns outcome separately', () => {
	const pre = makeToolPreEvent('Glob', {pattern: '**/*.ts'});
	const post = makeToolPostEvent('Glob', {pattern: '**/*.ts'}, {filenames: new Array(13)});
	const result = mergedEventSummary(pre, post);
	expect(result.outcome).toBe('13 files');
	expect(result.text).not.toContain('—');
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/feed/timeline.test.ts`

**Step 3: Update SummaryResult and TimelineEntry types**

In `timeline.ts`:
```ts
export type SummaryResult = {
	text: string;
	dimStart?: number;
	/** Right-aligned outcome text (e.g., "13 files", "exit 0"). Empty/undefined = no outcome. */
	outcome?: string;
	/** True when outcome is a zero-result (0 files, 0 matches) — signals warning tint. */
	outcomeZero?: boolean;
};
```

Add to `TimelineEntry`:
```ts
summaryOutcome?: string;
summaryOutcomeZero?: boolean;
```

**Step 4: Update mergedEventSummary to separate outcome**

Instead of assembling `prefix — resultText`, return:
```ts
const prefix = primaryInput ? `${verb} ${primaryInput}` : verb;
if (!resultText) {
	return {text: compactText(prefix, 200), dimStart: verb.length};
}
const isZero = /^0\s/.test(resultText);
return {
	text: compactText(prefix, 200),
	dimStart: verb.length,
	outcome: resultText,
	outcomeZero: isZero,
};
```

**Step 5: Update formatFeedLine to right-align outcome**

```ts
export function formatFeedLine(
	entry: TimelineEntry,
	width: number,
	focused: boolean,
	expanded: boolean,
	matched: boolean,
	ascii = false,
): string {
	const g = feedGlyphs(ascii);
	const glyph = entry.expandable
		? expanded
			? g.expandExpanded
			: g.expandCollapsed
		: ' ';
	const suffix = ` ${glyph}`;
	const time = fit(formatClock(entry.ts), 5);
	const event = fit(entry.op, 12);
	const actor = fit(entry.actor, 10);
	const bodyWidth = Math.max(0, width - 3);
	const summaryWidth = Math.max(0, bodyWidth - 30);

	let summaryText: string;
	if (entry.summaryOutcome && summaryWidth > 20) {
		const outcomeLen = entry.summaryOutcome.length;
		const targetWidth = summaryWidth - outcomeLen - 2; // 2-space gap minimum
		if (targetWidth > 10) {
			const target = fit(entry.summary, targetWidth);
			summaryText = target + fit(entry.summaryOutcome, summaryWidth - targetWidth);
		} else {
			// Too narrow — inline with 2-space gap
			summaryText = fit(`${entry.summary}  ${entry.summaryOutcome}`, summaryWidth);
		}
	} else {
		summaryText = fit(entry.summary, summaryWidth);
	}

	const body = fit(
		`${time} ${event} ${actor} ${summaryText}`,
		bodyWidth,
	);
	return ` ${body}${suffix}`;
}
```

**Step 6: Update useTimeline.ts to pass outcome fields**

In the `entries.push()` call (~line 130-146), add:
```ts
summaryOutcome: pairedPost ? mergedResult.outcome : undefined,
summaryOutcomeZero: pairedPost ? mergedResult.outcomeZero : undefined,
```

**Step 7: Update buildBodyLines.ts to pass outcome fields**

Find where `TimelineEntry` is constructed and add the new fields.

**Step 8: Run all tests**

Run: `npx vitest run source/feed/timeline.test.ts source/hooks/useTimeline.test.ts`
Expected: PASS

**Step 9: Run lint and typecheck**

Run: `npm run lint && npx tsc --noEmit`

**Step 10: Commit**

```bash
git add source/feed/timeline.ts source/hooks/useTimeline.ts source/utils/buildBodyLines.ts source/feed/timeline.test.ts
git commit -m "feat(feed): right-align outcomes in summary column"
```

---

### Task 5: Humanize browser operation parameters

Add MCP-specific primary input extractors for browser tools (navigate → domain, find_elements → kind+label, click → truncated eid, type → text+selector).

**Files:**
- Modify: `source/utils/format.ts:112-133` (PRIMARY_INPUT_EXTRACTORS)
- Test: `source/utils/format.test.ts`

**Step 1: Write failing tests**

```ts
describe('MCP browser input extractors', () => {
	it('navigate extracts domain from url', () => {
		const result = summarizeToolPrimaryInput(
			'mcp__plugin_x_agent-web-interface__navigate',
			{url: 'https://www.google.com/search?q=test'},
		);
		expect(result).toBe('google.com');
	});

	it('find_elements shows kind and label', () => {
		const result = summarizeToolPrimaryInput(
			'mcp__plugin_x_agent-web-interface__find_elements',
			{kind: 'button', label: 'Feeling Lucky'},
		);
		expect(result).toBe('button "Feeling Lucky"');
	});

	it('click truncates eid', () => {
		const result = summarizeToolPrimaryInput(
			'mcp__plugin_x_agent-web-interface__click',
			{eid: '264ddc58e08d'},
		);
		expect(result).toBe('eid:264ddc…');
	});

	it('type shows text and eid', () => {
		const result = summarizeToolPrimaryInput(
			'mcp__plugin_x_agent-web-interface__type',
			{text: 'hello world', eid: 'abc123'},
		);
		expect(result).toBe('"hello world" → abc12…');
	});
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run source/utils/format.test.ts`

**Step 3: Add MCP input extractors**

In `format.ts`, update `summarizeToolPrimaryInput` to check for MCP action names:

```ts
import {parseToolName} from './toolNameParser.js';

/** Extractors keyed by MCP action name (for MCP tools). */
const MCP_INPUT_EXTRACTORS: Record<string, (input: Record<string, unknown>) => string> = {
	navigate: input => {
		const url = String(input.url ?? '');
		try {
			const u = new URL(url);
			return u.hostname.replace(/^www\./, '');
		} catch {
			return compactText(url, 40);
		}
	},
	find_elements: input => {
		const parts: string[] = [];
		if (input.kind) parts.push(String(input.kind));
		if (input.label) parts.push(`"${String(input.label)}"`);
		return parts.join(' ') || '';
	},
	click: input => {
		const eid = String(input.eid ?? '');
		return eid ? `eid:${eid.slice(0, 6)}…` : '';
	},
	type: input => {
		const text = String(input.text ?? '');
		const eid = input.eid ? String(input.eid).slice(0, 5) + '…' : '';
		const quoted = `"${compactText(text, 30)}"`;
		return eid ? `${quoted} → ${eid}` : quoted;
	},
	hover: input => {
		const eid = String(input.eid ?? '');
		return eid ? `eid:${eid.slice(0, 6)}…` : '';
	},
	select: input => {
		const value = String(input.value ?? '');
		return value ? `"${compactText(value, 30)}"` : '';
	},
	press: input => String(input.key ?? ''),
	scroll_page: input => String(input.direction ?? ''),
	take_screenshot: () => '',
	close_session: () => '',
	close_page: () => '',
};

export function summarizeToolPrimaryInput(
	toolName: string,
	toolInput: Record<string, unknown>,
): string {
	if (Object.keys(toolInput).length === 0) return '';

	// Check built-in extractors first
	const extractor = PRIMARY_INPUT_EXTRACTORS[toolName];
	if (extractor) return extractor(toolInput);

	// Check MCP action extractors
	const parsed = parseToolName(toolName);
	if (parsed.isMcp && parsed.mcpAction) {
		const mcpExtractor = MCP_INPUT_EXTRACTORS[parsed.mcpAction];
		if (mcpExtractor) return mcpExtractor(toolInput);
	}

	return summarizeToolInput(toolInput);
}
```

**Step 4: Run tests**

Run: `npx vitest run source/utils/format.test.ts`
Expected: PASS

**Step 5: Run lint and typecheck**

Run: `npm run lint && npx tsc --noEmit`

**Step 6: Commit**

```bash
git add source/utils/format.ts source/utils/format.test.ts
git commit -m "feat(feed): humanize browser operation parameters in summary"
```

---

### Task 6: Task description reorder

Change the Task tool's primary input to show description first, move agent type to outcome.

**Files:**
- Modify: `source/utils/format.ts:126-130` (Task extractor in PRIMARY_INPUT_EXTRACTORS)
- Modify: `source/utils/toolSummary.ts:111-117` (summarizeTask — returns agent type as outcome)
- Test: `source/utils/format.test.ts`

**Step 1: Write failing test**

```ts
it('Task shows description as primary input, not [type] prefix', () => {
	const result = summarizeToolPrimaryInput('Task', {
		subagent_type: 'general-purpose',
		description: 'Write Playwright tests',
	});
	expect(result).toBe('Write Playwright tests');
	expect(result).not.toContain('[general-purpose]');
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/utils/format.test.ts`

**Step 3: Update Task extractor**

In `format.ts` PRIMARY_INPUT_EXTRACTORS:
```ts
Task: input => compactText(String(input.description ?? ''), 60),
```

The `summarizeTask` in toolSummary.ts already returns the agent type (from Task 1 changes). This becomes the right-aligned outcome via the mergedEventSummary flow.

**Step 4: Run tests**

Run: `npx vitest run source/utils/format.test.ts source/utils/toolSummary.test.ts`
Expected: PASS

**Step 5: Run lint and typecheck**

Run: `npm run lint && npx tsc --noEmit`

**Step 6: Commit**

```bash
git add source/utils/format.ts source/utils/toolSummary.ts source/utils/format.test.ts
git commit -m "feat(feed): show Task description first, agent type as outcome badge"
```

---

### Task 7: Zero-result warning tint

Apply warning color to zero-count outcomes ("0 files", "0 matches") in `feedLineStyle.ts`.

**Files:**
- Modify: `source/feed/feedLineStyle.ts` (add outcome styling)
- Modify: `source/feed/feedLineStyle.ts:22-34` (FeedLineStyleOptions — add outcomeZero)
- Modify: `source/utils/buildBodyLines.ts` (pass outcomeZero)
- Test: `source/feed/feedLineStyle.test.ts` (if exists, otherwise add to timeline tests)

**Step 1: Write failing test**

Test that when `outcomeZero` is true, the styled line contains the warning color hex from the theme.

**Step 2: Run test to verify it fails**

**Step 3: Update FeedLineStyleOptions**

Add to the type:
```ts
/** True when the outcome represents a zero result (e.g., "0 files"). */
outcomeZero?: boolean;
```

**Step 4: Update styleFeedLine**

After computing the dim portion, if `outcomeZero` is true and there's an outcome region, apply `theme.status.warning` instead of `theme.textMuted` to the outcome portion of the summary.

The outcome starts at `FEED_SUMMARY_COL_START + summaryWidth - outcomeLength` (needs the outcome length passed through). A simpler approach: the `outcomeZero` flag triggers the entire dim portion to use warning color instead of muted.

```ts
const dimStyle = opts.outcomeZero
	? chalk.hex(theme.status.warning)
	: chalk.hex(theme.textMuted);
```

Replace the dim segment style on line 131-134.

**Step 5: Wire outcomeZero through buildBodyLines and useTimeline**

Pass `summaryOutcomeZero` from `TimelineEntry` into the `FeedLineStyleOptions`.

**Step 6: Run tests**

Run: `npx vitest run source/feed/`
Expected: PASS

**Step 7: Run lint and typecheck**

Run: `npm run lint && npx tsc --noEmit`

**Step 8: Commit**

```bash
git add source/feed/feedLineStyle.ts source/utils/buildBodyLines.ts source/hooks/useTimeline.ts
git commit -m "feat(feed): warning tint for zero-result outcomes (0 files, 0 matches)"
```

---

### Task 8: Final integration test + lint pass

Run the full test suite, lint, and typecheck to ensure nothing is broken.

**Files:**
- No modifications

**Step 1: Run full test suite**

Run: `npx vitest run source/`
Expected: All PASS

**Step 2: Run lint**

Run: `npm run lint`
Expected: Clean

**Step 3: Run typecheck**

Run: `npx tsc --noEmit`
Expected: Clean

**Step 4: Manual smoke test (optional)**

Run: `npm run build && npm start`
Verify feed renders with clean verbs, no "— done", right-aligned outcomes.
