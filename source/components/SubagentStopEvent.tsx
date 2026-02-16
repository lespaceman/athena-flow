import React from 'react';
import {Box, Text} from 'ink';
import {
	type HookEventDisplay,
	isSubagentStopEvent,
} from '../types/hooks/index.js';
import {useTheme} from '../theme/index.js';
import {truncateLine} from '../utils/truncate.js';

export default function SubagentStopEvent({
	event,
}: {
	event: HookEventDisplay;
}): React.ReactNode {
	const theme = useTheme();
	if (!isSubagentStopEvent(event.payload)) return null;

	const terminalWidth = process.stdout.columns ?? 80;
	const headerText = truncateLine(
		`${event.payload.agent_type} — Done`,
		terminalWidth - 4,
	);

	return (
		<Box marginTop={1}>
			<Text color={theme.accentSecondary} bold>
				● {headerText}
			</Text>
		</Box>
	);
}
