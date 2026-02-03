import React from 'react';
import {Box, Text} from 'ink';
import {
	type HookEventDisplay,
	isPreToolUseEvent,
	isPostToolUseEvent,
	isPostToolUseFailureEvent,
	isPermissionRequestEvent,
	isNotificationEvent,
} from '../types/hooks/index.js';
import SessionEndEvent from './SessionEndEvent.js';

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
	passthrough: '\u2713', // ✓
	blocked: '\u2717', // ✗
	json_output: '\u2192', // →
} as const;

function truncateStr(s: string, maxLen: number): string {
	if (s.length <= maxLen) return s;
	return s.slice(0, maxLen - 3) + '...';
}

/**
 * Format tool_input as key-value lines.
 * Values are truncated since inputs like Write.content can be very large.
 */
function formatToolInput(input: Record<string, unknown>): string {
	return Object.entries(input)
		.map(([key, val]) => {
			const valStr = typeof val === 'string' ? val : JSON.stringify(val);
			return `  ${key}: ${truncateStr(valStr, 120)}`;
		})
		.join('\n');
}

/**
 * Format tool_response for display.
 *
 * Responses vary by tool:
 *  - String (e.g. Bash stdout)
 *  - Content-block array from MCP tools: [{"type":"text","text":"..."},...]
 *  - JSON object (e.g. Write: {"filePath":"...","success":true})
 *  - null / undefined
 *
 * Shows the full text content without truncation.
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

	// JSON object — show as key-value pairs
	if (typeof response === 'object') {
		return Object.entries(response as Record<string, unknown>)
			.map(([key, val]) => {
				const valStr = typeof val === 'string' ? val : JSON.stringify(val);
				return `  ${key}: ${valStr}`;
			})
			.join('\n');
	}

	return String(response);
}

export default function HookEvent({event, debug}: Props) {
	// Route SessionEnd events to specialized component
	if (event.hookName === 'SessionEnd') {
		return <SessionEndEvent event={event} />;
	}
	const color = STATUS_COLORS[event.status];
	const symbol = STATUS_SYMBOLS[event.status];

	// Format timestamp
	const time = event.timestamp.toLocaleTimeString('en-US', {
		hour12: false,
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
	});

	const payload = event.payload;

	// Build preview content based on hook type.
	// Non-debug: formatted key-value preview for tool/notification events.
	// Debug: full JSON for everything.
	let previewContent: React.ReactNode = null;
	if (!debug) {
		if (isPreToolUseEvent(payload) || isPermissionRequestEvent(payload)) {
			const formatted = formatToolInput(payload.tool_input);
			if (formatted) {
				previewContent = (
					<Box>
						<Text dimColor>{formatted}</Text>
					</Box>
				);
			}
		} else if (isPostToolUseFailureEvent(payload)) {
			const response = formatToolResponse(payload.tool_response);
			if (response) {
				previewContent = (
					<Box>
						<Text color="red">{response}</Text>
					</Box>
				);
			}
		} else if (isPostToolUseEvent(payload)) {
			const response = formatToolResponse(payload.tool_response);
			if (response) {
				previewContent = (
					<Box>
						<Text dimColor>{response}</Text>
					</Box>
				);
			}
		} else if (isNotificationEvent(payload)) {
			const msg = truncateStr(payload.message, 200);
			previewContent = (
				<Box>
					<Text dimColor>{msg}</Text>
				</Box>
			);
		}
	}

	return (
		<Box
			flexDirection="column"
			borderStyle="single"
			borderColor={color}
			paddingX={1}
			marginY={0}
		>
			<Box>
				<Text color={color}>
					{symbol} [{time}]{' '}
				</Text>
				{event.toolName ? (
					<>
						<Text color="gray">{event.hookName}:</Text>
						<Text color={color} bold>
							{event.toolName}
						</Text>
					</>
				) : (
					<Text color={color}>{event.hookName}</Text>
				)}
				{event.status !== 'pending' && (
					<Text color="gray"> ({event.status})</Text>
				)}
			</Box>
			{debug ? (
				<Box>
					<Text dimColor>{JSON.stringify(event.payload, null, 2)}</Text>
				</Box>
			) : (
				previewContent
			)}
			{event.result?.stderr && (
				<Box>
					<Text color="red">{event.result.stderr}</Text>
				</Box>
			)}
		</Box>
	);
}
