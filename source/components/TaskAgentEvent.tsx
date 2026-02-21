import React from 'react';
import {Box, Text} from 'ink';
import type {FeedEvent} from '../feed/types.js';
import {useTheme} from '../theme/index.js';
import {getStatusColors} from './hookEventUtils.js';
import {truncateLine} from '../utils/truncate.js';
import {ToolResultContainer} from './ToolOutput/index.js';
import MarkdownText from './ToolOutput/MarkdownText.js';
import {getGlyphs} from '../glyphs/index.js';

const BULLET = getGlyphs()['tool.bullet'];

export default function TaskAgentEvent({
	event,
}: {
	event: FeedEvent;
}): React.ReactNode {
	const theme = useTheme();
	const statusColors = getStatusColors(theme);

	if (event.kind !== 'tool.pre') return null;

	const toolInput = event.data.tool_input ?? {};
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
