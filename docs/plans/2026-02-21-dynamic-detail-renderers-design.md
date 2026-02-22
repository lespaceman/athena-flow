# Dynamic Detail Renderers for Read/Write Tools — Design

**Goal:** Render Read/Write tool detail views dynamically based on file type — markdown renderer for `.md`, `.txt`, and unknown extensions; syntax highlighting for recognized code files.

## Current Behavior

- **Read**: Always returns `type: 'code'` → `highlightCode()`. Markdown files get syntax-highlighted source instead of rendered markdown.
- **Write**: Returns `type: 'text'` with `"Wrote /path"` — doesn't show file content at all.

## Proposed Changes (Approach A: Extractor-level)

### Helper: `isMarkdownRenderable`

Add to `toolExtractors.ts`:

```typescript
function isMarkdownRenderable(language: string | undefined): boolean {
	return language === undefined || language === 'markdown';
}
```

- `undefined` = no recognized extension (`.txt`, `Makefile`, etc.)
- `'markdown'` = `.md` files

### `extractRead` changes

Currently always returns `{type: 'code', ...}`. Change to check language:

- `isMarkdownRenderable(lang)` → return `{type: 'text', content, maxLines: 10}` (routes to `renderMarkdownToLines`)
- Otherwise → return `{type: 'code', content, language, maxLines: 10}` (routes to `highlightCode`)

### `extractWrite` changes

Currently returns `"Wrote /path"`. Change to:

1. Extract `tool_input.content` (the written content)
2. Detect language from `tool_input.file_path`
3. `isMarkdownRenderable(lang)` → `{type: 'text', content}`
4. Otherwise → `{type: 'code', content, language}`

### No changes needed

- `renderDetailLines.ts` — already dispatches `text` → `renderMarkdownToLines`, `code` → `highlightCode`
- `RawOutput`/`RenderableOutput` types — no new variants needed
- `MarkdownText.tsx` component — not involved (detail view uses `renderDetailLines`)

## File extension routing

| Extension                 | `detectLanguage` | Renderer         |
| ------------------------- | ---------------- | ---------------- |
| `.md`                     | `'markdown'`     | Markdown         |
| `.txt`                    | `undefined`      | Markdown         |
| No ext (`Makefile`, etc.) | `undefined`      | Markdown         |
| `.ts`, `.js`, `.py`, etc. | language string  | Syntax highlight |
| `.json`, `.yaml`, `.toml` | language string  | Syntax highlight |
