# Tool Output Rendering Improvements — Design

**Date**: 2026-02-24
**Status**: Approved
**Architecture**: Approach A — enrich existing `RenderableOutput` types, make renderers smarter

## Scope

Four features, all equal priority:

1. Diff improvements — context lines, line numbers, hunk headers, side-by-side (≥120 cols)
2. File tree rendering — Glob expanded view as indented directory tree
3. Grep grouping — group results by file with headers and line numbers
4. OSC 8 hyperlinks — auto-detected clickable file paths and URLs

Stack trace parsing was dropped — OSC 8 file path detection in Bash output covers the value.

## 1. Diff Improvements

### Type Changes (`source/types/toolOutput.ts`)

Enrich the existing `diff` variant:

```typescript
{
  type: 'diff';
  hunks: DiffHunk[];        // structured hunk data
  filePath?: string;        // from Edit tool input
  maxLines?: number;
  // oldText/newText kept for backward compat
}

type DiffHunk = {
  header: string;            // "@@ -10,7 +10,8 @@ function foo()"
  oldStart: number;
  newStart: number;
  lines: DiffLine[];
};

type DiffLine = {
  type: 'context' | 'add' | 'remove';
  content: string;
  oldLineNo?: number;
  newLineNo?: number;
};
```

### Extractor (`extractEdit`)

Parse `structuredPatch` from Edit tool response into `DiffHunk[]` with line numbers and context lines. Fall back to current old/new text diff if `structuredPatch` is absent.

### Renderer (`DiffBlock.tsx`)

**Unified mode** (< 120 cols):
```
source/utils/foo.ts
@@ -10,7 +10,8 @@ function foo()
  10     │  const x = 1;        ← context (dim)
  11   - │  return x + 1;       ← removed (red)
  11   + │  return x + 2;       ← added (green)
  12     │  }                   ← context (dim)
```

**Side-by-side mode** (≥ 120 cols):
```
source/utils/foo.ts
@@ -10,7 +10,8 @@ function foo()
  10 │ const x = 1;          │  10 │ const x = 1;
  11 │ return x + 1;         │  11 │ return x + 2;
  12 │ }                     │  12 │ }
```

Line numbers right-aligned. Removed lines red (left), added green (right). Context dim.

## 2. File Tree Rendering (Glob)

### Extractor (`extractGlob`)

Add display mode hint:

```typescript
{
  type: 'list';
  items: ListItem[];
  displayMode?: 'tree';    // hint for renderer
  maxItems?: number;
}
```

### Renderer (`StructuredList.tsx`)

When `displayMode === 'tree'` (expanded view only):

```
source/
  ├─ components/
  │  ├─ DiffBlock.tsx
  │  └─ ToolResultContainer.tsx
  ├─ utils/
  │  └─ toolExtractors.ts
  └─ types/
     └─ toolOutput.ts
```

- Box-drawing chars (`├─`, `└─`, `│`) with ASCII fallback
- Common prefix collapsed
- Directories dim, files normal
- Full depth always shown

Inline preview unchanged (flat count summary).

## 3. Grep Grouping by File

### Extractor (`extractGrep`)

Add grouping hint:

```typescript
{
  type: 'list';
  items: ListItem[];
  groupBy?: 'secondary';    // group by file path in secondary field
  maxItems?: number;
}
```

### Renderer (`StructuredList.tsx`)

When `groupBy === 'secondary'`:

```
source/utils/toolExtractors.ts
   42 │ const EXTRACTORS: Record<string, Extractor> = {
   58 │ function extractGrep(...): RawOutput {

source/components/PostToolResult.tsx
   15 │ import {extractToolOutput} from '../utils/toolExtractors.js';
```

- File header bold, common prefix stripped
- Line numbers right-aligned with `│` separator
- Search pattern highlighted (bold/yellow) when extractable from tool input
- OSC 8 hyperlinks on file headers and line numbers

## 4. OSC 8 Hyperlinks

### New Utility (`source/utils/hyperlink.ts`)

```typescript
export function hyperlink(text: string, url: string): string;
export function supportsHyperlinks(): boolean;   // cached at startup
export function fileLink(filePath: string, line?: number, col?: number): string;
export function urlLink(url: string, displayText?: string): string;
```

### Auto-Detection

| Signal | Terminals |
|--------|-----------|
| `TERM_PROGRAM=iTerm.app` | iTerm2 |
| `TERM_PROGRAM=WezTerm` | WezTerm |
| `WT_SESSION` set | Windows Terminal |
| `VTE_VERSION >= 5000` | GNOME Terminal, Tilix |
| `TERM_PROGRAM=Hyper` | Hyper |
| `TERM=xterm-kitty` | Kitty |

Override: `ATHENA_HYPERLINKS=1|0` env var. Falls back to `false`.

### File URL Format

- `file:///absolute/path/to/file.ts` (standard file URI)
- VS Code protocol where available: `vscode://file/path:line:col`

### Integration Points

1. **DiffBlock** — file path in hunk header clickable
2. **StructuredList (Grep)** — file headers and line numbers clickable
3. **StructuredList (Glob tree)** — file names clickable
4. **MarkdownText** — URLs in markdown links clickable (override marked-terminal renderer)
5. **CodeBlock (Bash)** — file:line:col patterns detected via regex, made clickable

Bash output regex: `/(?:\/[\w.-]+)+(?::\d+(?::\d+)?)/g`

## Files Modified

| File | Change |
|------|--------|
| `source/types/toolOutput.ts` | Add `DiffHunk`, `DiffLine`, `displayMode`, `groupBy` fields |
| `source/utils/toolExtractors.ts` | Enrich `extractEdit`, `extractGlob`, `extractGrep` |
| `source/utils/hyperlink.ts` | **New** — OSC 8 utility with detection |
| `source/components/ToolOutput/DiffBlock.tsx` | Hunk rendering, line numbers, side-by-side |
| `source/components/ToolOutput/StructuredList.tsx` | Tree mode, grouped mode |
| `source/components/ToolOutput/MarkdownText.tsx` | OSC 8 link renderer override |
| `source/components/ToolOutput/CodeBlock.tsx` | File path regex + OSC 8 |
