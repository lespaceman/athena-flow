/**
 * Renders non-tool events (Notification, Stop, SessionStart, etc.)
 * and serves as the debug-mode fallback for any event type.
 */

import React from 'react';
import {Box, Text} from 'ink';
import type {HookEventDisplay} from '../types/hooks/display.js';
import {
	getStatusColors,
	STATUS_SYMBOLS,
	truncateStr,
	StderrBlock,
} from './hookEventUtils.js';
import {useTheme} from '../theme/index.js';

type Props = {
	event: HookEventDisplay;
	verbose?: boolean;
};

export default function GenericHookEvent({
	event,
	verbose,
}: Props): React.ReactNode {
	const theme = useTheme();
	const statusColors = getStatusColors(theme);
	const color = statusColors[event.status];
	const symbol = STATUS_SYMBOLS[event.status];
	const payload = event.payload as Record<string, unknown>;

	const time = event.timestamp.toLocaleTimeString('en-US', {
		hour12: false,
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
	});

	return (
		<Box flexDirection="column" marginTop={1}>
			<Box>
				<Text color={color}>
					{symbol} [{time}]{' '}
				</Text>
				<Text color={color}>{event.hookName}</Text>
				{event.status !== 'pending' && (
					<Text color={theme.textMuted}> ({event.status})</Text>
				)}
			</Box>
			{verbose ? (
				<Box>
					<Text dimColor>{JSON.stringify(payload, null, 2)}</Text>
				</Box>
			) : (
				event.hookName === 'Notification' &&
				typeof payload.message === 'string' && (
					<Box paddingLeft={2}>
						<Text dimColor>{truncateStr(payload.message as string, 200)}</Text>
					</Box>
				)
			)}
			<StderrBlock result={event.result} />
		</Box>
	);
}
