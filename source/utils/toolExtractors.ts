/**
 * Tool-specific extractors that transform raw tool_response into a
 * RenderableOutput discriminated union for rich rendering.
 *
 * Each extractor is a pure function: (toolInput, toolResponse) → RenderableOutput.
 * Unknown tools fall back to the generic text extractor.
 */

import {type RenderableOutput, type ListItem} from '../types/toolOutput.js';
import {
	formatToolResponse,
	isBashToolResponse,
} from '../components/hookEventUtils.js';

// ── Language detection ──────────────────────────────────────────────

const EXT_TO_LANGUAGE: Record<string, string> = {
	'.ts': 'typescript',
	'.tsx': 'typescript',
	'.js': 'javascript',
	'.jsx': 'javascript',
	'.json': 'json',
	'.py': 'python',
	'.rs': 'rust',
	'.go': 'go',
	'.sh': 'bash',
	'.bash': 'bash',
	'.zsh': 'bash',
	'.css': 'css',
	'.html': 'html',
	'.md': 'markdown',
	'.yaml': 'yaml',
	'.yml': 'yaml',
	'.toml': 'toml',
	'.sql': 'sql',
	'.rb': 'ruby',
	'.java': 'java',
	'.c': 'c',
	'.cpp': 'cpp',
	'.h': 'c',
};

function detectLanguage(filePath: unknown): string | undefined {
	if (typeof filePath !== 'string') return undefined;
	const dot = filePath.lastIndexOf('.');
	if (dot === -1) return undefined;
	return EXT_TO_LANGUAGE[filePath.slice(dot).toLowerCase()];
}

// ── Content extraction helpers ──────────────────────────────────────

/**
 * Safely access a property on an unknown value.
 */
function prop(obj: unknown, key: string): unknown {
	if (typeof obj === 'object' && obj !== null) {
		return (obj as Record<string, unknown>)[key];
	}
	return undefined;
}

function extractTextContent(response: unknown): string {
	if (response == null) return '';
	if (typeof response === 'string') return response;

	// Content-block array: extract text fields
	if (Array.isArray(response)) {
		const parts: string[] = [];
		for (const block of response) {
			if (typeof block === 'string') {
				parts.push(block);
			} else if (typeof block === 'object' && block !== null) {
				const text = prop(block, 'text');
				if (typeof text === 'string') parts.push(text);
			}
		}
		if (parts.length > 0) return parts.join('\n').trim();
	}

	if (typeof response === 'object' && response !== null) {
		// Single text content block
		const text = prop(response, 'text');
		if (typeof text === 'string' && prop(response, 'type') === 'text') {
			return text.trim();
		}

		// Wrapped content (common in MCP tools)
		const content = prop(response, 'content');
		if (content != null) return extractTextContent(content);

		// Try common meaningful fields before dumping everything
		const result = prop(response, 'result');
		if (typeof result === 'string') return result;
		const message = prop(response, 'message');
		if (typeof message === 'string') return message;
		const output = prop(response, 'output');
		if (typeof output === 'string') return output;
	}

	// Last resort: compact JSON (rendered inside a code block by the caller)
	return formatToolResponse(response);
}

// ── Per-tool extractors ─────────────────────────────────────────────

type Extractor = (
	toolInput: Record<string, unknown>,
	toolResponse: unknown,
) => RenderableOutput;

function extractBash(
	_input: Record<string, unknown>,
	response: unknown,
): RenderableOutput {
	if (isBashToolResponse(response)) {
		const out = response.stdout.trim();
		const err = response.stderr.trim();
		const content = err ? (out ? `${out}\n${err}` : err) : out;
		return {type: 'code', content, language: 'bash', maxLines: 30};
	}
	return {type: 'code', content: extractTextContent(response), maxLines: 30};
}

function extractRead(
	input: Record<string, unknown>,
	response: unknown,
): RenderableOutput {
	// PostToolUse shape: content-block array [{type:"text", file:{filePath, content, ...}}]
	// or object {type:"text", file:{...}}
	let content: string | undefined;

	// Content-block array: [{type:"text", file:{filePath, content, numLines, ...}}]
	if (Array.isArray(response)) {
		for (const block of response) {
			const file = prop(block, 'file');
			if (file) {
				const c = prop(file, 'content');
				if (typeof c === 'string') {
					content = c;
					break;
				}
			}
			// Also handle plain text blocks
			const text = prop(block, 'text');
			if (typeof text === 'string') {
				content = text;
				break;
			}
		}
	}
	// Single object with file field
	if (!content && typeof response === 'object' && response !== null) {
		const file = prop(response, 'file');
		if (file) {
			const c = prop(file, 'content');
			if (typeof c === 'string') content = c;
		}
	}

	return {
		type: 'code',
		content: content ?? extractTextContent(response),
		language: detectLanguage(input['file_path']),
		maxLines: 20,
	};
}

function extractEdit(
	input: Record<string, unknown>,
	_response: unknown,
): RenderableOutput {
	const oldText =
		typeof input['old_string'] === 'string' ? input['old_string'] : '';
	const newText =
		typeof input['new_string'] === 'string' ? input['new_string'] : '';
	return {type: 'diff', oldText, newText};
}

function extractWrite(
	input: Record<string, unknown>,
	response: unknown,
): RenderableOutput {
	// PostToolUse shape: {filePath, success} — show confirmation
	if (typeof response === 'object' && response !== null) {
		const filePath = prop(response, 'filePath') ?? input['file_path'] ?? '';
		return {type: 'text', content: `Wrote ${String(filePath)}`};
	}
	const text = extractTextContent(response);
	if (text) return {type: 'text', content: text};
	const filePath =
		typeof input['file_path'] === 'string' ? input['file_path'] : '';
	return {type: 'text', content: `Wrote ${filePath}`};
}

function extractGrep(
	_input: Record<string, unknown>,
	response: unknown,
): RenderableOutput {
	const text = extractTextContent(response);
	const lines = text.split('\n').filter(Boolean);

	const items: ListItem[] = lines.map(line => {
		// Grep output format: "file:line:content" or just file paths
		const match = /^(.+?):(\d+):(.+)$/.exec(line);
		if (match) {
			return {
				primary: match[3]!.trim(),
				secondary: `${match[1]}:${match[2]}`,
			};
		}
		return {primary: line};
	});

	return {type: 'list', items, maxItems: 15};
}

function extractGlob(
	_input: Record<string, unknown>,
	response: unknown,
): RenderableOutput {
	// PostToolUse shape: {filenames: string[], durationMs, numFiles, truncated}
	if (typeof response === 'object' && response !== null) {
		const filenames = prop(response, 'filenames');
		if (Array.isArray(filenames)) {
			const items: ListItem[] = filenames
				.filter((f): f is string => typeof f === 'string')
				.map(f => ({primary: f}));
			return {type: 'list', items, maxItems: 20};
		}
	}
	// Fallback: string response (newline-separated paths)
	const text = extractTextContent(response);
	const items: ListItem[] = text
		.split('\n')
		.filter(Boolean)
		.map(line => ({primary: line}));
	return {type: 'list', items, maxItems: 20};
}

function extractWebFetch(
	_input: Record<string, unknown>,
	response: unknown,
): RenderableOutput {
	// PostToolUse shape: {bytes, code, codeText, result, durationMs, url}
	if (typeof response === 'object' && response !== null) {
		const result = prop(response, 'result');
		if (typeof result === 'string') {
			return {type: 'text', content: result};
		}
	}
	return {type: 'text', content: extractTextContent(response)};
}

function extractWebSearch(
	_input: Record<string, unknown>,
	response: unknown,
): RenderableOutput {
	if (typeof response === 'object' && response !== null) {
		const results = prop(response, 'results');

		// PostToolUse shape: {query, results: [{tool_use_id, content: [{title, url}...]}], durationSeconds}
		if (Array.isArray(results)) {
			const items: ListItem[] = [];

			for (const entry of results) {
				// Structured entry with content array of {title, url}
				if (typeof entry === 'object' && entry !== null) {
					const content = prop(entry, 'content');
					if (Array.isArray(content)) {
						for (const item of content) {
							if (typeof item === 'object' && item !== null) {
								const title = prop(item, 'title');
								const url = prop(item, 'url');
								if (typeof title === 'string') {
									items.push({
										primary: title,
										secondary: typeof url === 'string' ? url : undefined,
									});
								}
							}
						}
					}
					// Direct {title, url} object
					else {
						const title = prop(entry, 'title');
						const url = prop(entry, 'url');
						if (typeof title === 'string') {
							items.push({
								primary: title,
								secondary: typeof url === 'string' ? url : undefined,
							});
						}
					}
				}
			}

			if (items.length > 0) {
				return {type: 'list', items, maxItems: 10};
			}
		}
	}
	// Fallback: plain text summary
	return {type: 'text', content: extractTextContent(response)};
}

function extractNotebookEdit(
	input: Record<string, unknown>,
	_response: unknown,
): RenderableOutput {
	const path =
		typeof input['notebook_path'] === 'string' ? input['notebook_path'] : '';
	const mode =
		typeof input['edit_mode'] === 'string' ? input['edit_mode'] : 'replace';
	const source =
		typeof input['new_source'] === 'string' ? input['new_source'] : '';
	if (!source) return {type: 'text', content: `${mode} cell in ${path}`};
	return {
		type: 'code',
		content: source,
		language: detectLanguage(path),
		maxLines: 20,
	};
}

function extractTask(
	input: Record<string, unknown>,
	response: unknown,
): RenderableOutput {
	// Task tool response is typically a text summary from the subagent
	const text = extractTextContent(response);
	if (text) return {type: 'text', content: text};
	const desc =
		typeof input['description'] === 'string' ? input['description'] : '';
	return {type: 'text', content: desc || 'Task completed'};
}

// ── Registry ────────────────────────────────────────────────────────

const EXTRACTORS: Record<string, Extractor> = {
	Bash: extractBash,
	Read: extractRead,
	Edit: extractEdit,
	Write: extractWrite,
	Grep: extractGrep,
	Glob: extractGlob,
	WebFetch: extractWebFetch,
	WebSearch: extractWebSearch,
	NotebookEdit: extractNotebookEdit,
	Task: extractTask,
};

/**
 * Extract a RenderableOutput from a tool response.
 * Falls back to plain text for unknown tools.
 */
export function extractToolOutput(
	toolName: string,
	toolInput: Record<string, unknown>,
	toolResponse: unknown,
): RenderableOutput {
	const extractor = EXTRACTORS[toolName];
	if (extractor) {
		try {
			return extractor(toolInput, toolResponse);
		} catch {
			// Fallback on extractor error
		}
	}
	return {type: 'text', content: extractTextContent(toolResponse)};
}

// Exported for testing
export {detectLanguage};
