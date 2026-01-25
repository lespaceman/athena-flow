import React from 'react';
import {Box, Text} from 'ink';
import {
	type HookEventDisplay,
	isToolEvent,
	isNotificationEvent,
} from '../types/hooks/index.js';
import SessionEndEvent from './SessionEndEvent.js';

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

export default function HookEvent({event}: Props) {
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

	// Build label
	const label = event.toolName
		? `${event.hookName}:${event.toolName}`
		: event.hookName;

	// Build payload preview (truncated)
	let preview = '';
	const payload = event.payload;
	if (isToolEvent(payload)) {
		const inputStr = JSON.stringify(payload.tool_input);
		preview = inputStr.length > 60 ? inputStr.slice(0, 57) + '...' : inputStr;
	} else if (isNotificationEvent(payload)) {
		preview =
			payload.message.length > 60
				? payload.message.slice(0, 57) + '...'
				: payload.message;
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
					{symbol} [{time}] {label}
				</Text>
				{event.status !== 'pending' && (
					<Text color="gray"> ({event.status})</Text>
				)}
			</Box>
			{preview && (
				<Box>
					<Text color="gray" dimColor>
						{preview}
					</Text>
				</Box>
			)}
			{event.result?.stderr && (
				<Box>
					<Text color="red">{event.result.stderr}</Text>
				</Box>
			)}
		</Box>
	);
}
