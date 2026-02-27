/**
 * Renders non-tool events (Notification, Stop, SessionStart, etc.)
 * and serves as the debug-mode fallback for any event type.
 */

import React from 'react';
import {Box, Text} from 'ink';
import type {FeedEvent} from '../../feed/types';
import {
	getStatusColors,
	STATUS_SYMBOLS,
	truncateStr,
} from './hookEventUtils';
import {useTheme} from '../theme/index';

type Props = {
	event: FeedEvent;
	verbose?: boolean;
};

export default function GenericHookEvent({
	event,
	verbose,
}: Props): React.ReactNode {
	const theme = useTheme();
	const statusColors = getStatusColors(theme);
	const color = statusColors.passthrough;
	const symbol = STATUS_SYMBOLS.passthrough;

	const time = new Date(event.ts).toLocaleTimeString('en-US', {
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
				<Text color={color}>{event.kind}</Text>
			</Box>
			{verbose ? (
				<Box>
					<Text dimColor>{JSON.stringify(event.data, null, 2)}</Text>
				</Box>
			) : (
				event.kind === 'notification' &&
				'message' in event.data &&
				typeof event.data.message === 'string' && (
					<Box paddingLeft={2}>
						<Text dimColor>{truncateStr(event.data.message, 200)}</Text>
					</Box>
				)
			)}
		</Box>
	);
}
