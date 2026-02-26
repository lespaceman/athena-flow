# Feed UI Rendering Fixes

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix 6 visual rendering issues in the feed grid UI identified from screenshot review.

**Architecture:** All fixes are in the rendering/formatting layer — no data model changes. The active rendering path uses `eventSummary()` / `formatToolSummary()` in `timeline.ts` (not the Phase 2 `resolveToolDisplay` / `resolveEventDisplay` in `toolDisplay.ts`). Changes touch `format.ts`, `timeline.ts`, `cellFormatters.ts`, and `FeedGrid.tsx`.

**Tech Stack:** TypeScript, vitest, chalk (ANSI colors)

---

### Task 1: Fix AskUserQuestion DETAILS showing `questions=[1]`

**Problem:** `PRIMARY_INPUT_EXTRACTORS` in `format.ts` has no entry for `AskUserQuestion`. Falls through to `summarizeToolInput()` which produces `questions=[1]`.

**Files:**

- Modify: `source/utils/format.ts:127-150` (add to `PRIMARY_INPUT_EXTRACTORS`)
- Test: `source/utils/format.test.ts`

**Step 1: Write the failing test**

In `source/utils/format.test.ts`, add:

```typescript
it('summarizeToolPrimaryInput returns question count for AskUserQuestion', () => {
	const input = {questions: [{question: 'Pick one?', options: ['a', 'b']}]};
	expect(summarizeToolPrimaryInput('AskUserQuestion', input)).toBe(
		'1 question',
	);

	const multi = {questions: [{question: 'Q1'}, {question: 'Q2'}]};
	expect(summarizeToolPrimaryInput('AskUserQuestion', multi)).toBe(
		'2 questions',
	);
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/utils/format.test.ts -t "AskUserQuestion"`
Expected: FAIL — returns `questions=[1]` instead of `1 question`

**Step 3: Write minimal implementation**

In `source/utils/format.ts`, add to `PRIMARY_INPUT_EXTRACTORS` (after the `NotebookEdit` entry, line 149):

```typescript
AskUserQuestion: input => {
	const questions = input.questions;
	const n = Array.isArray(questions) ? questions.length : 0;
	return `${n} question${n !== 1 ? 's' : ''}`;
},
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run source/utils/format.test.ts -t "AskUserQuestion"`
Expected: PASS

**Step 5: Commit**

```bash
git add source/utils/format.ts source/utils/format.test.ts
git commit -m "fix(feed): add AskUserQuestion to PRIMARY_INPUT_EXTRACTORS"
```

---

### Task 2: Fix Sub Start/Stop DETAILS bleeding task description

**Problem:** `eventSummary()` for `subagent.start`/`subagent.stop` returns `{verbPart}: {description}` as segments. The description should not appear — agent_type is already in the TOOL column.

**Files:**

- Modify: `source/feed/timeline.ts:318-334`
- Test: `source/feed/timeline.test.ts`

**Step 1: Write the failing test**

In `source/feed/timeline.test.ts`, add:

```typescript
it('eventSummary returns empty segments for subagent.start and subagent.stop', () => {
	const start = makeFeedEvent('subagent.start', {
		agent_id: 'sub-1',
		agent_type: 'general-purpose',
		description: 'Write Playwright tests from specs',
	});
	const result = eventSummary(start);
	expect(result.segments).toEqual([]);
	expect(result.text).toBe('');

	const stop = makeFeedEvent('subagent.stop', {
		agent_id: 'sub-1',
		agent_type: 'general-purpose',
		description: 'Write Playwright tests from specs',
	});
	const stopResult = eventSummary(stop);
	expect(stopResult.segments).toEqual([]);
	expect(stopResult.text).toBe('');
});
```

Note: Use whatever test helper (`makeFeedEvent` or similar) exists in the test file. Check existing tests for the pattern.

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/feed/timeline.test.ts -t "subagent.start"`
Expected: FAIL — returns segments with description text

**Step 3: Write minimal implementation**

Replace lines 318-334 of `source/feed/timeline.ts`:

```typescript
case 'subagent.start':
case 'subagent.stop':
	return {text: '', segments: []};
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run source/feed/timeline.test.ts -t "subagent.start"`
Expected: PASS

**Step 5: Commit**

```bash
git add source/feed/timeline.ts source/feed/timeline.test.ts
git commit -m "fix(feed): suppress description in Sub Start/Stop DETAILS column"
```

---

### Task 3: Fix DETAILS text color — bare strings render white instead of muted

**Problem:** `eventSummary()` default case returns `role: 'plain'`, which maps to `baseColor` = `theme.text` (white). Non-tool, non-agent-message events (stop.request, glob patterns, etc.) should be muted.

**Files:**

- Modify: `source/feed/timeline.ts:335-338`
- Test: `source/feed/timeline.test.ts`

**Step 1: Write the failing test**

```typescript
it('eventSummary uses target role for non-tool events', () => {
	const stopReq = makeFeedEvent('stop.request', {stop_hook_active: false});
	const result = eventSummary(stopReq);
	expect(result.segments[0]!.role).toBe('target');
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/feed/timeline.test.ts -t "target role"`
Expected: FAIL — returns `'plain'`

**Step 3: Write minimal implementation**

In `source/feed/timeline.ts` line 335-338, change the default case:

```typescript
default: {
	const text = eventSummaryText(event);
	return {text, segments: [{text, role: 'target'}]};
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run source/feed/timeline.test.ts -t "target role"`
Expected: PASS

**Step 5: But agent.message must stay with `plain` role (for info color)**

`agent.message` also flows through `eventSummary` — but it's handled by the `default` case too. Check: does `agent.message` have its own case in `eventSummary`? No — it falls to `eventSummaryText` which handles it. So we need to preserve `'plain'` for agent messages.

Fix: add an explicit `agent.message` case before the default:

```typescript
case 'agent.message': {
	const text = eventSummaryText(event);
	return {text, segments: [{text, role: 'plain'}]};
}
default: {
	const text = eventSummaryText(event);
	return {text, segments: [{text, role: 'target'}]};
}
```

Add a test to confirm agent.message keeps `'plain'`:

```typescript
it('eventSummary uses plain role for agent.message', () => {
	const msg = makeFeedEvent('agent.message', {message: 'Hello'});
	const result = eventSummary(msg);
	expect(result.segments[0]!.role).toBe('plain');
});
```

**Step 6: Run full test suite for timeline**

Run: `npx vitest run source/feed/timeline.test.ts`
Expected: All pass

**Step 7: Commit**

```bash
git add source/feed/timeline.ts source/feed/timeline.test.ts
git commit -m "fix(feed): mute non-tool DETAILS text with target role"
```

---

### Task 4: Fix Bash DETAILS not compacting paths inside commands

**Problem:** `PRIMARY_INPUT_EXTRACTORS.Bash` uses `compactText(cmd, 40)` which only truncates — it doesn't shorten paths like `/home/user/foo/bar` to `…/foo/bar`.

**Files:**

- Modify: `source/utils/format.ts:131` (Bash extractor)
- Test: `source/utils/format.test.ts`

**Step 1: Write the failing test**

```typescript
it('summarizeToolPrimaryInput compacts paths in Bash commands', () => {
	const input = {command: 'ls /home/nadeemm/Projects/ai-projects/deep/nested'};
	const result = summarizeToolPrimaryInput('Bash', input);
	expect(result).toContain('…/');
	expect(result).not.toContain('/home/nadeemm');
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/utils/format.test.ts -t "compacts paths in Bash"`
Expected: FAIL — contains `/home/nadeemm`

**Step 3: Write minimal implementation**

Add a helper function and update the Bash extractor in `format.ts`:

```typescript
/** Replace absolute path segments in a command with shortened form. */
function compactCommandPaths(cmd: string): string {
	// Replace absolute paths (sequences of /word/word/...) with shortened form
	return cmd.replace(/\/(?:[\w.@-]+\/){2,}[\w.@-]+/g, match =>
		shortenPath(match),
	);
}
```

Update the `Bash` entry:

```typescript
Bash: input => compactText(compactCommandPaths(String(input.command ?? '')), 40),
```

Also update `commandSegments` in `toolDisplay.ts:87-90` to match:

```typescript
function commandSegments(input: unknown): SummarySegment[] {
	const cmd = String(prop(input, 'command') ?? '');
	return [{text: compactText(compactCommandPaths(cmd), 50), role: 'target'}];
}
```

Export `compactCommandPaths` from `format.ts` and import it in `toolDisplay.ts`.

**Step 4: Run test to verify it passes**

Run: `npx vitest run source/utils/format.test.ts -t "compacts paths in Bash"`
Expected: PASS

**Step 5: Commit**

```bash
git add source/utils/format.ts source/utils/format.test.ts source/feed/toolDisplay.ts
git commit -m "fix(feed): compact absolute paths in Bash command DETAILS"
```

---

### Task 5: Fix Agent Msg EVENT label color (blue → muted)

**Problem:** `opCategoryColor` returns `theme.status.info` for `'agent.msg'`, coloring the EVENT column label blue. The blue should only apply to the DETAILS message text (via `role: 'plain'` + `baseColor`). The EVENT label should be muted.

**Files:**

- Modify: `source/feed/cellFormatters.ts:14`
- Test: `source/feed/cellFormatters.test.ts`

**Step 1: Write the failing test**

```typescript
it('opCategoryColor returns textMuted for agent.msg', () => {
	const theme = /* use the test theme from existing tests */;
	expect(opCategoryColor('agent.msg', theme)).toBe(theme.textMuted);
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/feed/cellFormatters.test.ts -t "agent.msg"`
Expected: FAIL — returns `theme.status.info`

**Step 3: Write minimal implementation**

In `source/feed/cellFormatters.ts:14`, change:

```typescript
if (op === 'agent.msg') return theme.status.info;
```

to:

```typescript
if (op === 'agent.msg') return theme.textMuted;
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run source/feed/cellFormatters.test.ts -t "agent.msg"`
Expected: PASS

**Step 5: Commit**

```bash
git add source/feed/cellFormatters.ts source/feed/cellFormatters.test.ts
git commit -m "fix(feed): mute Agent Msg EVENT label color"
```

---

### Task 6: Fix actor duplicate detection using viewport-local state

**Problem:** `FeedGrid.tsx` computes `isDuplicateActor` with a viewport-local `prevActorId` variable (lines 123-125). When the viewport scrolls, the first visible entry can incorrectly inherit state from the previous render. `entry.duplicateActor` is computed globally in `computeDuplicateActors()` in `timeline.ts` but is never used by `FeedRow`.

However, `FeedGrid`'s version adds a useful `!isBreak` condition (reset actor label at category boundaries) that `computeDuplicateActors` lacks.

**Files:**

- Modify: `source/feed/timeline.ts:53-58` (add break awareness to `computeDuplicateActors`)
- Modify: `source/components/FeedGrid.tsx:123-125` (use `entry.duplicateActor` instead of local state)
- Test: `source/feed/timeline.test.ts`

**Step 1: Write the failing test**

```typescript
it('computeDuplicateActors resets at category boundaries', () => {
	const entries = [
		{actorId: 'agent:root', opTag: 'tool.ok', duplicateActor: false},
		{actorId: 'agent:root', opTag: 'tool.ok', duplicateActor: false},
		{actorId: 'agent:root', opTag: 'agent.msg', duplicateActor: false}, // category break
	] as TimelineEntry[];
	computeDuplicateActors(entries);
	expect(entries[0]!.duplicateActor).toBe(false);
	expect(entries[1]!.duplicateActor).toBe(true); // same actor, same category
	expect(entries[2]!.duplicateActor).toBe(false); // same actor, but category break
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/feed/timeline.test.ts -t "category boundaries"`
Expected: FAIL — entry[2] is `true` (no break awareness)

**Step 3: Write minimal implementation**

Update `computeDuplicateActors` in `timeline.ts:53-58`:

```typescript
export function computeDuplicateActors(entries: TimelineEntry[]): void {
	for (let i = 0; i < entries.length; i++) {
		const prev = i > 0 ? entries[i - 1]! : undefined;
		const sameActor =
			prev !== undefined && entries[i]!.actorId === prev.actorId;
		const isBreak =
			prev !== undefined &&
			opCategory(entries[i]!.opTag) !== opCategory(prev.opTag);
		entries[i]!.duplicateActor = sameActor && !isBreak;
	}
}
```

Then in `FeedGrid.tsx`, replace the local `isDuplicateActor` computation (lines 123-125) with:

```typescript
const isDuplicateActor = entry.duplicateActor;
```

Remove the `prevActorId` variable declaration at line 72.

**Step 4: Run tests**

Run: `npx vitest run source/feed/timeline.test.ts source/components/FeedGrid.test.tsx`
Expected: PASS (check if FeedGrid has tests — if not, the timeline test is sufficient)

**Step 5: Commit**

```bash
git add source/feed/timeline.ts source/components/FeedGrid.tsx source/feed/timeline.test.ts
git commit -m "fix(feed): use global duplicate-actor detection with category breaks"
```

---

### Task 7: Final verification

**Step 1: Run lint and typecheck**

```bash
npm run lint
npx tsc --noEmit
```

**Step 2: Run full test suite**

```bash
npx vitest run source/
```

**Step 3: Build**

```bash
npm run build
```

**Step 4: Commit any lint fixes if needed**

```bash
git add -A && git commit -m "chore: lint fixes"
```
