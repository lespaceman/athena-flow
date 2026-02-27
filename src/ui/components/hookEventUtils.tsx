import React from 'react';
import {Box, Text} from 'ink';
import {type Theme} from '../theme/index';
import ToolResultContainer from './ToolOutput/ToolResultContainer';
import {getGlyphs} from '../glyphs/index';

export type StatusKey = 'pending' | 'passthrough' | 'blocked' | 'json_output';

export function getStatusColors(theme: Theme) {
	return {
		pending: theme.status.warning,
		passthrough: theme.status.success,
		blocked: theme.status.error,
		json_output: theme.status.info,
	} as const;
}

const g = getGlyphs();

export const STATUS_SYMBOLS = {
	pending: g['status.pending'],
	passthrough: g['status.passthrough'],
	blocked: g['status.blocked'],
	json_output: g['tool.arrow'],
} as const;

export const SUBAGENT_SYMBOLS = {
	pending: g['subagent.pending'],
	passthrough: g['subagent.passthrough'],
	blocked: g['status.blocked'],
	json_output: g['tool.arrow'],
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

export function getPostToolText(payload: unknown): string {
	const p = payload as Record<string, unknown>;

	// PostToolUseFailure has 'error' field
	if (p.hook_event_name === 'PostToolUseFailure') {
		return (p.error as string) ?? '';
	}

	const toolName = p.tool_name as string | undefined;
	const toolResponse = p.tool_response;

	// Bash tool returns {stdout, stderr, interrupted, ...} — extract text content
	if (toolName === 'Bash' && isBashToolResponse(toolResponse)) {
		const {stdout, stderr} = toolResponse;
		const out = stdout.trim();
		const err = stderr.trim();
		if (err) return out ? `${out}\n${err}` : err;
		return out;
	}

	return formatToolResponse(toolResponse);
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

export function StderrBlock({result}: {result: unknown}): React.ReactNode {
	const r = result as Record<string, unknown> | undefined;
	if (!r?.stderr) return null;
	return (
		<Box paddingLeft={3}>
			<Text color="red">{r.stderr as string}</Text>
		</Box>
	);
}
