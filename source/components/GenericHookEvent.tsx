/**
 * Renders non-tool events (Notification, Stop, SessionStart, etc.)
 * and serves as the debug-mode fallback for any event type.
 */

import React from 'react';
import {Box, Text} from 'ink';
import {
	type HookEventDisplay,
	isNotificationEvent,
} from '../types/hooks/index.js';
import {
	STATUS_COLORS,
	STATUS_SYMBOLS,
	truncateStr,
	StderrBlock,
} from './hookEventUtils.js';

type Props = {
	event: HookEventDisplay;
	debug?: boolean;
};

export default function GenericHookEvent({
	event,
	debug,
}: Props): React.ReactNode {
	const color = STATUS_COLORS[event.status];
	const symbol = STATUS_SYMBOLS[event.status];
	const payload = event.payload;

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
					<Text dimColor>{JSON.stringify(payload, null, 2)}</Text>
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
