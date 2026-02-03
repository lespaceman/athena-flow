import React from 'react';
import {Box, Text} from 'ink';
import {
	type HookEventDisplay,
	type PostToolUseEvent,
	type PostToolUseFailureEvent,
	isPreToolUseEvent,
	isPostToolUseEvent,
	isPostToolUseFailureEvent,
	isPermissionRequestEvent,
	isNotificationEvent,
} from '../types/hooks/index.js';
import SessionEndEvent from './SessionEndEvent.js';
import {parseToolName, formatInlineParams} from '../utils/toolNameParser.js';

type Props = {
	event: HookEventDisplay;
	debug?: boolean;
};

const STATUS_COLORS = {
	pending: 'yellow',
	passthrough: 'green',
	blocked: 'red',
	json_output: 'blue',
} as const;

const STATUS_SYMBOLS = {
	pending: '\u25cb', // ○
	passthrough: '\u25cf', // ●
	blocked: '\u2717', // ✗
	json_output: '\u2192', // →
} as const;

function truncateStr(s: string, maxLen: number): string {
	if (s.length <= maxLen) return s;
	return s.slice(0, maxLen - 3) + '...';
}

/**
 * Indent continuation lines so multiline response text aligns with
 * the content after the `⎿ ` prefix (2 chars wide).
 */
const RESPONSE_PREFIX = '\u23bf  ';
const CONTINUATION_PAD = '   '; // matches width of "⎿  "

function formatResponseBlock(text: string): string {
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
function formatToolResponse(response: unknown): string {
	if (response == null) return '';
	if (typeof response === 'string') return response.trim();

	// Content-block array: extract text fields
	if (Array.isArray(response)) {
		const texts = response
			.filter(
				(block): block is {text: string} =>
					typeof block === 'object' &&
					block !== null &&
					typeof (block as Record<string, unknown>).text === 'string',
			)
			.map(block => block.text);
		if (texts.length > 0) return texts.join('\n').trim();
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
 * Extract the display text from a PostToolUse or PostToolUseFailure payload.
 *
 * PostToolUse has `tool_response` (varies by tool).
 * PostToolUseFailure has `error` (string) per the hooks reference.
 */
function getPostToolText(
	payload: PostToolUseEvent | PostToolUseFailureEvent,
): string {
	if (isPostToolUseFailureEvent(payload)) {
		return payload.error;
	}
	return formatToolResponse(payload.tool_response);
}

/**
 * Render the response line (⎿) for a PostToolUse/PostToolUseFailure payload.
 */
function ResponseBlock({
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
function StderrBlock({
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

export default function HookEvent({event, debug}: Props): React.ReactNode {
	// Route SessionEnd events to specialized component
	if (event.hookName === 'SessionEnd') {
		return <SessionEndEvent event={event} />;
	}

	const color = STATUS_COLORS[event.status];
	const symbol = STATUS_SYMBOLS[event.status];
	const payload = event.payload;

	// Tool header: PreToolUse or PermissionRequest (consolidated with PostToolUse)
	const isToolHeader =
		isPreToolUseEvent(payload) || isPermissionRequestEvent(payload);

	if (isToolHeader && !debug) {
		const parsed = parseToolName(payload.tool_name);
		const inlineParams = formatInlineParams(payload.tool_input);
		const postResponse = event.postToolPayload
			? getPostToolText(event.postToolPayload)
			: '';

		return (
			<Box flexDirection="column" marginBottom={1}>
				<Box>
					<Text color={color}>{symbol} </Text>
					<Text color={color} bold>
						{parsed.displayName}
					</Text>
					<Text dimColor>{inlineParams}</Text>
				</Box>
				<ResponseBlock
					response={postResponse}
					isFailed={event.postToolFailed ?? false}
				/>
				<StderrBlock result={event.result} />
			</Box>
		);
	}

	// Standalone PostToolUse/PostToolUseFailure (orphan -- no matching PreToolUse)
	if (
		(isPostToolUseEvent(payload) || isPostToolUseFailureEvent(payload)) &&
		!debug
	) {
		const parsed = parseToolName(payload.tool_name);
		const isFailed = isPostToolUseFailureEvent(payload);

		return (
			<Box flexDirection="column" marginBottom={1}>
				<Box>
					<Text color={color}>{symbol} </Text>
					<Text color={color} bold>
						{parsed.displayName}
					</Text>
					<Text dimColor> (response)</Text>
				</Box>
				<ResponseBlock
					response={getPostToolText(payload)}
					isFailed={isFailed}
				/>
			</Box>
		);
	}

	// Non-tool events (Notification, Stop, SubagentStart, etc.)
	const time = event.timestamp.toLocaleTimeString('en-US', {
		hour12: false,
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
	});

	return (
		<Box flexDirection="column" marginBottom={1}>
			<Box>
				<Text color={color}>
					{symbol} [{time}]{' '}
				</Text>
				<Text color={color}>{event.hookName}</Text>
				{event.status !== 'pending' && (
					<Text color="gray"> ({event.status})</Text>
				)}
			</Box>
			{debug ? (
				<Box>
					<Text dimColor>{JSON.stringify(event.payload, null, 2)}</Text>
				</Box>
			) : (
				isNotificationEvent(payload) && (
					<Box paddingLeft={2}>
						<Text dimColor>{truncateStr(payload.message, 200)}</Text>
					</Box>
				)
			)}
			<StderrBlock result={event.result} />
		</Box>
	);
}
