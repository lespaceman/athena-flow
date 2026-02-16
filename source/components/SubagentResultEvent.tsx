import React from 'react';
import {Box, Text} from 'ink';
import {
	type HookEventDisplay,
	isPostToolUseEvent,
	isPostToolUseFailureEvent,
} from '../types/hooks/index.js';
import {useTheme} from '../theme/index.js';
import {truncateLine} from '../utils/truncate.js';
import PostToolResult from './PostToolResult.js';

type Props = {
	event: HookEventDisplay;
	verbose?: boolean;
};

/**
 * Combined rendering for PostToolUse(Task): "● AgentType — Done" header
 * followed by the tool result body. Keeps header and result as a single
 * Static item so they render together without gaps.
 */
export default function SubagentResultEvent({
	event,
	verbose,
}: Props): React.ReactNode {
	const theme = useTheme();
	const payload = event.payload;

	if (!isPostToolUseEvent(payload) && !isPostToolUseFailureEvent(payload)) {
		return null;
	}

	const agentType =
		typeof payload.tool_input?.['subagent_type'] === 'string'
			? payload.tool_input['subagent_type']
			: 'Agent';

	const terminalWidth = process.stdout.columns ?? 80;
	const headerText = truncateLine(`${agentType} — Done`, terminalWidth - 4);

	return (
		<Box flexDirection="column" marginTop={1}>
			<Box>
				<Text color={theme.accentSecondary} bold>
					● {headerText}
				</Text>
			</Box>
			<PostToolResult event={event} verbose={verbose} />
		</Box>
	);
}
