import React from 'react';
import {Box, Text} from 'ink';
import {
	type HookEventDisplay,
	isPreToolUseEvent,
} from '../types/hooks/index.js';
import {useTheme} from '../theme/index.js';
import {getStatusColors} from './hookEventUtils.js';
import {truncateLine} from '../utils/truncate.js';

const BULLET = '\u25cf'; // ●

export default function TaskAgentEvent({
	event,
}: {
	event: HookEventDisplay;
}): React.ReactNode {
	const theme = useTheme();
	const statusColors = getStatusColors(theme);

	if (!isPreToolUseEvent(event.payload)) return null;

	const toolInput = event.payload.tool_input as Record<string, unknown>;
	const agentType =
		(toolInput.subagent_type as string) ??
		(toolInput.description as string) ??
		'Agent';
	const prompt =
		(toolInput.prompt as string) ?? (toolInput.description as string) ?? '';

	const terminalWidth = process.stdout.columns ?? 80;
	const bulletWidth = 2; // "● "
	const nameWidth = agentType.length;
	const availableForPrompt = terminalWidth - bulletWidth - nameWidth;
	const truncatedPrompt = prompt
		? truncateLine(` ${prompt}`, Math.max(availableForPrompt, 10))
		: '';

	return (
		<Box flexDirection="column" marginBottom={1}>
			<Box>
				<Text color={statusColors.passthrough}>{BULLET} </Text>
				<Text color={statusColors.passthrough} bold>
					{agentType}
				</Text>
				{truncatedPrompt ? <Text dimColor>{truncatedPrompt}</Text> : null}
			</Box>
		</Box>
	);
}
