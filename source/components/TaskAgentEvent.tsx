import React from 'react';
import {Box, Text} from 'ink';
import {
	type HookEventDisplay,
	isPreToolUseEvent,
} from '../types/hooks/index.js';
import {useTheme} from '../theme/index.js';
import {getStatusColors} from './hookEventUtils.js';
import {truncateLine} from '../utils/truncate.js';
import {ToolResultContainer} from './ToolOutput/index.js';
import MarkdownText from './ToolOutput/MarkdownText.js';

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
	const description = (toolInput.description as string) ?? '';
	const prompt = (toolInput.prompt as string) ?? '';

	const terminalWidth = process.stdout.columns ?? 80;
	const bulletWidth = 2; // "● "
	const nameWidth = agentType.length;
	const availableForDesc = terminalWidth - bulletWidth - nameWidth;
	const truncatedDesc = description
		? truncateLine(`(${description})`, Math.max(availableForDesc, 10))
		: '';

	return (
		<Box flexDirection="column" marginTop={1}>
			<Box>
				<Text color={statusColors.passthrough}>{BULLET} </Text>
				<Text color={statusColors.passthrough} bold>
					{agentType}
				</Text>
				{truncatedDesc ? <Text dimColor>{truncatedDesc}</Text> : null}
			</Box>
			{prompt ? (
				<ToolResultContainer>
					{availableWidth => (
						<MarkdownText
							content={prompt}
							maxLines={10}
							availableWidth={availableWidth}
						/>
					)}
				</ToolResultContainer>
			) : null}
		</Box>
	);
}
