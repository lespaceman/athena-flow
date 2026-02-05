/**
 * Renders PostToolUse and PostToolUseFailure as first-class timeline entries.
 *
 * Normal mode: compact completion line (e.g. "✓ Bash completed").
 * Verbose mode: appends the full tool output payload.
 */

import React from 'react';
import {Box, Text} from 'ink';
import {
	type HookEventDisplay,
	isPostToolUseFailureEvent,
	isPostToolUseEvent,
} from '../types/hooks/index.js';
import {parseToolName} from '../utils/toolNameParser.js';
import {
	STATUS_COLORS,
	STATUS_SYMBOLS,
	getPostToolText,
	ResponseBlock,
	StderrBlock,
} from './hookEventUtils.js';

type Props = {
	event: HookEventDisplay;
	verbose?: boolean;
};

export default function ToolResultEvent({
	event,
	verbose,
}: Props): React.ReactNode {
	const color = STATUS_COLORS[event.status];
	const symbol = STATUS_SYMBOLS[event.status];
	const payload = event.payload;

	if (!isPostToolUseEvent(payload) && !isPostToolUseFailureEvent(payload)) {
		return null;
	}

	const parsed = parseToolName(payload.tool_name);
	const isFailed = isPostToolUseFailureEvent(payload);
	const responseText = getPostToolText(payload);

	return (
		<Box flexDirection="column" marginBottom={1}>
			<Box>
				<Text color={color}>{symbol} </Text>
				<Text color={color} bold>
					{parsed.displayName}
				</Text>
				<Text dimColor>{isFailed ? ' (failed)' : ' (response)'}</Text>
			</Box>
			{verbose && <ResponseBlock response={responseText} isFailed={isFailed} />}
			<StderrBlock result={event.result} />
		</Box>
	);
}
