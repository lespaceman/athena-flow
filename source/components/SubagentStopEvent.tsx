/**
 * Renders a SubagentStop event as a first-class timeline entry.
 *
 * Shows agent type, agent_id, completion status, and transcript summary
 * when available. Flat rendering (no border) to minimize dynamic region height.
 */

import React from 'react';
import {Box, Text} from 'ink';
import {
	type HookEventDisplay,
	isSubagentStopEvent,
} from '../types/hooks/index.js';
import {
	SUBAGENT_SYMBOLS,
	ResponseBlock,
	StderrBlock,
} from './hookEventUtils.js';
import {useTheme} from '../theme/index.js';

type Props = {
	event: HookEventDisplay;
	verbose?: boolean;
};

export default function SubagentStopEvent({
	event,
	verbose,
}: Props): React.ReactNode {
	const theme = useTheme();
	const payload = event.payload;
	if (!isSubagentStopEvent(payload)) return null;

	const subSymbol = SUBAGENT_SYMBOLS[event.status];

	const responseText = event.transcriptSummary?.lastAssistantText ?? '';

	return (
		<Box flexDirection="column" marginBottom={1}>
			<Box>
				<Text color={theme.accentSecondary}>{subSymbol} </Text>
				<Text color={theme.accentSecondary} bold>
					Task({payload.agent_type})
				</Text>
				<Text dimColor> {payload.agent_id} (completed)</Text>
			</Box>
			<ResponseBlock response={responseText} isFailed={false} />
			{verbose && payload.agent_transcript_path && (
				<Box paddingLeft={3}>
					<Text dimColor>transcript: {payload.agent_transcript_path}</Text>
				</Box>
			)}
			<StderrBlock result={event.result} />
		</Box>
	);
}
