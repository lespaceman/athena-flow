import process from 'node:process';
import React from 'react';
import {Box, Text} from 'ink';
import type {FeedEvent} from '../../feed/types';
import {useTheme} from '../theme/index';
import {truncateLine} from '../../utils/truncate';

type Props = {
	event: FeedEvent;
};

export default function SubagentStartEvent({event}: Props): React.ReactNode {
	const theme = useTheme();
	if (event.kind !== 'subagent.start') return null;

	const terminalWidth = process.stdout.columns ?? 80;
	const label = `▸ ${event.data.agent_type ?? 'Agent'}`;
	return (
		<Box marginTop={1}>
			<Text color={theme.accentSecondary}>
				{truncateLine(label, terminalWidth - 2)}
			</Text>
		</Box>
	);
}
