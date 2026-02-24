# Tool Output Rendering Improvements — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enrich tool output rendering with rich diffs (hunks, line numbers, side-by-side), file tree display for Glob, grouped-by-file Grep output, and OSC 8 clickable hyperlinks.

**Architecture:** Enrich existing `RenderableOutput` types with optional fields (`hunks`, `displayMode`, `groupBy`). Renderers (`DiffBlock`, `StructuredList`, `CodeBlock`, `MarkdownText`) get smarter based on these fields. A new `hyperlink.ts` utility provides cross-cutting OSC 8 support with auto-detection.

**Tech Stack:** TypeScript, React/Ink, vitest, chalk, marked/marked-terminal, cli-highlight

**Design Doc:** `docs/plans/2026-02-24-tool-output-rendering-design.md`

---

## Task 1: OSC 8 Hyperlink Utility

OSC 8 is a foundation used by Tasks 2-4, so it comes first.

**Files:**

- Create: `source/utils/hyperlink.ts`
- Create: `source/utils/hyperlink.test.ts`

**Step 1: Write the failing tests**

```typescript
// source/utils/hyperlink.test.ts
import {describe, it, expect, vi, afterEach} from 'vitest';
import {hyperlink, supportsHyperlinks, fileLink, urlLink} from './hyperlink.js';

describe('hyperlink', () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	describe('supportsHyperlinks', () => {
		it('returns true for iTerm2', () => {
			vi.stubEnv('TERM_PROGRAM', 'iTerm.app');
			expect(supportsHyperlinks()).toBe(true);
		});

		it('returns true for WezTerm', () => {
			vi.stubEnv('TERM_PROGRAM', 'WezTerm');
			expect(supportsHyperlinks()).toBe(true);
		});

		it('returns true for Windows Terminal', () => {
			vi.stubEnv('WT_SESSION', 'some-session-id');
			expect(supportsHyperlinks()).toBe(true);
		});

		it('returns true for VTE >= 5000', () => {
			vi.stubEnv('VTE_VERSION', '5200');
			expect(supportsHyperlinks()).toBe(true);
		});

		it('returns false for VTE < 5000', () => {
			vi.stubEnv('VTE_VERSION', '4800');
			expect(supportsHyperlinks()).toBe(false);
		});

		it('returns true for Kitty', () => {
			vi.stubEnv('TERM', 'xterm-kitty');
			expect(supportsHyperlinks()).toBe(true);
		});

		it('returns false for unknown terminals', () => {
			// Clear all known env vars
			vi.stubEnv('TERM_PROGRAM', '');
			vi.stubEnv('WT_SESSION', '');
			vi.stubEnv('VTE_VERSION', '');
			vi.stubEnv('TERM', 'xterm-256color');
			vi.stubEnv('ATHENA_HYPERLINKS', '');
			expect(supportsHyperlinks()).toBe(false);
		});

		it('respects ATHENA_HYPERLINKS=1 override', () => {
			vi.stubEnv('ATHENA_HYPERLINKS', '1');
			expect(supportsHyperlinks()).toBe(true);
		});

		it('respects ATHENA_HYPERLINKS=0 override', () => {
			vi.stubEnv('TERM_PROGRAM', 'iTerm.app');
			vi.stubEnv('ATHENA_HYPERLINKS', '0');
			expect(supportsHyperlinks()).toBe(false);
		});
	});

	describe('hyperlink', () => {
		it('wraps text with OSC 8 sequences when supported', () => {
			vi.stubEnv('ATHENA_HYPERLINKS', '1');
			const result = hyperlink('click me', 'https://example.com');
			expect(result).toBe(
				'\x1b]8;;https://example.com\x07click me\x1b]8;;\x07',
			);
		});

		it('returns plain text when not supported', () => {
			vi.stubEnv('ATHENA_HYPERLINKS', '0');
			vi.stubEnv('TERM_PROGRAM', '');
			vi.stubEnv('WT_SESSION', '');
			vi.stubEnv('VTE_VERSION', '');
			vi.stubEnv('TERM', 'xterm-256color');
			const result = hyperlink('click me', 'https://example.com');
			expect(result).toBe('click me');
		});
	});

	describe('fileLink', () => {
		it('creates file:// URI for absolute paths', () => {
			vi.stubEnv('ATHENA_HYPERLINKS', '1');
			const result = fileLink('/home/user/app.ts');
			expect(result).toContain('file:///home/user/app.ts');
			expect(result).toContain('/home/user/app.ts');
		});

		it('appends line number to URI when provided', () => {
			vi.stubEnv('ATHENA_HYPERLINKS', '1');
			const result = fileLink('/home/user/app.ts', 42);
			expect(result).toContain(':42');
		});

		it('returns plain text for relative paths', () => {
			vi.stubEnv('ATHENA_HYPERLINKS', '1');
			const result = fileLink('src/app.ts');
			// Relative paths can't form valid file:// URIs, so just return text
			expect(result).toBe('src/app.ts');
		});
	});

	describe('urlLink', () => {
		it('creates clickable URL', () => {
			vi.stubEnv('ATHENA_HYPERLINKS', '1');
			const result = urlLink('https://example.com', 'Example');
			expect(result).toContain('https://example.com');
			expect(result).toContain('Example');
		});

		it('uses URL as display text when no display text given', () => {
			vi.stubEnv('ATHENA_HYPERLINKS', '1');
			const result = urlLink('https://example.com');
			expect(result).toContain('https://example.com');
		});
	});
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run source/utils/hyperlink.test.ts`
Expected: FAIL — module not found

**Step 3: Write implementation**

```typescript
// source/utils/hyperlink.ts

const OSC = '\x1b]';
const BEL = '\x07';
const OSC_8_START = `${OSC}8;;`;
const OSC_8_END = `${OSC}8;;${BEL}`;

/**
 * Detect whether the current terminal supports OSC 8 hyperlinks.
 * Checks env vars on every call (no caching) so tests can stub freely.
 */
export function supportsHyperlinks(): boolean {
	const override = process.env['ATHENA_HYPERLINKS'];
	if (override === '1') return true;
	if (override === '0') return false;

	const termProgram = process.env['TERM_PROGRAM'] ?? '';
	if (['iTerm.app', 'WezTerm', 'Hyper'].includes(termProgram)) return true;

	if (process.env['WT_SESSION']) return true;

	const vte = parseInt(process.env['VTE_VERSION'] ?? '', 10);
	if (!isNaN(vte) && vte >= 5000) return true;

	if (process.env['TERM'] === 'xterm-kitty') return true;

	return false;
}

/**
 * Wrap text in an OSC 8 hyperlink sequence.
 * Returns plain text if the terminal doesn't support hyperlinks.
 */
export function hyperlink(text: string, url: string): string {
	if (!supportsHyperlinks()) return text;
	return `${OSC_8_START}${url}${BEL}${text}${OSC_8_END}`;
}

/**
 * Create a clickable file path. Only works for absolute paths.
 * Relative paths are returned as plain text.
 */
export function fileLink(
	filePath: string,
	line?: number,
	col?: number,
): string {
	if (!filePath.startsWith('/')) return filePath;
	let uri = `file://${filePath}`;
	if (line != null) {
		uri += `:${line}`;
		if (col != null) uri += `:${col}`;
	}
	return hyperlink(filePath, uri);
}

/**
 * Create a clickable URL link.
 */
export function urlLink(url: string, displayText?: string): string {
	return hyperlink(displayText ?? url, url);
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run source/utils/hyperlink.test.ts`
Expected: PASS

**Step 5: Run lint + typecheck**

Run: `npm run lint && npx tsc --noEmit`

**Step 6: Commit**

```bash
git add source/utils/hyperlink.ts source/utils/hyperlink.test.ts
git commit -m "feat(hyperlink): add OSC 8 hyperlink utility with auto-detection"
```

---

## Task 2: Enrich Types (`toolOutput.ts`)

**Files:**

- Modify: `source/types/toolOutput.ts`

**Step 1: Write the type additions**

Add `DiffHunk`, `DiffLine` types and enrich the `diff` and `list` variants in both `RenderableOutput` and `RawOutput`:

```typescript
// Add after ListItem type:

export type DiffLine = {
	type: 'context' | 'add' | 'remove';
	content: string;
	oldLineNo?: number;
	newLineNo?: number;
};

export type DiffHunk = {
	header: string;
	oldStart: number;
	newStart: number;
	lines: DiffLine[];
};

// Modify the diff variant in RenderableOutput to add optional hunks + filePath:
// {
//   type: 'diff';
//   oldText: string;         // kept for backward compat
//   newText: string;         // kept for backward compat
//   hunks?: DiffHunk[];      // NEW
//   filePath?: string;       // NEW
//   maxLines?: number;
// }

// Modify the list variant in RenderableOutput to add optional displayMode + groupBy:
// {
//   type: 'list';
//   items: ListItem[];
//   maxItems?: number;
//   displayMode?: 'tree';    // NEW — for Glob tree rendering
//   groupBy?: 'secondary';   // NEW — for Grep file grouping
// }

// Same changes apply to RawOutput union.
```

**Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (new optional fields are backward-compatible)

**Step 3: Commit**

```bash
git add source/types/toolOutput.ts
git commit -m "feat(types): add DiffHunk, DiffLine, displayMode, groupBy to RenderableOutput"
```

---

## Task 3: Enrich Extractors

**Files:**

- Modify: `source/utils/toolExtractors.ts`
- Modify: `source/utils/toolExtractors.test.ts`

**Step 1: Write failing tests for extractEdit with structuredPatch**

```typescript
// Add to the Edit describe block in toolExtractors.test.ts:

it('parses structuredPatch into hunks when available', () => {
	const result = extractToolOutput(
		'Edit',
		{
			file_path: 'src/foo.ts',
			old_string: 'const a = 1;',
			new_string: 'const a = 2;',
		},
		{
			filePath: 'src/foo.ts',
			success: true,
			structuredPatch: {
				hunks: [
					{
						oldStart: 10,
						oldLines: 3,
						newStart: 10,
						newLines: 3,
						lines: [
							' const x = 0;',
							'-const a = 1;',
							'+const a = 2;',
							' const b = 3;',
						],
					},
				],
			},
		},
	);
	expect(result.type).toBe('diff');
	if (result.type === 'diff') {
		expect(result.hunks).toBeDefined();
		expect(result.hunks).toHaveLength(1);
		expect(result.hunks![0]!.lines).toHaveLength(4);
		expect(result.hunks![0]!.lines[0]).toEqual(
			expect.objectContaining({type: 'context', content: 'const x = 0;'}),
		);
		expect(result.hunks![0]!.lines[1]).toEqual(
			expect.objectContaining({type: 'remove', content: 'const a = 1;'}),
		);
		expect(result.hunks![0]!.lines[2]).toEqual(
			expect.objectContaining({type: 'add', content: 'const a = 2;'}),
		);
		expect(result.filePath).toBe('src/foo.ts');
	}
});

it('falls back to old/new text when structuredPatch is absent', () => {
	const result = extractToolOutput(
		'Edit',
		{
			file_path: 'foo.ts',
			old_string: 'const a = 1;',
			new_string: 'const a = 2;',
		},
		'File updated',
	);
	expect(result.type).toBe('diff');
	if (result.type === 'diff') {
		expect(result.hunks).toBeUndefined();
		expect(result.oldText).toBe('const a = 1;');
		expect(result.newText).toBe('const a = 2;');
	}
});
```

**Step 2: Write failing tests for Glob displayMode**

```typescript
// Add to the Glob describe block:

it('sets displayMode to tree for structured filenames', () => {
	const result = extractToolOutput(
		'Glob',
		{},
		{
			filenames: ['src/a.ts', 'src/b.ts', 'lib/c.ts'],
			numFiles: 3,
			truncated: false,
		},
	);
	expect(result.type).toBe('list');
	if (result.type === 'list') {
		expect(result.displayMode).toBe('tree');
	}
});
```

**Step 3: Write failing tests for Grep groupBy**

```typescript
// Add to the Grep describe block:

it('sets groupBy to secondary for file-grouped results', () => {
	const result = extractToolOutput(
		'Grep',
		{pattern: 'EXTRACTORS'},
		'src/app.tsx:10:const x = 1;\nsrc/app.tsx:20:const y = 2;',
	);
	expect(result.type).toBe('list');
	if (result.type === 'list') {
		expect(result.groupBy).toBe('secondary');
	}
});
```

**Step 4: Run tests to verify they fail**

Run: `npx vitest run source/utils/toolExtractors.test.ts`
Expected: FAIL — new fields missing

**Step 5: Implement extractor changes**

In `extractEdit`: parse `structuredPatch` from response into `DiffHunk[]` with line numbers. Add `filePath` from input.

In `extractGlob`: add `displayMode: 'tree'` to the returned object.

In `extractGrep`: add `groupBy: 'secondary'` to the returned object.

The `withPreview` function for diffs should compute preview from hunks when available (show first N changed lines).

The `RawOutput` type must also be updated to include the new optional fields on `diff` and `list` variants.

**Step 6: Run tests to verify they pass**

Run: `npx vitest run source/utils/toolExtractors.test.ts`
Expected: PASS

**Step 7: Run lint + typecheck**

Run: `npm run lint && npx tsc --noEmit`

**Step 8: Commit**

```bash
git add source/utils/toolExtractors.ts source/utils/toolExtractors.test.ts
git commit -m "feat(extractors): enrich Edit with hunks, Glob with tree mode, Grep with groupBy"
```

---

## Task 4: Rich Diff Renderer

**Files:**

- Modify: `source/components/ToolOutput/DiffBlock.tsx`
- Modify: `source/components/ToolOutput/DiffBlock.test.tsx`
- Modify: `source/components/ToolOutput/ToolOutputRenderer.tsx` (pass new props)

**Step 1: Write failing tests for hunk rendering**

```typescript
// Add to DiffBlock.test.tsx:

import {type DiffHunk} from '../../types/toolOutput.js';

it('renders hunk header and line numbers when hunks provided', () => {
	const hunks: DiffHunk[] = [
		{
			header: '@@ -10,3 +10,3 @@ function foo()',
			oldStart: 10,
			newStart: 10,
			lines: [
				{type: 'context', content: 'const x = 0;', oldLineNo: 10, newLineNo: 10},
				{type: 'remove', content: 'const a = 1;', oldLineNo: 11},
				{type: 'add', content: 'const a = 2;', newLineNo: 11},
				{type: 'context', content: 'const b = 3;', oldLineNo: 12, newLineNo: 12},
			],
		},
	];
	const {lastFrame} = render(
		<DiffBlock oldText="" newText="" hunks={hunks} filePath="src/foo.ts" />,
	);
	const frame = lastFrame() ?? '';
	expect(frame).toContain('@@');
	expect(frame).toContain('const a = 1;');
	expect(frame).toContain('const a = 2;');
});

it('falls back to old/new text rendering when hunks not provided', () => {
	const {lastFrame} = render(
		<DiffBlock oldText="old" newText="new" />,
	);
	const frame = lastFrame() ?? '';
	expect(frame).toContain('- old');
	expect(frame).toContain('+ new');
});
```

**Step 2: Write failing test for side-by-side mode**

```typescript
it('renders side-by-side when availableWidth >= 120', () => {
	const hunks: DiffHunk[] = [
		{
			header: '@@ -1,1 +1,1 @@',
			oldStart: 1,
			newStart: 1,
			lines: [
				{type: 'remove', content: 'old line', oldLineNo: 1},
				{type: 'add', content: 'new line', newLineNo: 1},
			],
		},
	];
	const {lastFrame} = render(
		<DiffBlock oldText="" newText="" hunks={hunks} availableWidth={140} />,
	);
	const frame = lastFrame() ?? '';
	// Side-by-side should show old and new on same logical row
	// Both 'old line' and 'new line' should appear
	expect(frame).toContain('old line');
	expect(frame).toContain('new line');
});
```

**Step 3: Run tests to verify they fail**

Run: `npx vitest run source/components/ToolOutput/DiffBlock.test.tsx`
Expected: FAIL — hunks prop not recognized / not rendered

**Step 4: Implement DiffBlock changes**

Update `DiffBlock.tsx` Props to accept optional `hunks?: DiffHunk[]` and `filePath?: string`. When `hunks` is provided:

- Render file path header (dim, with OSC 8 `fileLink`)
- Render each hunk: header line (dim cyan), then lines with line numbers and `│` gutter
- Use side-by-side layout when `availableWidth >= 120`
- When `hunks` is undefined, fall back to existing old/new rendering

Update `ToolOutputRenderer.tsx` to pass `hunks` and `filePath` from the enriched diff output to `DiffBlock`.

**Step 5: Run tests to verify they pass**

Run: `npx vitest run source/components/ToolOutput/DiffBlock.test.tsx`
Expected: PASS

**Step 6: Run lint + typecheck**

Run: `npm run lint && npx tsc --noEmit`

**Step 7: Commit**

```bash
git add source/components/ToolOutput/DiffBlock.tsx source/components/ToolOutput/DiffBlock.test.tsx source/components/ToolOutput/ToolOutputRenderer.tsx
git commit -m "feat(DiffBlock): rich diff rendering with hunks, line numbers, and side-by-side"
```

---

## Task 5: File Tree Renderer (Glob)

**Files:**

- Modify: `source/components/ToolOutput/StructuredList.tsx`
- Create: `source/components/ToolOutput/StructuredList.test.tsx`
- Create: `source/utils/fileTree.ts` (pure tree builder)
- Create: `source/utils/fileTree.test.ts`

**Step 1: Write failing tests for tree builder utility**

```typescript
// source/utils/fileTree.test.ts
import {describe, it, expect} from 'vitest';
import {buildFileTree, renderTree} from './fileTree.js';

describe('buildFileTree', () => {
	it('builds a tree from flat file paths', () => {
		const paths = [
			'source/components/DiffBlock.tsx',
			'source/components/StructuredList.tsx',
			'source/utils/toolExtractors.ts',
		];
		const tree = buildFileTree(paths);
		expect(tree.children).toHaveLength(1); // 'source/'
		const source = tree.children[0]!;
		expect(source.name).toBe('source');
		expect(source.children).toHaveLength(2); // 'components/', 'utils/'
	});

	it('collapses common prefix', () => {
		const paths = ['source/components/A.tsx', 'source/components/B.tsx'];
		const tree = buildFileTree(paths);
		// Common prefix 'source/components/' should be collapsed
		expect(tree.name).toBe('source/components');
		expect(tree.children).toHaveLength(2);
	});
});

describe('renderTree', () => {
	it('renders with box-drawing characters', () => {
		const paths = ['source/a.ts', 'source/b.ts'];
		const tree = buildFileTree(paths);
		const lines = renderTree(tree);
		expect(lines.some(l => l.includes('├─'))).toBe(true);
		expect(lines.some(l => l.includes('└─'))).toBe(true);
	});

	it('renders single file without tree decoration', () => {
		const paths = ['source/app.ts'];
		const tree = buildFileTree(paths);
		const lines = renderTree(tree);
		expect(lines).toHaveLength(1);
		expect(lines[0]).toContain('app.ts');
	});
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run source/utils/fileTree.test.ts`
Expected: FAIL — module not found

**Step 3: Implement tree builder**

```typescript
// source/utils/fileTree.ts

export type TreeNode = {
	name: string;
	isDir: boolean;
	children: TreeNode[];
	fullPath?: string; // for leaf files, used for OSC 8 links
};

/**
 * Build a tree from flat file paths.
 * Collapses common prefix into root node name.
 */
export function buildFileTree(paths: string[]): TreeNode {
	// ... implementation: split paths by '/', build trie, collapse single-child directories
}

/**
 * Render tree to string lines with box-drawing characters.
 * Returns array of lines ready for display.
 */
export function renderTree(
	node: TreeNode,
	prefix?: string,
	isLast?: boolean,
): string[] {
	// ... implementation using ├─, └─, │ characters
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run source/utils/fileTree.test.ts`
Expected: PASS

**Step 5: Write failing test for StructuredList tree mode**

```typescript
// source/components/ToolOutput/StructuredList.test.tsx
import React from 'react';
import {describe, it, expect} from 'vitest';
import {render} from 'ink-testing-library';
import StructuredList from './StructuredList.js';

describe('StructuredList', () => {
	it('renders as tree when displayMode is tree', () => {
		const items = [
			{primary: 'src/a.ts'},
			{primary: 'src/b.ts'},
			{primary: 'lib/c.ts'},
		];
		const {lastFrame} = render(
			<StructuredList items={items} displayMode="tree" />,
		);
		const frame = lastFrame() ?? '';
		// Should contain tree characters, not bullet points
		expect(frame).not.toContain('•');
		expect(frame).toContain('a.ts');
		expect(frame).toContain('b.ts');
	});

	it('renders as flat list when displayMode is undefined', () => {
		const items = [{primary: 'a.ts'}, {primary: 'b.ts'}];
		const {lastFrame} = render(<StructuredList items={items} />);
		const frame = lastFrame() ?? '';
		expect(frame).toContain('•');
	});
});
```

**Step 6: Implement StructuredList tree mode**

Update `StructuredList.tsx` Props to accept `displayMode?: 'tree'`. When set, use `buildFileTree` + `renderTree` from `fileTree.ts` to render as indented tree instead of bullet list.

Update `ToolOutputRenderer.tsx` to pass `displayMode` from list output to `StructuredList`.

**Step 7: Run all tests**

Run: `npx vitest run source/utils/fileTree.test.ts source/components/ToolOutput/StructuredList.test.tsx`
Expected: PASS

**Step 8: Run lint + typecheck**

Run: `npm run lint && npx tsc --noEmit`

**Step 9: Commit**

```bash
git add source/utils/fileTree.ts source/utils/fileTree.test.ts source/components/ToolOutput/StructuredList.tsx source/components/ToolOutput/StructuredList.test.tsx source/components/ToolOutput/ToolOutputRenderer.tsx
git commit -m "feat(StructuredList): file tree rendering for Glob results"
```

---

## Task 6: Grep Grouped-by-File Renderer

**Files:**

- Modify: `source/components/ToolOutput/StructuredList.tsx`
- Modify: `source/components/ToolOutput/StructuredList.test.tsx`

**Step 1: Write failing tests**

```typescript
// Add to StructuredList.test.tsx:

it('renders grouped by file when groupBy is secondary', () => {
	const items = [
		{primary: 'const x = 1;', secondary: 'src/app.tsx:10'},
		{primary: 'const y = 2;', secondary: 'src/app.tsx:20'},
		{primary: 'import z', secondary: 'src/lib.ts:5'},
	];
	const {lastFrame} = render(
		<StructuredList items={items} groupBy="secondary" />,
	);
	const frame = lastFrame() ?? '';
	// Should show file headers, not bullet points
	expect(frame).not.toContain('•');
	expect(frame).toContain('src/app.tsx');
	expect(frame).toContain('src/lib.ts');
	expect(frame).toContain('10');
	expect(frame).toContain('const x = 1;');
});

it('renders as flat list when groupBy is undefined', () => {
	const items = [
		{primary: 'match', secondary: 'file:10'},
	];
	const {lastFrame} = render(<StructuredList items={items} />);
	const frame = lastFrame() ?? '';
	expect(frame).toContain('•');
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run source/components/ToolOutput/StructuredList.test.tsx`
Expected: FAIL — groupBy prop not handled

**Step 3: Implement grouped rendering**

Update `StructuredList.tsx` Props to accept `groupBy?: 'secondary'`. When set:

- Parse `secondary` field to extract file path and line number (split on last `:`)
- Group items by file path
- Render file header (bold, with `fileLink` from hyperlink.ts)
- Render each match line: right-aligned line number + `│` + content

Update `ToolOutputRenderer.tsx` to pass `groupBy` from list output to `StructuredList`.

**Step 4: Run tests to verify they pass**

Run: `npx vitest run source/components/ToolOutput/StructuredList.test.tsx`
Expected: PASS

**Step 5: Run lint + typecheck**

Run: `npm run lint && npx tsc --noEmit`

**Step 6: Commit**

```bash
git add source/components/ToolOutput/StructuredList.tsx source/components/ToolOutput/StructuredList.test.tsx source/components/ToolOutput/ToolOutputRenderer.tsx
git commit -m "feat(StructuredList): grep results grouped by file with line numbers"
```

---

## Task 7: OSC 8 Integration into Renderers

**Files:**

- Modify: `source/components/ToolOutput/DiffBlock.tsx` (file header link)
- Modify: `source/components/ToolOutput/CodeBlock.tsx` (file:line regex)
- Modify: `source/components/ToolOutput/MarkdownText.tsx` (link renderer override)
- Modify: `source/utils/markedFactory.ts` (link renderer hook)

**Step 1: Write failing tests**

For CodeBlock — test that file paths in Bash output get wrapped with hyperlink sequences:

```typescript
// Create source/components/ToolOutput/CodeBlock.test.tsx
import React from 'react';
import {describe, it, expect, vi, afterEach} from 'vitest';
import {render} from 'ink-testing-library';
import CodeBlock from './CodeBlock.js';

describe('CodeBlock', () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it('wraps absolute file paths with OSC 8 when supported', () => {
		vi.stubEnv('ATHENA_HYPERLINKS', '1');
		const content = 'Error at /home/user/src/app.ts:42:10';
		const {lastFrame} = render(
			<CodeBlock content={content} language="bash" />,
		);
		const frame = lastFrame() ?? '';
		// Should contain OSC 8 escape sequence
		expect(frame).toContain('\x1b]8;;');
		expect(frame).toContain('/home/user/src/app.ts');
	});

	it('does not wrap file paths when hyperlinks not supported', () => {
		vi.stubEnv('ATHENA_HYPERLINKS', '0');
		vi.stubEnv('TERM_PROGRAM', '');
		vi.stubEnv('WT_SESSION', '');
		vi.stubEnv('VTE_VERSION', '');
		vi.stubEnv('TERM', 'xterm-256color');
		const content = 'Error at /home/user/src/app.ts:42:10';
		const {lastFrame} = render(
			<CodeBlock content={content} language="bash" />,
		);
		const frame = lastFrame() ?? '';
		expect(frame).not.toContain('\x1b]8;;');
	});
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run source/components/ToolOutput/CodeBlock.test.tsx`
Expected: FAIL — no hyperlink wrapping yet

**Step 3: Implement OSC 8 integration**

In `CodeBlock.tsx`: After syntax highlighting, apply a regex pass `/(?:\/[\w.-]+)+(?::\d+(?::\d+)?)/g` to detect absolute file paths. Wrap matches with `hyperlink()` from `hyperlink.ts`.

In `MarkdownText.tsx` / `markedFactory.ts`: Override the `link` renderer to use `urlLink()` for URLs, wrapping the visible text with OSC 8 sequences instead of just coloring it.

DiffBlock and StructuredList already use `fileLink` from earlier tasks — verify those are wired up.

**Step 4: Run all tests**

Run: `npx vitest run source/components/ToolOutput/`
Expected: PASS

**Step 5: Run lint + typecheck**

Run: `npm run lint && npx tsc --noEmit`

**Step 6: Commit**

```bash
git add source/components/ToolOutput/CodeBlock.tsx source/components/ToolOutput/CodeBlock.test.tsx source/components/ToolOutput/MarkdownText.tsx source/utils/markedFactory.ts
git commit -m "feat(hyperlink): integrate OSC 8 into CodeBlock, MarkdownText, and renderers"
```

---

## Task 8: Full Integration Test + Final Verification

**Files:**

- Run all tests
- Run lint + typecheck
- Manual smoke test

**Step 1: Run full test suite**

Run: `npx vitest run source/`
Expected: All PASS

**Step 2: Run lint + typecheck**

Run: `npm run lint && npx tsc --noEmit`
Expected: Clean

**Step 3: Build**

Run: `npm run build`
Expected: Clean build

**Step 4: Final commit (if any fixups needed)**

```bash
git add -A
git commit -m "chore: fixups from integration testing"
```
