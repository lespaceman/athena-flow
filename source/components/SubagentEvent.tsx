import React from 'react';
import {Box, Text} from 'ink';
import {
	type HookEventDisplay,
	isSubagentStartEvent,
} from '../types/hooks/index.js';
import {useTheme} from '../theme/index.js';
import {useSpinner} from '../hooks/useSpinner.js';
import {truncateLine} from '../utils/truncate.js';
import {formatModelName} from '../utils/formatters.js';

function formatDuration(ms: number): string {
	const secs = Math.round(ms / 1000);
	return secs < 60 ? `${secs}s` : `${Math.floor(secs / 60)}m${secs % 60}s`;
}

export default function SubagentEvent({
	event,
}: {
	event: HookEventDisplay;
}): React.ReactNode {
	const theme = useTheme();
	if (!isSubagentStartEvent(event.payload)) return null;

	const payload = event.payload;
	const isCompleted = Boolean(event.stopEvent);
	const spinnerFrame = useSpinner(!isCompleted);
	const terminalWidth = process.stdout.columns ?? 80;

	// Line 1: ● AgentType(description) ModelName
	const description = event.taskDescription ? `(${event.taskDescription})` : '';
	const model = event.childMetrics?.model;
	const modelSuffix = model ? ` ${formatModelName(model)}` : '';
	const headerText = `${payload.agent_type}${description}${modelSuffix}`;
	const headerTruncated = truncateLine(headerText, terminalWidth - 4);

	// Line 2: └ Done/Running (N tool uses · Xs)
	const toolCount = event.childMetrics?.toolCount ?? 0;
	const duration = event.childMetrics?.duration ?? 0;
	const summaryParts: string[] = [];
	if (toolCount > 0) summaryParts.push(`${toolCount} tool uses`);
	if (duration > 0) summaryParts.push(formatDuration(duration));
	const summaryDetail =
		summaryParts.length > 0 ? ` (${summaryParts.join(' · ')})` : '';

	return (
		<Box flexDirection="column" marginBottom={1}>
			<Box>
				<Text color={theme.accentSecondary} bold>
					●{' '}
				</Text>
				<Text color={theme.accentSecondary} bold>
					{headerTruncated}
				</Text>
			</Box>
			<Box paddingLeft={2}>
				<Text dimColor>└ </Text>
				{isCompleted ? (
					<Text color={theme.status.success}>Done{summaryDetail}</Text>
				) : (
					<Text color={theme.status.info}>
						{spinnerFrame} Running{summaryDetail}
					</Text>
				)}
			</Box>
			<Box paddingLeft={2}>
				<Text dimColor>{'  '}(ctrl+o to expand)</Text>
			</Box>
		</Box>
	);
}
