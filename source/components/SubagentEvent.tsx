import React from 'react';
import {Box, Text} from 'ink';
import {
	type HookEventDisplay,
	isSubagentStartEvent,
} from '../types/hooks/index.js';
import {
	SUBAGENT_SYMBOLS,
	ResponseBlock,
	StderrBlock,
} from './hookEventUtils.js';
import {useTheme} from '../theme/index.js';

type Props = {
	event: HookEventDisplay;
};

export default function SubagentEvent({event}: Props): React.ReactNode {
	const theme = useTheme();
	if (!isSubagentStartEvent(event.payload)) return null;

	const payload = event.payload;
	const subSymbol = SUBAGENT_SYMBOLS[event.status];

	const isCompleted = Boolean(event.stopEvent);
	const responseText =
		event.stopEvent?.transcriptSummary?.lastAssistantText ?? '';

	return (
		<Box flexDirection="column" marginBottom={1}>
			<Box>
				<Text color={theme.accentSecondary}>{subSymbol} </Text>
				<Text color={theme.accentSecondary} bold>
					Task({payload.agent_type})
				</Text>
				{event.taskDescription ? (
					<Text dimColor> &quot;{event.taskDescription}&quot;</Text>
				) : (
					<Text dimColor> {payload.agent_id}</Text>
				)}
				{isCompleted && <Text dimColor> (completed)</Text>}
			</Box>
			{isCompleted && responseText && (
				<ResponseBlock response={responseText} isFailed={false} />
			)}
			<StderrBlock result={event.result} />
		</Box>
	);
}
