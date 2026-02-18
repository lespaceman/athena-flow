import React from 'react';
import {Box, Text} from 'ink';
import type {FeedEvent} from '../feed/types.js';
import {parseToolName, formatInlineParams} from '../utils/toolNameParser.js';
import {truncateLine} from '../utils/truncate.js';
import {getStatusColors} from './hookEventUtils.js';
import {useTheme} from '../theme/index.js';

type Props = {
	event: FeedEvent;
	verbose?: boolean;
	expanded?: boolean;
};

const BULLET = '\u25cf'; // ●
const MAX_EXPANDED_LINES = 40;

export default function UnifiedToolCallEvent({
	event,
	verbose,
	expanded,
}: Props): React.ReactNode {
	const theme = useTheme();
	const statusColors = getStatusColors(theme);

	if (event.kind !== 'tool.pre' && event.kind !== 'permission.request')
		return null;

	const toolName = event.data.tool_name;
	const toolInput = event.data.tool_input ?? {};

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

	const jsonStr = JSON.stringify(toolInput, null, 2);
	const allLines = jsonStr.split('\n');
	const jsonTruncated = allLines.length > MAX_EXPANDED_LINES;
	const displayLines = jsonTruncated
		? allLines.slice(0, MAX_EXPANDED_LINES)
		: allLines;
	const omitted = allLines.length - displayLines.length;

	const bulletColor = statusColors.passthrough;

	return (
		<Box flexDirection="column" marginTop={1}>
			<Box>
				<Text color={bulletColor}>{BULLET} </Text>
				<Text color={bulletColor} bold>
					{parsed.displayName}
				</Text>
				<Text dimColor>{truncatedParams}</Text>
			</Box>
			{(verbose || expanded) && (
				<Box paddingLeft={3} flexDirection="column">
					<Text dimColor>{displayLines.join('\n')}</Text>
					{jsonTruncated && <Text dimColor>({omitted} more lines)</Text>}
				</Box>
			)}
		</Box>
	);
}
