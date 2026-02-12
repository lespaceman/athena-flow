/**
 * Shared constants, formatting functions, and sub-components used across
 * hook event renderers (UnifiedToolCallEvent, SubagentEvent, etc.).
 */

import React from 'react';
import {Box, Text} from 'ink';
import {
	type HookEventDisplay,
	type PostToolUseEvent,
	type PostToolUseFailureEvent,
	isPostToolUseFailureEvent,
} from '../types/hooks/index.js';
import {type Theme} from '../theme/index.js';

// ── Status constants ────────────────────────────────────────────────

export function getStatusColors(theme: Theme) {
	return {
		pending: theme.status.warning,
		passthrough: theme.status.success,
		blocked: theme.status.error,
		json_output: theme.status.info,
	} as const;
}

export const STATUS_SYMBOLS = {
	pending: '\u25cb', // ○
	passthrough: '\u25cf', // ●
	blocked: '\u2717', // ✗
	json_output: '\u2192', // →
} as const;

export const SUBAGENT_SYMBOLS = {
	pending: '\u25c7', // ◇ (open diamond)
	passthrough: '\u25c6', // ◆ (filled diamond)
	blocked: '\u2717', // ✗ (same as regular)
	json_output: '\u2192', // → (same as regular)
} as const;

// ── Response formatting ─────────────────────────────────────────────

export const RESPONSE_PREFIX = '\u23bf  ';
const CONTINUATION_PAD = '   '; // matches width of "⎿  "

export function truncateStr(s: string, maxLen: number): string {
	if (s.length <= maxLen) return s;
	return s.slice(0, maxLen - 3) + '...';
}

/**
 * Indent continuation lines so multiline response text aligns with
 * the content after the `⎿ ` prefix (2 chars wide).
 */
export function formatResponseBlock(text: string): string {
	const lines = text.split('\n');
	if (lines.length <= 1) return RESPONSE_PREFIX + text;
	return lines
		.map((line, i) =>
			i === 0 ? RESPONSE_PREFIX + line : CONTINUATION_PAD + line,
		)
		.join('\n');
}

/**
 * Format tool_response for display.
 *
 * Claude Code tool responses come in several shapes:
 *  - String (e.g. Bash stdout)
 *  - Content-block array: [{type:"text", text:"..."}, ...]
 *  - Single content block: {type:"text", text:"..."}
 *  - Wrapped response: {content: <string or content-block array>, isError?: boolean}
 *  - null / undefined
 *
 * This function always extracts the text content rather than dumping the
 * raw response object.
 */
export function formatToolResponse(response: unknown): string {
	if (response == null) return '';
	if (typeof response === 'string') return response.trim();

	// Content-block array: extract text fields, replace images with placeholder
	if (Array.isArray(response)) {
		const parts: string[] = [];
		for (const block of response) {
			if (typeof block !== 'object' || block === null) continue;
			const obj = block as Record<string, unknown>;
			if (obj['type'] === 'image') {
				parts.push('[image]');
			} else if (typeof obj['text'] === 'string') {
				parts.push(obj['text']);
			}
		}
		if (parts.length > 0) return parts.join('\n').trim();
		// Array of non-content-blocks — show as JSON
		return JSON.stringify(response, null, 2);
	}

	if (typeof response === 'object') {
		const obj = response as Record<string, unknown>;

		// Single content block: {type: "text", text: "..."}
		if (typeof obj['text'] === 'string' && obj['type'] === 'text') {
			return (obj['text'] as string).trim();
		}

		// Wrapped response: {content: "..." or content: [...]}
		// MCP tools and some built-in tools wrap the actual content
		if ('content' in obj && obj['content'] != null) {
			return formatToolResponse(obj['content']);
		}

		// Generic object — show as key-value pairs
		return Object.entries(obj)
			.map(([key, val]) => {
				const valStr = typeof val === 'string' ? val : JSON.stringify(val);
				return `  ${key}: ${valStr}`;
			})
			.join('\n');
	}

	return String(response);
}

/**
 * Bash tool response shape from Claude Code.
 * The Bash tool returns a structured object rather than a plain string.
 */
type BashToolResponse = {
	stdout: string;
	stderr: string;
	interrupted: boolean;
	isImage: boolean;
	noOutputExpected: boolean;
};

export function isBashToolResponse(
	response: unknown,
): response is BashToolResponse {
	return (
		typeof response === 'object' &&
		response !== null &&
		typeof (response as Record<string, unknown>)['stdout'] === 'string'
	);
}

/**
 * Extract the display text from a PostToolUse or PostToolUseFailure payload.
 *
 * PostToolUse has `tool_response` (varies by tool).
 * PostToolUseFailure has `error` (string) per the hooks reference.
 *
 * For the Bash tool, extracts stdout/stderr from the structured response
 * rather than dumping all metadata fields.
 */
export function getPostToolText(
	payload: PostToolUseEvent | PostToolUseFailureEvent,
): string {
	if (isPostToolUseFailureEvent(payload)) {
		return payload.error;
	}

	// Bash tool returns {stdout, stderr, interrupted, ...} — extract text content
	if (
		payload.tool_name === 'Bash' &&
		isBashToolResponse(payload.tool_response)
	) {
		const {stdout, stderr} = payload.tool_response;
		const out = stdout.trim();
		const err = stderr.trim();
		if (err) return out ? `${out}\n${err}` : err;
		return out;
	}

	return formatToolResponse(payload.tool_response);
}

// ── Shared sub-components ───────────────────────────────────────────

/**
 * Render the response line (⎿) for a PostToolUse/PostToolUseFailure payload.
 */
export function ResponseBlock({
	response,
	isFailed,
}: {
	response: string;
	isFailed: boolean;
}): React.ReactNode {
	if (!response) return null;
	return (
		<Box paddingLeft={3}>
			<Text color={isFailed ? 'red' : undefined} dimColor={!isFailed}>
				{formatResponseBlock(response)}
			</Text>
		</Box>
	);
}

/**
 * Render stderr if present on a hook result.
 */
export function StderrBlock({
	result,
}: {
	result: HookEventDisplay['result'];
}): React.ReactNode {
	if (!result?.stderr) return null;
	return (
		<Box paddingLeft={3}>
			<Text color="red">{result.stderr}</Text>
		</Box>
	);
}
