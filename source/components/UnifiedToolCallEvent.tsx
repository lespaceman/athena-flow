import React from 'react';
import {Box, Text} from 'ink';
import {
	type HookEventDisplay,
	isPreToolUseEvent,
	isPermissionRequestEvent,
} from '../types/hooks/index.js';
import {parseToolName, formatInlineParams} from '../utils/toolNameParser.js';
import {truncateLine} from '../utils/truncate.js';
import {getStatusColors, StderrBlock} from './hookEventUtils.js';
import {ToolResultContainer} from './ToolOutput/index.js';
import {useTheme} from '../theme/index.js';

type Props = {
	event: HookEventDisplay;
	verbose?: boolean;
};

const BULLET = '\u25cf'; // ●

export default function UnifiedToolCallEvent({
	event,
	verbose,
}: Props): React.ReactNode {
	const theme = useTheme();
	const statusColors = getStatusColors(theme);
	const payload = event.payload;

	if (!isPreToolUseEvent(payload) && !isPermissionRequestEvent(payload))
		return null;

	const toolName = (payload as {tool_name: string}).tool_name;
	const toolInput = (payload as {tool_input: Record<string, unknown>})
		.tool_input;

	const parsed = parseToolName(toolName);
	const inlineParams = formatInlineParams(toolInput);

	const terminalWidth = process.stdout.columns ?? 80;
	const bulletWidth = 2; // "● "
	const nameWidth = parsed.displayName.length;
	const availableForParams = terminalWidth - bulletWidth - nameWidth;
	const truncatedParams = truncateLine(
		inlineParams,
		Math.max(availableForParams, 10),
	);

	const bulletColor =
		event.status === 'blocked'
			? statusColors.blocked
			: statusColors.passthrough;

	return (
		<Box flexDirection="column" marginTop={1}>
			<Box>
				<Text color={bulletColor}>{BULLET} </Text>
				<Text color={bulletColor} bold>
					{parsed.displayName}
				</Text>
				<Text dimColor>{truncatedParams}</Text>
			</Box>
			{verbose && (
				<Box paddingLeft={3}>
					<Text dimColor>{JSON.stringify(toolInput, null, 2)}</Text>
				</Box>
			)}
			{event.status === 'blocked' && (
				<ToolResultContainer
					gutterColor={statusColors.blocked}
					dimGutter={false}
				>
					<Text color={statusColors.blocked}>User rejected</Text>
				</ToolResultContainer>
			)}
			<StderrBlock result={event.result} />
		</Box>
	);
}
