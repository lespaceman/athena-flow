# Unified Terminal Rendering Fixes — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix three rendering bugs: colon placeholder leak in list items, raw markdown in feed summaries, and `toAscii()` unicode mangling in todo IDs.

**Architecture:** Three independent targeted fixes at their source. No shared abstractions. Each task is self-contained with its own test→fix→verify cycle.

**Tech Stack:** TypeScript, vitest, marked, marked-terminal

---

### Task 1: Fix colon placeholder leak in custom list renderer

`marked-terminal` replaces `:` with `*#COLON|*` inside `codespan()`. The built-in `listitem` renderer undoes this via `this.transform`, but our custom list renderer in `markedFactory.ts` bypasses that pipeline — so colons inside backtick code spans in list items render as `*#COLON|*`.

**Files:**

- Create: `source/utils/markedFactory.test.ts`
- Modify: `source/utils/markedFactory.ts:45-46`

**Step 1: Write the failing test**

Create `source/utils/markedFactory.test.ts`:

```typescript
import {describe, it, expect} from 'vitest';
import {createMarkedInstance} from './markedFactory.js';

describe('createMarkedInstance', () => {
	it('does not leak colon placeholders in list items with code spans', () => {
		const m = createMarkedInstance(120);
		const input =
			'- Read `playwright.config.ts` to learn `baseURL: "https://myapp.com"`, `testDir: "./tests"`';
		const result = m.parse(input);
		expect(typeof result).toBe('string');
		const output = result as string;
		expect(output).not.toContain('*#COLON|*');
		expect(output).toContain('baseURL:');
		expect(output).toContain('testDir:');
	});
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/utils/markedFactory.test.ts`
Expected: FAIL — output contains `*#COLON|*` instead of `:`

**Step 3: Fix — undo colon placeholder after parseInline**

In `source/utils/markedFactory.ts`, change lines 45-46 from:

```typescript
const inlined = m.parseInline(item.text);
const text = typeof inlined === 'string' ? inlined : item.text;
```

to:

```typescript
const inlined = m.parseInline(item.text);
const text =
	typeof inlined === 'string'
		? inlined.replace(/\*#COLON\|\*/g, ':')
		: item.text;
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run source/utils/markedFactory.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add source/utils/markedFactory.ts source/utils/markedFactory.test.ts
git commit -m "fix(markdown): undo colon placeholder in custom list renderer

marked-terminal's codespan() replaces : with *#COLON|* internally.
Our custom list renderer bypassed the built-in transform that restores
them, causing literal *#COLON|* in rendered list items."
```

---

### Task 2: Strip markdown from feed summary lines

`eventSummaryText()` passes raw markdown to `compactText()` for single-line feed display. Markdown syntax (`**bold**`, `## headings`, `` `code` ``) appears literally instead of being stripped.

**Files:**

- Modify: `source/feed/timeline.test.ts`
- Modify: `source/feed/timeline.ts:216-217`

**Step 1: Write the failing test**

Add to `source/feed/timeline.test.ts`, inside a new `describe('eventSummary')` block (or find existing). Use the `base()` helper already defined in the test file:

```typescript
describe('eventSummary — agent.message', () => {
	it('strips markdown syntax from agent.message summary', () => {
		const ev = {
			...base({kind: 'agent.message'}),
			kind: 'agent.message' as const,
			data: {
				message:
					"Here's what the **e2e-test-builder** plugin can do — it has `6 skills`",
				scope: 'root' as const,
			},
		};
		const result = eventSummary(ev);
		expect(result.text).not.toContain('**');
		expect(result.text).not.toContain('`');
		expect(result.text).toContain('e2e-test-builder');
		expect(result.text).toContain('6 skills');
	});

	it('strips heading markers from agent.message summary', () => {
		const ev = {
			...base({kind: 'agent.message'}),
			kind: 'agent.message' as const,
			data: {
				message: '## How Ralph Loop Works with `/add-e2e-tests`',
				scope: 'root' as const,
			},
		};
		const result = eventSummary(ev);
		expect(result.text).not.toMatch(/^##/);
		expect(result.text).toContain('How Ralph Loop Works');
	});
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/feed/timeline.test.ts`
Expected: FAIL — summary contains literal `**` and `` ` ``

**Step 3: Add stripMarkdownInline and apply to agent.message**

In `source/feed/timeline.ts`, add this function before `eventSummaryText()` (around line 149):

```typescript
/** Strip inline markdown syntax for compact single-line display. */
function stripMarkdownInline(text: string): string {
	return text
		.replace(/#{1,6}\s+/g, '')
		.replace(/\*\*(.+?)\*\*/g, '$1')
		.replace(/__(.+?)__/g, '$1')
		.replace(/\*(.+?)\*/g, '$1')
		.replace(/`(.+?)`/g, '$1')
		.replace(/~~(.+?)~~/g, '$1');
}
```

Then change line 217 from:

```typescript
return compactText(event.data.message, 200);
```

to:

```typescript
return compactText(stripMarkdownInline(event.data.message), 200);
```

Also apply to `notification` (line 192) since notifications may also contain markdown:

```typescript
return compactText(stripMarkdownInline(event.data.message), 200);
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run source/feed/timeline.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add source/feed/timeline.ts source/feed/timeline.test.ts
git commit -m "fix(feed): strip markdown syntax from agent.message feed summaries

Feed summary lines showed raw **bold**, ## headings, and \`code\`
literally. Add stripMarkdownInline() to clean inline syntax before
compactText() for single-line display."
```

---

### Task 3: Replace toAscii with safe slug in todo IDs

`toAscii()` replaces all non-ASCII with `?` via `/[^\x20-\x7e]/g`. Used in `useTodoPanel.ts` for ID generation, it mangles unicode glyphs even when `--ascii=false`.

**Files:**

- Modify: `source/hooks/useTodoPanel.ts:8,55`
- Modify: `source/utils/format.ts:3-6`
- Modify: `source/utils/format.test.ts:3,16-29`

**Step 1: Write the failing test**

There's no existing test file for `useTodoPanel`. Since the hook uses React, and the fix is a simple string operation, test the ID generation logic directly. Add to `source/utils/format.test.ts` a test that documents the desired behavior after removal:

```typescript
describe('toAscii removal verification', () => {
	it('toAscii is no longer exported', () => {
		// After deletion, this import would fail at compile time.
		// This test documents that toAscii was intentionally removed.
		expect(Object.keys(await import('./format.js'))).not.toContain('toAscii');
	});
});
```

Actually, simpler: just verify the fix in `useTodoPanel.ts` directly. But since `useTodoPanel` is a React hook, let's verify the ID generation inline.

**Step 2: Fix — replace toAscii with alphanumeric slug in useTodoPanel.ts**

In `source/hooks/useTodoPanel.ts`:

Remove the import on line 8:

```typescript
import {toAscii} from '../utils/format.js';
```

Change line 55 from:

```typescript
		id: `task-${index}-${toAscii(task.content).slice(0, 16)}`,
```

to:

```typescript
		id: `task-${index}-${task.content.replace(/[^a-zA-Z0-9]/g, '').slice(0, 16)}`,
```

**Step 3: Delete toAscii from format.ts**

In `source/utils/format.ts`, delete lines 4-6:

```typescript
export function toAscii(value: string): string {
	return value.replace(/[^\x20-\x7e]/g, '?');
}
```

**Step 4: Delete toAscii tests from format.test.ts**

In `source/utils/format.test.ts`:

Remove `toAscii` from the import on line 3.

Delete the entire `describe('toAscii', ...)` block (lines 16-29).

**Step 5: Run build to confirm no other callers**

Run: `npm run build`
Expected: Clean compile — no errors. If any file still imports `toAscii`, the build will fail.

**Step 6: Run all tests**

Run: `npx vitest run source/`
Expected: All PASS

**Step 7: Commit**

```bash
git add source/hooks/useTodoPanel.ts source/utils/format.ts source/utils/format.test.ts
git commit -m "fix(todo): stop mangling unicode in task IDs — delete toAscii

toAscii() replaced all non-ASCII with ? for todo IDs, breaking unicode
glyphs even with --ascii=false. Replace with alphanumeric-only slug for
IDs (not display text), then delete the function entirely."
```

---

### Task 4: Full verification

**Step 1: Run all tests**

Run: `npx vitest run source/`
Expected: All PASS

**Step 2: Run lint**

Run: `npm run lint`
Expected: Clean

**Step 3: Run build**

Run: `npm run build`
Expected: Clean compile

**Step 4: Fix any issues and commit if needed**

```bash
git add -A
git commit -m "chore: fix lint/type issues from rendering fixes"
```
