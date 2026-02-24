# Feed Table Column Refinement — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the 4-column feed table (TIME/OP/ACTOR/SUMMARY) with a 5-column layout (TIME/EVENT/DETAIL/ACTOR/SUMMARY) using human-readable Title Case labels, a dedicated DETAIL column, and flex-width SUMMARY.

**Architecture:** All changes are in the timeline rendering pipeline. `eventOperation()` becomes `eventLabel()` (Title Case), a new `eventDetail()` extracts tool names / subagent types, column constants shift, and `feedLineStyle.ts` slice positions update to match. The `TimelineEntry` type gets a `detail` field. Internal `op` field is kept for color/category logic but a parallel `eventTag` preserves the old slug for styling.

**Tech Stack:** TypeScript, Vitest, Ink (React for CLIs)

---

### Task 1: Add `eventLabel()` and `eventDetail()` to timeline.ts

**Files:**
- Modify: `source/feed/timeline.ts:44-101` (eventOperation area)
- Test: `source/feed/timeline.test.ts`

**Step 1: Write failing tests for `eventLabel()`**

Add a new `describe('eventLabel')` block in `source/feed/timeline.test.ts`. Test the complete mapping:

```typescript
import {
	eventLabel,
	eventDetail,
	// ... existing imports
} from './timeline.js';

describe('eventLabel', () => {
	it('returns Title Case labels for all event kinds', () => {
		const cases: Array<[() => FeedEvent, string]> = [
			[() => ({...base(), kind: 'tool.pre' as const, data: {tool_name: 'Bash', tool_input: {}}}), 'Tool Call'],
			[() => ({...base({kind: 'tool.post'}), kind: 'tool.post' as const, data: {tool_name: 'Bash', tool_input: {}, tool_response: {}}}), 'Tool OK'],
			[() => ({...base({kind: 'tool.failure'}), kind: 'tool.failure' as const, data: {tool_name: 'Bash', tool_input: {}, error: 'fail'}}), 'Tool Fail'],
			[() => ({...base({kind: 'user.prompt'}), kind: 'user.prompt' as const, data: {prompt: 'hi', cwd: '/'}}), 'User Prompt'],
			[() => ({...base({kind: 'subagent.start'}), kind: 'subagent.start' as const, data: {agent_id: 'a1', agent_type: 'Explore'}}), 'Sub Start'],
			[() => ({...base({kind: 'subagent.stop'}), kind: 'subagent.stop' as const, data: {agent_id: 'a1', agent_type: 'Explore', stop_hook_active: false}}), 'Sub Stop'],
			[() => ({...base({kind: 'permission.request'}), kind: 'permission.request' as const, data: {tool_name: 'Bash', tool_input: {}, permission_suggestions: []}}), 'Perm Request'],
			[() => ({...base({kind: 'permission.decision'}), kind: 'permission.decision' as const, data: {decision_type: 'allow' as const}}), 'Perm Allow'],
			[() => ({...base({kind: 'permission.decision'}), kind: 'permission.decision' as const, data: {decision_type: 'deny' as const, message: 'no'}}), 'Perm Deny'],
			[() => ({...base({kind: 'permission.decision'}), kind: 'permission.decision' as const, data: {decision_type: 'ask' as const}}), 'Perm Ask'],
			[() => ({...base({kind: 'permission.decision'}), kind: 'permission.decision' as const, data: {decision_type: 'no_opinion' as const}}), 'Perm Skip'],
			[() => ({...base({kind: 'stop.request'}), kind: 'stop.request' as const, data: {stop_hook_active: true}}), 'Stop Request'],
			[() => ({...base({kind: 'stop.decision'}), kind: 'stop.decision' as const, data: {decision_type: 'block' as const, reason: 'x'}}), 'Stop Block'],
			[() => ({...base({kind: 'stop.decision'}), kind: 'stop.decision' as const, data: {decision_type: 'allow' as const}}), 'Stop Allow'],
			[() => ({...base({kind: 'stop.decision'}), kind: 'stop.decision' as const, data: {decision_type: 'no_opinion' as const}}), 'Stop Skip'],
			[() => ({...base({kind: 'run.start'}), kind: 'run.start' as const, data: {trigger: {type: 'user_prompt_submit' as const}}}), 'Run Start'],
			[() => ({...base({kind: 'run.end'}), kind: 'run.end' as const, data: {status: 'completed' as const, counters: {tool_uses: 0, tool_failures: 0, permission_requests: 0, blocks: 0}}}), 'Run OK'],
			[() => ({...base({kind: 'run.end'}), kind: 'run.end' as const, data: {status: 'failed' as const, counters: {tool_uses: 0, tool_failures: 0, permission_requests: 0, blocks: 0}}}), 'Run Fail'],
			[() => ({...base({kind: 'run.end'}), kind: 'run.end' as const, data: {status: 'aborted' as const, counters: {tool_uses: 0, tool_failures: 0, permission_requests: 0, blocks: 0}}}), 'Run Abort'],
			[() => ({...base({kind: 'session.start'}), kind: 'session.start' as const, data: {source: 'startup'}}), 'Sess Start'],
			[() => ({...base({kind: 'session.end'}), kind: 'session.end' as const, data: {reason: 'done'}}), 'Sess End'],
			[() => ({...base({kind: 'notification'}), kind: 'notification' as const, data: {message: 'hi'}}), 'Notify'],
			[() => ({...base({kind: 'compact.pre'}), kind: 'compact.pre' as const, data: {trigger: 'auto'}}), 'Compact'],
			[() => ({...base({kind: 'setup'}), kind: 'setup' as const, data: {trigger: 'init'}}), 'Setup'],
			[() => ({...base({kind: 'unknown.hook'}), kind: 'unknown.hook' as const, data: {hook_event_name: 'x', payload: {}}}), 'Unknown'],
			[() => ({...base({kind: 'todo.add'}), kind: 'todo.add' as const, data: {todo_id: 't1', text: 'x'}}), 'Todo Add'],
			[() => ({...base({kind: 'todo.update'}), kind: 'todo.update' as const, data: {todo_id: 't1', patch: {}}}), 'Todo Update'],
			[() => ({...base({kind: 'todo.done'}), kind: 'todo.done' as const, data: {todo_id: 't1'}}), 'Todo Done'],
			[() => ({...base({kind: 'agent.message'}), kind: 'agent.message' as const, data: {message: 'hi', source: 'hook' as const, scope: 'root' as const}}), 'Agent Msg'],
			[() => ({...base(), kind: 'teammate.idle' as const, data: {teammate_name: 'a', team_name: 'b'}}), 'Team Idle'],
			[() => ({...base(), kind: 'task.completed' as const, data: {task_id: 't1', task_subject: 'x'}}), 'Task OK'],
			[() => ({...base(), kind: 'config.change' as const, data: {source: 'user'}}), 'Config Chg'],
		];
		for (const [factory, expected] of cases) {
			expect(eventLabel(factory())).toBe(expected);
		}
	});
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/feed/timeline.test.ts`
Expected: FAIL — `eventLabel` is not exported

**Step 3: Write failing tests for `eventDetail()`**

```typescript
describe('eventDetail', () => {
	it('returns tool name for tool events', () => {
		const ev = {...base(), kind: 'tool.pre' as const, data: {tool_name: 'Bash', tool_input: {}}};
		expect(eventDetail(ev)).toBe('Bash');
	});

	it('returns friendly MCP tool display for MCP tools', () => {
		const ev = {...base(), kind: 'tool.pre' as const, data: {tool_name: 'mcp__plugin_web-testing_agent-web__navigate', tool_input: {}}};
		expect(eventDetail(ev)).toContain('navigate');
	});

	it('returns tool name for permission.request', () => {
		const ev = {...base({kind: 'permission.request'}), kind: 'permission.request' as const, data: {tool_name: 'Read', tool_input: {}, permission_suggestions: []}};
		expect(eventDetail(ev)).toBe('Read');
	});

	it('returns agent_type for subagent events', () => {
		const ev = {...base({kind: 'subagent.start'}), kind: 'subagent.start' as const, data: {agent_id: 'a1', agent_type: 'general-purpose'}};
		expect(eventDetail(ev)).toBe('general-purpose');
	});

	it('returns priority for todo.add', () => {
		const ev = {...base({kind: 'todo.add'}), kind: 'todo.add' as const, data: {todo_id: 't1', text: 'x', priority: 'p1' as const}};
		expect(eventDetail(ev)).toBe('P1');
	});

	it('returns source for session.start', () => {
		const ev = {...base({kind: 'session.start'}), kind: 'session.start' as const, data: {source: 'startup'}};
		expect(eventDetail(ev)).toBe('startup');
	});

	it('returns source for config.change', () => {
		const ev = {...base(), kind: 'config.change' as const, data: {source: 'user'}};
		expect(eventDetail(ev)).toBe('user');
	});

	it('returns ─ for events without detail', () => {
		const ev = {...base({kind: 'user.prompt'}), kind: 'user.prompt' as const, data: {prompt: 'hi', cwd: '/'}};
		expect(eventDetail(ev)).toBe('─');
	});
});
```

**Step 4: Run test to verify it fails**

Run: `npx vitest run source/feed/timeline.test.ts`
Expected: FAIL — `eventDetail` is not exported

**Step 5: Implement `eventLabel()` in timeline.ts**

Add after line 101 (after `eventOperation`). Keep `eventOperation()` for backward compatibility — it's still used by `mergedEventOperation()` and `opCategoryColor()` internally:

```typescript
/** Human-readable Title Case label for the EVENT column. */
export function eventLabel(event: FeedEvent): string {
	switch (event.kind) {
		case 'run.start':
			return 'Run Start';
		case 'run.end':
			if (event.data.status === 'completed') return 'Run OK';
			if (event.data.status === 'failed') return 'Run Fail';
			return 'Run Abort';
		case 'user.prompt':
			return 'User Prompt';
		case 'tool.pre':
			return 'Tool Call';
		case 'tool.post':
			return 'Tool OK';
		case 'tool.failure':
			return 'Tool Fail';
		case 'subagent.start':
			return 'Sub Start';
		case 'subagent.stop':
			return 'Sub Stop';
		case 'permission.request':
			return 'Perm Request';
		case 'permission.decision':
			switch (event.data.decision_type) {
				case 'allow': return 'Perm Allow';
				case 'deny': return 'Perm Deny';
				case 'ask': return 'Perm Ask';
				case 'no_opinion': return 'Perm Skip';
			}
			break;
		case 'stop.request':
			return 'Stop Request';
		case 'stop.decision':
			switch (event.data.decision_type) {
				case 'block': return 'Stop Block';
				case 'allow': return 'Stop Allow';
				case 'no_opinion': return 'Stop Skip';
			}
			break;
		case 'session.start':
			return 'Sess Start';
		case 'session.end':
			return 'Sess End';
		case 'notification':
			return 'Notify';
		case 'compact.pre':
			return 'Compact';
		case 'setup':
			return 'Setup';
		case 'unknown.hook':
			return 'Unknown';
		case 'todo.add':
			return 'Todo Add';
		case 'todo.update':
			return 'Todo Update';
		case 'todo.done':
			return 'Todo Done';
		case 'agent.message':
			return 'Agent Msg';
		case 'teammate.idle':
			return 'Team Idle';
		case 'task.completed':
			return 'Task OK';
		case 'config.change':
			return 'Config Chg';
		default:
			return 'Event';
	}
	return 'Event'; // unreachable fallback for TS exhaustiveness
}
```

**Step 6: Implement `eventDetail()` in timeline.ts**

Add after `eventLabel()`:

```typescript
/** Extract contextual detail for the DETAIL column (tool name, agent type, etc.). */
export function eventDetail(event: FeedEvent): string {
	switch (event.kind) {
		case 'tool.pre':
		case 'tool.post':
		case 'tool.failure':
			return resolveDisplayName(event.data.tool_name);
		case 'permission.request':
			return resolveDisplayName(event.data.tool_name);
		case 'subagent.start':
		case 'subagent.stop':
			return event.data.agent_type;
		case 'todo.add':
			return (event.data.priority ?? 'p1').toUpperCase();
		case 'todo.update':
			return event.data.todo_id;
		case 'todo.done':
			return event.data.todo_id;
		case 'session.start':
			return event.data.source;
		case 'config.change':
			return event.data.source;
		default:
			return '\u2500'; // ─ em dash placeholder
	}
}
```

**Step 7: Run tests to verify they pass**

Run: `npx vitest run source/feed/timeline.test.ts`
Expected: PASS

**Step 8: Commit**

```bash
git add source/feed/timeline.ts source/feed/timeline.test.ts
git commit -m "feat(feed): add eventLabel() and eventDetail() for Title Case column labels"
```

---

### Task 2: Add `mergedEventLabel()` and update column constants

**Files:**
- Modify: `source/feed/timeline.ts:390-498` (merged helpers + constants + formatFeedLine + formatFeedHeaderLine)
- Test: `source/feed/timeline.test.ts`

**Step 1: Write failing test for `mergedEventLabel()`**

```typescript
import { mergedEventLabel } from './timeline.js';

describe('mergedEventLabel', () => {
	it('returns Tool OK when postEvent is tool.post', () => {
		const pre = {...base({kind: 'tool.pre'}), kind: 'tool.pre' as const, data: {tool_name: 'Bash', tool_input: {}}};
		const post = {...base({kind: 'tool.post'}), kind: 'tool.post' as const, data: {tool_name: 'Bash', tool_input: {}, tool_response: {}}};
		expect(mergedEventLabel(pre, post)).toBe('Tool OK');
	});

	it('returns Tool Fail when postEvent is tool.failure', () => {
		const pre = {...base({kind: 'tool.pre'}), kind: 'tool.pre' as const, data: {tool_name: 'Bash', tool_input: {}}};
		const post = {...base({kind: 'tool.failure'}), kind: 'tool.failure' as const, data: {tool_name: 'Bash', tool_input: {}, error: 'fail', is_interrupt: false}};
		expect(mergedEventLabel(pre, post)).toBe('Tool Fail');
	});

	it('falls back to eventLabel when no postEvent', () => {
		const pre = {...base({kind: 'tool.pre'}), kind: 'tool.pre' as const, data: {tool_name: 'Bash', tool_input: {}}};
		expect(mergedEventLabel(pre)).toBe('Tool Call');
	});
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/feed/timeline.test.ts`
Expected: FAIL

**Step 3: Implement `mergedEventLabel()`**

```typescript
export function mergedEventLabel(event: FeedEvent, postEvent?: FeedEvent): string {
	if (!postEvent) return eventLabel(event);
	if (postEvent.kind === 'tool.failure') return 'Tool Fail';
	if (postEvent.kind === 'tool.post') return 'Tool OK';
	return eventLabel(event);
}
```

**Step 4: Update column constants**

Replace the existing column constants:

```typescript
/** Column positions in formatted feed line (0-indexed char offsets). */
export const FEED_GUTTER_WIDTH = 1;
export const FEED_EVENT_COL_START = 7;      // after " HH:MM " (1+5+1)
export const FEED_EVENT_COL_END = 19;       // 7 + 12 (event width)
export const FEED_DETAIL_COL_START = 20;    // 19 + 1 gap
export const FEED_DETAIL_COL_END = 36;      // 20 + 16 (detail width)
export const FEED_ACTOR_COL_START = 37;     // 36 + 1 gap
export const FEED_ACTOR_COL_END = 47;       // 37 + 10 (actor width)
export const FEED_SUMMARY_COL_START = 48;   // 47 + 1 gap

// Keep old names as aliases for backward compat with feedLineStyle.ts (updated in Task 4)
export const FEED_OP_COL_START = FEED_EVENT_COL_START;
export const FEED_OP_COL_END = FEED_EVENT_COL_END;
```

**Step 5: Update `formatFeedLine()` to 5-column layout**

```typescript
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
	const event = fit(entry.op, 12);    // now Title Case label
	const detail = fit(entry.detail ?? '\u2500', 16);
	const actor = fit(entry.actor, 10);
	const bodyWidth = Math.max(0, width - 3); // 1 gutter + 2 suffix
	const summaryWidth = Math.max(0, bodyWidth - 47); // 5+1+12+1+16+1+10+1 = 47
	const body = fit(
		`${time} ${event} ${detail} ${actor} ${fit(entry.summary, summaryWidth)}`,
		bodyWidth,
	);
	return ` ${body}${suffix}`;
}
```

**Step 6: Update `formatFeedHeaderLine()` to 5-column header**

```typescript
export function formatFeedHeaderLine(width: number): string {
	const time = fit('TIME', 5);
	const event = fit('EVENT', 12);
	const detail = fit('DETAIL', 16);
	const actor = fit('ACTOR', 10);
	const summaryWidth = Math.max(0, width - 50); // 1+5+1+12+1+16+1+10+1+2 = 50
	const summaryLabel = fit('SUMMARY', summaryWidth);
	return fit(` ${time} ${event} ${detail} ${actor} ${summaryLabel}  `, width);
}
```

**Step 7: Update `TimelineEntry` type to include `detail`**

```typescript
export type TimelineEntry = {
	id: string;
	ts: number;
	runId?: string;
	op: string;       // Now stores Title Case label (e.g. "Tool Call")
	opTag: string;    // Internal slug for styling (e.g. "tool.call")
	detail: string;   // DETAIL column content
	actor: string;
	actorId: string;
	summary: string;
	summaryDimStart?: number;
	searchText: string;
	error: boolean;
	expandable: boolean;
	details: string;
	feedEvent?: FeedEvent;
	pairedPostEvent?: FeedEvent;
};
```

**Step 8: Update existing formatFeedLine tests**

Update the `formatFeedLine` test entries to include `detail` and `opTag` fields. Update `formatFeedHeaderLine` test to check for 'EVENT' instead of 'OP':

```typescript
describe('formatFeedHeaderLine', () => {
	it('contains column headers', () => {
		const header = formatFeedHeaderLine(80);
		expect(header).toContain('TIME');
		expect(header).toContain('EVENT');
		expect(header).toContain('DETAIL');
		expect(header).toContain('ACTOR');
		expect(header).toContain('SUMMARY');
	});
	// ...
});
```

**Step 9: Run tests**

Run: `npx vitest run source/feed/timeline.test.ts`
Expected: PASS

**Step 10: Commit**

```bash
git add source/feed/timeline.ts source/feed/timeline.test.ts
git commit -m "feat(feed): 5-column layout with EVENT/DETAIL columns and updated constants"
```

---

### Task 3: Update `useTimeline.ts` to populate `detail` and `opTag`

**Files:**
- Modify: `source/hooks/useTimeline.ts:56-145`

**Step 1: Update imports**

Add `eventLabel`, `eventDetail`, `mergedEventLabel` to imports from `timeline.js`.

**Step 2: Update message entries (line 66-78)**

Add `detail` and `opTag`:

```typescript
entries.push({
	id,
	ts: item.data.timestamp.getTime(),
	runId: activeRunId,
	op: item.data.role === 'user' ? 'User Msg' : 'Agent Msg',
	opTag: item.data.role === 'user' ? 'msg.user' : 'msg.agent',
	detail: '\u2500',
	actor: item.data.role === 'user' ? 'USER' : 'AGENT',
	actorId: item.data.role === 'user' ? 'user' : 'agent:root',
	summary,
	searchText: `${summary}\n${details}`,
	error: false,
	expandable: details.length > 120,
	details,
});
```

**Step 3: Update feed event entries (line 117-139)**

Replace `op` assignment with both `op` (label) and `opTag` (slug), add `detail`:

```typescript
const opTag = pairedPost
	? mergedEventOperation(event, pairedPost)
	: eventOperation(event);
const op = pairedPost
	? mergedEventLabel(event, pairedPost)
	: eventLabel(event);
const detail = eventDetail(event);
// ... rest stays the same
entries.push({
	// ... existing fields
	op,
	opTag,
	detail,
	// ...
});
```

**Step 4: Run all tests**

Run: `npx vitest run source/`
Expected: Some feedLineStyle / buildBodyLines tests may fail due to column position shifts (fixed in Task 4)

**Step 5: Commit**

```bash
git add source/hooks/useTimeline.ts
git commit -m "feat(feed): populate detail and opTag fields in useTimeline"
```

---

### Task 4: Update `feedLineStyle.ts` and `buildBodyLines.ts`

**Files:**
- Modify: `source/feed/feedLineStyle.ts`
- Modify: `source/utils/buildBodyLines.ts`
- Test: `source/feed/feedLineStyle.test.ts`
- Test: `source/utils/buildBodyLines.test.ts`

**Step 1: Update feedLineStyle.ts imports and constants**

Replace imports of `FEED_OP_COL_START`, `FEED_OP_COL_END`, `FEED_SUMMARY_COL_START` with new names:

```typescript
import {
	FEED_EVENT_COL_START,
	FEED_EVENT_COL_END,
	FEED_DETAIL_COL_END,
	FEED_SUMMARY_COL_START,
} from './timeline.js';
```

**Step 2: Update `opCategoryColor()` to use `opTag` slugs**

The `op` param in `FeedLineStyleOptions` is now `opTag` (the slug). Rename the field for clarity:

```typescript
export type FeedLineStyleOptions = {
	// ... existing fields ...
	opTag?: string;  // was `op`
	// ...
};
```

Update `opCategoryColor` — the logic stays the same since it uses slug-based matching, just rename param references from `op` to `opTag`.

**Step 3: Update segment slicing positions in `styleFeedLine()`**

The EVENT column is now at `FEED_EVENT_COL_START..FEED_EVENT_COL_END` (7..19). The segment after EVENT includes DETAIL + ACTOR + SUMMARY (19..end). Update the segments array:

```typescript
// TIME segment (1..EVENT_START)
segments.push({start: 1, end: FEED_EVENT_COL_START, style: base});
// EVENT segment (colored by category)
segments.push({
	start: FEED_EVENT_COL_START,
	end: FEED_EVENT_COL_END,
	style: opColor ? chalk.hex(opColor) : base,
});
// After EVENT: detail + actor + summary
const afterEventEnd = glyphPos ?? line.length;
if (dimPos !== undefined && dimPos < afterEventEnd) {
	segments.push({start: FEED_EVENT_COL_END, end: dimPos, style: base});
	segments.push({start: dimPos, end: afterEventEnd, style: chalk.hex(theme.textMuted)});
} else {
	segments.push({start: FEED_EVENT_COL_END, end: afterEventEnd, style: base});
}
```

**Step 4: Update `buildBodyLines.ts` — pass `opTag` instead of `op` to styleFeedLine**

In the feed rendering loop (~line 254), change `op: entry.op` to `opTag: entry.opTag`:

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
	categoryBreak: isBreak,
});
```

**Step 5: Update `opCategory()` in buildBodyLines.ts**

This function extracts the category prefix from the op slug. Since `entry.op` is now Title Case, update the call site to use `entry.opTag`:

```typescript
const cat = opCategory(entry.opTag);
```

The function itself stays the same (it parses dot-separated slugs).

**Step 6: Update `opCategoryColor` gutter check**

Change `opts.op === 'prompt'` to `opts.opTag === 'prompt'`:

```typescript
} else if (opts.opTag === 'prompt') {
```

And for `msg.user`:

```typescript
} else if (opts.opTag === 'prompt' || opts.opTag === 'msg.user') {
```

**Step 7: Update feedLineStyle.test.ts**

Update all test baselines to use the new column layout and rename `op:` to `opTag:` in test options. Example:

```typescript
const baseLine =
	' 08:55 Tool Call    Bash             AGENT      Read source/app.tsx             ?';
// ...
styleFeedLine(baseLine, {
	// ...
	opTag: 'tool.call',
});
```

**Step 8: Update buildBodyLines.test.ts**

Update `opCategory` tests — these should still pass since they test the slug format which is now in `opTag`. Add test for `msg.user` / `msg.agent` categories.

**Step 9: Run all tests**

Run: `npx vitest run source/`
Expected: PASS

**Step 10: Commit**

```bash
git add source/feed/feedLineStyle.ts source/feed/feedLineStyle.test.ts source/utils/buildBodyLines.ts source/utils/buildBodyLines.test.ts
git commit -m "feat(feed): update feedLineStyle and buildBodyLines for 5-column layout"
```

---

### Task 5: Run lint, typecheck, and full test suite

**Files:** None (verification only)

**Step 1: Run typecheck**

Run: `npm run build`
Expected: PASS — no type errors

**Step 2: Run lint**

Run: `npm run lint`
Expected: PASS

**Step 3: Run full test suite**

Run: `npx vitest run source/`
Expected: All tests PASS

**Step 4: Fix any failures**

If there are type errors from consumers of `TimelineEntry` that don't set `detail`/`opTag`, add them. Search for all `TimelineEntry` construction sites.

**Step 5: Final commit (if fixes needed)**

```bash
git add -A
git commit -m "fix(feed): resolve lint/type issues from column refinement"
```

---

### Summary of changes

| File | Change |
|------|--------|
| `source/feed/timeline.ts` | Add `eventLabel()`, `eventDetail()`, `mergedEventLabel()`. Update `TimelineEntry` (add `detail`, `opTag`). Update column constants. Rewrite `formatFeedLine()` and `formatFeedHeaderLine()` for 5 columns. Keep `eventOperation()` for internal slug use. |
| `source/feed/timeline.test.ts` | Add tests for `eventLabel`, `eventDetail`, `mergedEventLabel`. Update existing `formatFeedLine`/`formatFeedHeaderLine` tests. |
| `source/feed/feedLineStyle.ts` | Rename `op` → `opTag` in options. Update segment slice positions to new column offsets. |
| `source/feed/feedLineStyle.test.ts` | Update baselines and option field name. |
| `source/hooks/useTimeline.ts` | Populate `op` with label, `opTag` with slug, `detail` from `eventDetail()`. |
| `source/utils/buildBodyLines.ts` | Pass `opTag` to styleFeedLine and opCategory. |
| `source/utils/buildBodyLines.test.ts` | Update tests if needed. |
