import process from 'node:process';
import React from 'react';
import {Box, Text} from 'ink';
import {
	type HookEventDisplay,
	isSubagentStartEvent,
} from '../types/hooks/index.js';
import {useTheme} from '../theme/index.js';
import {truncateLine} from '../utils/truncate.js';

type Props = {
	event: HookEventDisplay;
};

export default function SubagentStartEvent({event}: Props): React.ReactNode {
	const theme = useTheme();
	if (!isSubagentStartEvent(event.payload)) return null;

	const terminalWidth = process.stdout.columns ?? 80;
	const label = `▸ ${event.payload.agent_type ?? 'Agent'}`;
	return (
		<Box marginTop={1}>
			<Text color={theme.accentSecondary}>
				{truncateLine(label, terminalWidth - 2)}
			</Text>
		</Box>
	);
}
