import process from 'node:process';
import React from 'react';
import {Box, Text} from 'ink';
import type {HookEventDisplay} from '../types/hooks/display.js';
import {useTheme} from '../theme/index.js';
import {truncateLine} from '../utils/truncate.js';

type Props = {
	event: HookEventDisplay;
};

export default function SubagentStartEvent({event}: Props): React.ReactNode {
	const theme = useTheme();
	if (event.hookName !== 'SubagentStart') return null;

	const payload = event.payload as Record<string, unknown>;
	const terminalWidth = process.stdout.columns ?? 80;
	const label = `▸ ${(payload.agent_type as string) ?? 'Agent'}`;
	return (
		<Box marginTop={1}>
			<Text color={theme.accentSecondary}>
				{truncateLine(label, terminalWidth - 2)}
			</Text>
		</Box>
	);
}
