import React from 'react';
import {Box, Text} from 'ink';
import type {HookEventDisplay} from '../types/hooks/display.js';
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
	const payload = event.payload as Record<string, unknown>;

	if (
		event.hookName !== 'PostToolUse' &&
		event.hookName !== 'PostToolUseFailure'
	) {
		return null;
	}

	const toolInput = (payload.tool_input as Record<string, unknown>) ?? {};
	const agentType =
		typeof toolInput.subagent_type === 'string'
			? toolInput.subagent_type
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
