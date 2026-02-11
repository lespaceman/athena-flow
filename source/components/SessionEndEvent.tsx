import React from 'react';
import {Box, Text} from 'ink';
import {
	type HookEventDisplay,
	isSessionEndEvent,
} from '../types/hooks/index.js';
import {getStatusColors} from './hookEventUtils.js';
import {useTheme} from '../theme/index.js';

type Props = {
	event: HookEventDisplay;
};

// SessionEnd uses ✓ (checkmark) for passthrough instead of ● (filled circle)
const STATUS_SYMBOLS = {
	pending: '\u25cb', // ○
	passthrough: '\u2713', // ✓
	blocked: '\u2717', // ✗
	json_output: '\u2192', // →
} as const;

export default function SessionEndEvent({event}: Props) {
	const theme = useTheme();
	const statusColors = getStatusColors(theme);
	const color = statusColors[event.status];
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
					<Text color={theme.textMuted}> ({event.status})</Text>
				)}
			</Box>

			{/* Session end reason */}
			<Box marginTop={0}>
				<Text color={theme.textMuted}>Reason: </Text>
				<Text>{reason}</Text>
			</Box>

			{/* Stats row */}
			{summary && !summary.error && (
				<Box>
					<Text color={theme.textMuted}>
						Messages: {summary.messageCount} | Tool calls:{' '}
						{summary.toolCallCount}
					</Text>
				</Box>
			)}

			{/* Error message if transcript unavailable */}
			{summary?.error && (
				<Box marginTop={0}>
					<Text color={theme.status.warning}>{summary.error}</Text>
				</Box>
			)}

			{/* Claude's last response - full text with word wrap */}
			{summary?.lastAssistantText && (
				<Box flexDirection="column" marginTop={1}>
					<Text color={theme.accent} bold>
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
					<Text dimColor>Loading transcript...</Text>
				</Box>
			)}
		</Box>
	);
}
