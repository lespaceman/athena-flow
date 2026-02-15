import React from 'react';
import {Box, Text} from 'ink';
import {
	type HookEventDisplay,
	isPreToolUseEvent,
} from '../types/hooks/index.js';
import {useTheme} from '../theme/index.js';
import {useSpinner} from '../hooks/useSpinner.js';
import {truncateLine} from '../utils/truncate.js';
import ToolResultContainer from './ToolOutput/ToolResultContainer.js';

const BULLET = '\u25cf'; // ●

export default function TaskAgentEvent({
	event,
}: {
	event: HookEventDisplay;
}): React.ReactNode {
	const theme = useTheme();
	const isPending = !event.postToolEvent;
	const spinnerFrame = useSpinner(isPending);

	if (!isPreToolUseEvent(event.payload)) return null;

	const toolInput = event.payload.tool_input as Record<string, unknown>;
	const agentType =
		(toolInput.subagent_type as string) ??
		(toolInput.description as string) ??
		'Agent';
	const prompt = (toolInput.prompt as string) ?? '';
	const description = (toolInput.description as string) ?? '';

	const terminalWidth = process.stdout.columns ?? 80;
	const headerIcon = isPending ? spinnerFrame : BULLET;
	const headerText = truncateLine(agentType, terminalWidth - 4);
	const bodyText = prompt || description;

	let body: React.ReactNode = null;
	if (isPending && !bodyText) {
		body = (
			<ToolResultContainer>
				<Text dimColor>Running…</Text>
			</ToolResultContainer>
		);
	} else if (bodyText) {
		body = (
			<ToolResultContainer>
				<Text>{truncateLine(bodyText, terminalWidth - 10)}</Text>
			</ToolResultContainer>
		);
	}

	return (
		<Box flexDirection="column">
			<Box>
				<Text color={theme.accentSecondary} bold>
					{headerIcon} {headerText}
				</Text>
			</Box>
			{body}
		</Box>
	);
}
