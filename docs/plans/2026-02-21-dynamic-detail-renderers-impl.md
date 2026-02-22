# Dynamic Detail Renderers Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make Read/Write tool detail views render content dynamically — markdown renderer for `.md`, `.txt`, and unknown extensions; syntax highlighting for code files.

**Architecture:** Modify `extractRead` and `extractWrite` in `source/utils/toolExtractors.ts` to return `type: 'text'` (routed to markdown renderer) for markdown-renderable files and `type: 'code'` (syntax highlighting) for recognized code files. Add `isMarkdownRenderable()` helper. No changes to rendering pipeline — it already dispatches correctly by type.

**Tech Stack:** vitest, marked, marked-terminal, cli-highlight

---

### Task 1: Add `isMarkdownRenderable` helper and update `extractRead`

**Files:**

- Modify: `source/utils/toolExtractors.ts:137-155` (`extractRead` function)
- Test: `source/utils/toolExtractors.test.ts`

**Step 1: Write failing tests**

Add these tests inside the existing `describe('Read', ...)` block in `source/utils/toolExtractors.test.ts`, after the existing Read tests (after line 122):

```typescript
it('returns text type for .md files (markdown renderer)', () => {
	const result = extractToolOutput('Read', {file_path: 'docs/README.md'}, [
		{
			type: 'text',
			file: {
				content: '# Hello\n\n**bold** text',
				numLines: 2,
				startLine: 1,
				totalLines: 2,
			},
		},
	]);
	expect(result.type).toBe('text');
	if (result.type === 'text') {
		expect(result.content).toBe('# Hello\n\n**bold** text');
	}
});

it('returns text type for .txt files (markdown renderer)', () => {
	const result = extractToolOutput('Read', {file_path: 'notes.txt'}, [
		{
			type: 'text',
			file: {
				content: 'plain text content',
				numLines: 1,
				startLine: 1,
				totalLines: 1,
			},
		},
	]);
	expect(result.type).toBe('text');
});

it('returns text type for files with no recognized extension (markdown renderer)', () => {
	const result = extractToolOutput('Read', {file_path: 'Makefile'}, [
		{
			type: 'text',
			file: {
				content: 'all:\n\techo hi',
				numLines: 2,
				startLine: 1,
				totalLines: 2,
			},
		},
	]);
	expect(result.type).toBe('text');
});

it('returns code type for recognized code files', () => {
	// Existing tests cover .tsx and .py — this verifies .json stays as code
	const result = extractToolOutput('Read', {file_path: 'config.json'}, [
		{
			type: 'text',
			file: {
				content: '{"key": "value"}',
				numLines: 1,
				startLine: 1,
				totalLines: 1,
			},
		},
	]);
	expect(result.type).toBe('code');
	if (result.type === 'code') {
		expect(result.language).toBe('json');
	}
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run source/utils/toolExtractors.test.ts -t "returns text type"`
Expected: FAIL — all three new tests fail because `extractRead` always returns `type: 'code'`

**Step 3: Implement `isMarkdownRenderable` and update `extractRead`**

In `source/utils/toolExtractors.ts`, add the helper after the `detectLanguage` function (after line 42):

```typescript
function isMarkdownRenderable(language: string | undefined): boolean {
	return language === undefined || language === 'markdown';
}
```

Then update `extractRead` (lines 137-155) to:

```typescript
function extractRead(
	input: Record<string, unknown>,
	response: unknown,
): RawOutput {
	const blocks = Array.isArray(response) ? response : [response];
	let content: string | undefined;
	for (const block of blocks) {
		content = extractFileContent(block);
		if (content) break;
	}

	const language = detectLanguage(input['file_path']);
	const resolved = content ?? extractTextContent(response);

	if (isMarkdownRenderable(language)) {
		return {type: 'text', content: resolved, maxLines: 10};
	}

	return {type: 'code', content: resolved, language, maxLines: 10};
}
```

**Step 4: Run all tests to verify they pass**

Run: `npx vitest run source/utils/toolExtractors.test.ts`
Expected: ALL PASS

Note: The two existing Read tests that check `type: 'code'` for `.tsx` and `.py` should still pass since those are recognized code languages.

**Step 5: Commit**

```bash
git add source/utils/toolExtractors.ts source/utils/toolExtractors.test.ts
git commit -m "feat(feed): dynamic Read detail renderer — markdown for .md/.txt/unknown, code for rest

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 2: Update `extractWrite` to show rendered content

**Files:**

- Modify: `source/utils/toolExtractors.ts:168-179` (`extractWrite` function)
- Test: `source/utils/toolExtractors.test.ts`

**Step 1: Write failing tests**

Add these tests inside the existing `describe('Write', ...)` block in `source/utils/toolExtractors.test.ts`, after the existing Write tests (after line 171):

```typescript
it('shows written content as text for .md files', () => {
	const result = extractToolOutput(
		'Write',
		{file_path: 'docs/plan.md', content: '# Plan\n\n**Step 1:** do thing'},
		{filePath: 'docs/plan.md', success: true},
	);
	expect(result.type).toBe('text');
	if (result.type === 'text') {
		expect(result.content).toBe('# Plan\n\n**Step 1:** do thing');
	}
});

it('shows written content as code for .ts files', () => {
	const result = extractToolOutput(
		'Write',
		{file_path: 'src/index.ts', content: 'export const x = 1;'},
		{filePath: 'src/index.ts', success: true},
	);
	expect(result.type).toBe('code');
	if (result.type === 'code') {
		expect(result.content).toBe('export const x = 1;');
		expect(result.language).toBe('typescript');
	}
});

it('shows written content as text for unknown extension', () => {
	const result = extractToolOutput(
		'Write',
		{file_path: 'Dockerfile', content: 'FROM node:20'},
		{filePath: 'Dockerfile', success: true},
	);
	expect(result.type).toBe('text');
	if (result.type === 'text') {
		expect(result.content).toBe('FROM node:20');
	}
});

it('falls back to "Wrote path" when no content in input', () => {
	const result = extractToolOutput(
		'Write',
		{file_path: '/tmp/test.ts'},
		{filePath: '/tmp/test.ts', success: true},
	);
	expect(result.type).toBe('text');
	if (result.type === 'text') {
		expect(result.content).toBe('Wrote /tmp/test.ts');
	}
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run source/utils/toolExtractors.test.ts -t "shows written content"`
Expected: FAIL — new tests fail because `extractWrite` returns `"Wrote /path"` instead of content

**Step 3: Update `extractWrite`**

Replace the `extractWrite` function (lines 168-179) with:

```typescript
function extractWrite(
	input: Record<string, unknown>,
	response: unknown,
): RawOutput {
	const text = extractTextContent(response);
	if (text && typeof response !== 'object')
		return {type: 'text', content: text};

	const content = typeof input['content'] === 'string' ? input['content'] : '';
	const filePath = String(
		prop(response, 'filePath') ?? input['file_path'] ?? '',
	);

	if (!content) {
		return {type: 'text', content: `Wrote ${filePath}`};
	}

	const language = detectLanguage(input['file_path']);
	if (isMarkdownRenderable(language)) {
		return {type: 'text', content, maxLines: 10};
	}
	return {type: 'code', content, language, maxLines: 10};
}
```

**Step 4: Run all tests to verify they pass**

Run: `npx vitest run source/utils/toolExtractors.test.ts`
Expected: ALL PASS

Note: The existing Write test "shows confirmation from PostToolUse structured response" (line 148) expects `"Wrote /tmp/test.txt"`. Since `.txt` files now get `isMarkdownRenderable → true`, AND that test has no `content` in `tool_input`, it will still return `"Wrote /tmp/test.txt"` from the `!content` fallback. But double-check this — the test passes `{file_path: '/tmp/test.txt'}` with no `content` key, so it should be fine.

**Step 5: Run full test suite + lint + typecheck**

Run: `npm test && npm run lint`
Expected: ALL PASS

**Step 6: Commit**

```bash
git add source/utils/toolExtractors.ts source/utils/toolExtractors.test.ts
git commit -m "feat(feed): dynamic Write detail renderer — show written content with appropriate renderer

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 3: Update `renderDetailLines` test for Read markdown rendering

**Files:**

- Test: `source/utils/renderDetailLines.test.ts`

This task verifies the end-to-end detail rendering path — that a Read tool.post event for a `.md` file produces markdown-rendered output (no raw `**` markers) instead of syntax-highlighted source.

**Step 1: Write the integration test**

Add to `source/utils/renderDetailLines.test.ts`:

```typescript
it('renders Read .md file content as markdown (not syntax-highlighted)', () => {
	const event = makeEvent({
		kind: 'tool.post',
		data: {
			tool_name: 'Read',
			tool_input: {file_path: 'docs/README.md'},
			tool_response: [
				{type: 'text', file: {content: '# Title\n\n**bold** text'}},
			],
		},
	});
	const result = renderDetailLines(event, 80);
	expect(result.showLineNumbers).toBe(false);
	const joined = result.lines.join('\n');
	expect(joined).not.toContain('**bold**');
	expect(joined).toContain('bold');
});
```

**Step 2: Run test to verify it passes**

Run: `npx vitest run source/utils/renderDetailLines.test.ts -t "renders Read .md"`
Expected: PASS (this is an integration test confirming the extractor change flows through)

**Step 3: Commit**

```bash
git add source/utils/renderDetailLines.test.ts
git commit -m "test(feed): add integration test for Read .md markdown rendering in detail view

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```
