import React from 'react';
import {Box, Text} from 'ink';
import {
	type HookEventDisplay,
	type PostToolUseEvent,
	type PostToolUseFailureEvent,
	isPostToolUseFailureEvent,
} from '../types/hooks/index.js';
import {type Theme} from '../theme/index.js';
import ToolResultContainer from './ToolOutput/ToolResultContainer.js';

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

export function truncateStr(s: string, maxLen: number): string {
	if (s.length <= maxLen) return s;
	return s.slice(0, maxLen - 3) + '...';
}

/**
 * Extract display text from a tool_response, handling the various shapes:
 * string, content-block array, single content block, wrapped {content: ...}, or object.
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

export function ResponseBlock({
	response,
	isFailed,
}: {
	response: string;
	isFailed: boolean;
}): React.ReactNode {
	if (!response) return null;
	return (
		<ToolResultContainer
			dimGutter={!isFailed}
			gutterColor={isFailed ? 'red' : undefined}
		>
			<Text color={isFailed ? 'red' : undefined} dimColor={!isFailed}>
				{response}
			</Text>
		</ToolResultContainer>
	);
}

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
