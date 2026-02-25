// source/utils/toolSummary.ts

import {isBashToolResponse} from '../components/hookEventUtils.js';

function prop(obj: unknown, key: string): unknown {
	if (typeof obj === 'object' && obj !== null) {
		return (obj as Record<string, unknown>)[key];
	}
	return undefined;
}

function extractFileContent(response: unknown): string | undefined {
	if (Array.isArray(response)) {
		for (const block of response) {
			const fc = prop(prop(block, 'file'), 'content');
			if (typeof fc === 'string') return fc;
			const text = prop(block, 'text');
			if (typeof text === 'string') return text;
		}
	}
	return undefined;
}

type Summarizer = (input: Record<string, unknown>, response: unknown) => string;

function summarizeBash(
	_input: Record<string, unknown>,
	response: unknown,
): string {
	if (isBashToolResponse(response)) {
		const exitCode = prop(response, 'exitCode') ?? 0;
		const stderr = response.stderr.trim();
		const firstLine = stderr.split('\n')[0] ?? '';
		if (stderr && Number(exitCode) !== 0) {
			return `exit ${exitCode} — ${firstLine}`;
		}
		return `exit ${exitCode}`;
	}
	return '';
}

function summarizeRead(
	_input: Record<string, unknown>,
	response: unknown,
): string {
	const content = extractFileContent(response);
	if (content) {
		const lines = content.split('\n').length;
		return `${lines} lines`;
	}
	return '';
}

function summarizeEdit(
	input: Record<string, unknown>,
	_response: unknown,
): string {
	const oldStr =
		typeof input['old_string'] === 'string' ? input['old_string'] : '';
	const newStr =
		typeof input['new_string'] === 'string' ? input['new_string'] : '';
	const oldLines = oldStr.split('\n').length;
	const newLines = newStr.split('\n').length;
	return `replaced ${oldLines} → ${newLines} lines`;
}

function summarizeWrite(
	_input: Record<string, unknown>,
	_response: unknown,
): string {
	// Path is already shown as primary input — no outcome needed
	return '';
}

function summarizeGlob(
	_input: Record<string, unknown>,
	response: unknown,
): string {
	const filenames = prop(response, 'filenames');
	if (Array.isArray(filenames)) return `${filenames.length} files`;
	const numFiles = prop(response, 'numFiles');
	if (typeof numFiles === 'number') return `${numFiles} files`;
	return '';
}

function summarizeGrep(
	_input: Record<string, unknown>,
	response: unknown,
): string {
	if (typeof response !== 'string') return '';
	const matches = response.split('\n').filter(Boolean).length;
	return `${matches} matches`;
}

function summarizeWebSearch(
	_input: Record<string, unknown>,
	response: unknown,
): string {
	const results = prop(response, 'results');
	if (Array.isArray(results)) {
		let count = 0;
		for (const entry of results) {
			const content = prop(entry, 'content');
			count += Array.isArray(content) ? content.length : 1;
		}
		return `${count} results`;
	}
	return '';
}

function summarizeTask(
	input: Record<string, unknown>,
	_response: unknown,
): string {
	const agentType = input['subagent_type'] ?? 'agent';
	return String(agentType);
}

const SUMMARIZERS: Record<string, Summarizer> = {
	Bash: summarizeBash,
	Read: summarizeRead,
	Edit: summarizeEdit,
	Write: summarizeWrite,
	Glob: summarizeGlob,
	Grep: summarizeGrep,
	WebSearch: summarizeWebSearch,
	Task: summarizeTask,
};

/**
 * Produce a short one-line outcome summary for a completed tool call.
 * If `error` is provided, it's a failure summary.
 */
export function summarizeToolResult(
	toolName: string,
	toolInput: Record<string, unknown>,
	toolResponse: unknown,
	error?: string,
): string {
	if (error) {
		const firstLine = error.split('\n')[0] ?? error;
		return firstLine.length > 80 ? firstLine.slice(0, 77) + '...' : firstLine;
	}

	const summarizer = SUMMARIZERS[toolName];
	if (summarizer) {
		try {
			return summarizer(toolInput, toolResponse);
		} catch {
			return '';
		}
	}
	return '';
}
