/**
 * Renders a PreToolUse or PermissionRequest event.
 *
 * Shows the tool name and inline parameters. The tool response is now
 * rendered separately by ToolResultEvent (PostToolUse/PostToolUseFailure
 * are first-class timeline entries).
 *
 * Verbose mode appends the full input JSON below the summary.
 */

import React from 'react';
import {Box, Text} from 'ink';
import {
	type HookEventDisplay,
	isPreToolUseEvent,
	isPermissionRequestEvent,
} from '../types/hooks/index.js';
import {parseToolName, formatInlineParams} from '../utils/toolNameParser.js';
import {STATUS_COLORS, STATUS_SYMBOLS, StderrBlock} from './hookEventUtils.js';

type Props = {
	event: HookEventDisplay;
	verbose?: boolean;
};

export default function ToolCallEvent({
	event,
	verbose,
}: Props): React.ReactNode {
	const color = STATUS_COLORS[event.status];
	const symbol = STATUS_SYMBOLS[event.status];
	const payload = event.payload;

	if (!isPreToolUseEvent(payload) && !isPermissionRequestEvent(payload))
		return null;

	const parsed = parseToolName(payload.tool_name);
	const inlineParams = formatInlineParams(payload.tool_input);

	return (
		<Box flexDirection="column" marginBottom={1}>
			<Box>
				<Text color={color}>{symbol} </Text>
				<Text color={color} bold>
					{parsed.displayName}
				</Text>
				<Text dimColor>{inlineParams}</Text>
			</Box>
			{verbose && (
				<Box paddingLeft={3}>
					<Text dimColor>{JSON.stringify(payload.tool_input, null, 2)}</Text>
				</Box>
			)}
			<StderrBlock result={event.result} />
		</Box>
	);
}
