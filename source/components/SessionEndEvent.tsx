import React from 'react';
import {Box, Text} from 'ink';
import {
	type HookEventDisplay,
	isSessionEndEvent,
} from '../types/hooks/index.js';

type Props = {
	event: HookEventDisplay;
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

export default function SessionEndEvent({event}: Props) {
	const color = STATUS_COLORS[event.status];
	const symbol = STATUS_SYMBOLS[event.status];

	// Format timestamp
	const time = event.timestamp.toLocaleTimeString('en-US', {
		hour12: false,
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
	});

	const summary = event.transcriptSummary;
	const payload = event.payload;
	const reason = isSessionEndEvent(payload) ? payload.reason : 'unknown';

	return (
		<Box
			flexDirection="column"
			borderStyle="single"
			borderColor={color}
			paddingX={1}
			marginY={0}
		>
			{/* Header row */}
			<Box>
				<Text color={color}>
					{symbol} [{time}] SessionEnd
				</Text>
				{event.status !== 'pending' && (
					<Text color="gray"> ({event.status})</Text>
				)}
			</Box>

			{/* Session end reason */}
			<Box marginTop={0}>
				<Text color="gray">Reason: </Text>
				<Text>{reason}</Text>
			</Box>

			{/* Stats row */}
			{summary && !summary.error && (
				<Box>
					<Text color="gray">
						Messages: {summary.messageCount} | Tool calls:{' '}
						{summary.toolCallCount}
					</Text>
				</Box>
			)}

			{/* Error message if transcript unavailable */}
			{summary?.error && (
				<Box marginTop={0}>
					<Text color="yellow">{summary.error}</Text>
				</Box>
			)}

			{/* Claude's last response - full text with word wrap */}
			{summary?.lastAssistantText && (
				<Box flexDirection="column" marginTop={1}>
					<Text color="cyan" bold>
						Claude's last response:
					</Text>
					<Box marginTop={0}>
						<Text wrap="wrap">{summary.lastAssistantText}</Text>
					</Box>
				</Box>
			)}

			{/* Loading state when transcript is being parsed */}
			{!summary && (
				<Box marginTop={0}>
					<Text color="gray" dimColor>
						Loading transcript...
					</Text>
				</Box>
			)}
		</Box>
	);
}
