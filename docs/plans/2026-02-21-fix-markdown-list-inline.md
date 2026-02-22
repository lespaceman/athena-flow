# Fix Markdown Inline Rendering in Lists

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix bold/italic/inline markdown not rendering inside list items in both the detail view and MarkdownText component.

**Architecture:** `marked-terminal`'s default list renderer doesn't process inline tokens (bold, italic, code) within list items — it outputs raw `**markers**`. Both `MarkdownText.tsx` and `renderDetailLines.ts` need custom list renderers that call `m.parseInline(item.text)` to properly process inline markdown. The fix is to update the existing custom list renderer in `MarkdownText.tsx` and add one to `renderDetailLines.ts`.

**Tech Stack:** marked v15, marked-terminal, chalk, vitest

**Root Cause:** `markedTerminal`'s `listitem` renderer wraps raw text with `chalk.reset` without processing nested inline tokens. `m.parser(item.tokens)` also fails because the block-level `text` token renderer from `markedTerminal` doesn't recurse into inline children. The correct approach is `m.parseInline(item.text)` which directly processes inline markdown.

---

### Task 1: Fix `renderDetailLines.ts` — Add custom list renderer

**Files:**

- Modify: `source/utils/renderDetailLines.ts:19-46` (the `createMarkedRenderer` function)
- Test: `source/utils/renderDetailLines.test.ts`

**Step 1: Write failing test**

Add to `renderDetailLines.test.ts` after the existing `agent.message` test:

```typescript
it('renders bold inside list items in agent.message', () => {
	const event = makeEvent({
		kind: 'agent.message',
		data: {
			message: '* **Critical:** leaked data\n* **Warning:** slow query',
			source: 'hook',
			scope: 'root',
		},
	});
	const result = renderDetailLines(event, 80);
	const joined = result.lines.join('\n');
	expect(joined).not.toContain('**Critical:**');
	expect(joined).toContain('Critical:');
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/utils/renderDetailLines.test.ts -t "renders bold inside list"`
Expected: FAIL — `**Critical:**` appears in output

**Step 3: Add custom list renderer to `createMarkedRenderer`**

In `source/utils/renderDetailLines.ts`, import `Tokens` type and add custom renderer after the `markedTerminal` use:

```typescript
import {Marked, type Tokens} from 'marked'; // add Tokens import
```

Then after the `m.use(markedTerminal(...))` block (line 43), add:

```typescript
m.use({
	renderer: {
		list(token: Tokens.List): string {
			let body = '';
			for (let i = 0; i < token.items.length; i++) {
				const item = token.items[i]!;
				const bullet = token.ordered ? `${i + 1}. ` : '  • ';
				const text = m.parseInline(item.text);
				body += bullet + (typeof text === 'string' ? text : item.text) + '\n';
			}
			return body;
		},
	},
});
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run source/utils/renderDetailLines.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add source/utils/renderDetailLines.ts source/utils/renderDetailLines.test.ts
git commit -m "fix(feed): render inline markdown in list items for detail view"
```

---

### Task 2: Fix `MarkdownText.tsx` — Use `parseInline` in list renderer

**Files:**

- Modify: `source/components/ToolOutput/MarkdownText.tsx:93-101` (custom list renderer)
- Test: `source/components/ToolOutput/MarkdownText.test.tsx`

**Step 1: Write failing test**

Add to `MarkdownText.test.tsx`:

```typescript
it('renders bold inside list items', () => {
	const content = '* **Critical:** leaked data\n* **Warning:** slow query';
	const {lastFrame} = render(<MarkdownText content={content} />);
	const frame = lastFrame() ?? '';
	expect(frame).not.toContain('**Critical:**');
	expect(frame).toContain('Critical:');
});
```

Note: `chalk.level` may need to be set to 3 in a `beforeEach`/`afterEach` block if vitest runs with color level 0. Check existing test patterns — the CLAUDE.md notes: "vitest runs with color level 0. Tests verifying ANSI output need `chalk.level = 3` with `try/finally` to restore."

Since we're checking for the _absence_ of `**` markers (not the presence of ANSI codes), color level 0 should be fine — bold markers should still not appear.

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/components/ToolOutput/MarkdownText.test.tsx -t "renders bold inside list"`
Expected: FAIL — `**Critical:**` appears in output

**Step 3: Change `m.parser(item.tokens)` to `m.parseInline(item.text)`**

In `source/components/ToolOutput/MarkdownText.tsx`, line 98, change:

```typescript
// Before:
const text = m.parser(item.tokens);

// After:
const inlined = m.parseInline(item.text);
const text = typeof inlined === 'string' ? inlined : item.text;
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run source/components/ToolOutput/MarkdownText.test.tsx`
Expected: ALL PASS

**Step 5: Run full test suite + lint + typecheck**

Run: `npm test && npm run lint`
Expected: ALL PASS

**Step 6: Commit**

```bash
git add source/components/ToolOutput/MarkdownText.tsx source/components/ToolOutput/MarkdownText.test.tsx
git commit -m "fix(feed): render inline markdown in list items for MarkdownText"
```

---

### Task 3: Verify fix visually

**Step 1:** Run `npm run build` and launch the CLI
**Step 2:** Trigger an agent message with bold inside a list (or use mock adapter)
**Step 3:** Open detail view and confirm `**text**` renders as bold, not raw markers
