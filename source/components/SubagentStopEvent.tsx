import React from 'react';
import {Box, Text} from 'ink';
import {
	type HookEventDisplay,
	isSubagentStopEvent,
} from '../types/hooks/index.js';
import {useTheme} from '../theme/index.js';
import {truncateLine} from '../utils/truncate.js';
import ToolResultContainer from './ToolOutput/ToolResultContainer.js';
import MarkdownText from './ToolOutput/MarkdownText.js';

const DEFAULT_PREVIEW_LINES = 5;

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

	const responseText = event.transcriptSummary?.lastAssistantText;
	const isLoading =
		event.status !== 'pending' && event.transcriptSummary === undefined;

	let body: React.ReactNode = null;
	if (isLoading) {
		body = (
			<ToolResultContainer>
				<Text dimColor>Loading…</Text>
			</ToolResultContainer>
		);
	} else if (responseText) {
		const lines = responseText.split('\n');
		const totalLineCount = lines.length;
		const previewLines =
			totalLineCount > DEFAULT_PREVIEW_LINES
				? lines.slice(0, DEFAULT_PREVIEW_LINES)
				: undefined;

		body = (
			<ToolResultContainer
				previewLines={previewLines}
				totalLineCount={previewLines ? totalLineCount : undefined}
				toolId={event.id}
			>
				{availableWidth => (
					<MarkdownText
						content={responseText}
						availableWidth={availableWidth}
					/>
				)}
			</ToolResultContainer>
		);
	}

	return (
		<Box flexDirection="column">
			<Box>
				<Text color={theme.accentSecondary} bold>
					● {headerText}
				</Text>
			</Box>
			{body}
		</Box>
	);
}
