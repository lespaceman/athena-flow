/**
 * Renders a PreToolUse or PermissionRequest event with optional merged
 * PostToolUse response.
 *
 * Shows the tool name, inline parameters, and (if available) the tool
 * response or error from the merged PostToolUse/PostToolUseFailure.
 */

import React from 'react';
import {Box, Text} from 'ink';
import {
	type HookEventDisplay,
	isPreToolUseEvent,
	isPermissionRequestEvent,
} from '../types/hooks/index.js';
import {parseToolName, formatInlineParams} from '../utils/toolNameParser.js';
import {
	STATUS_COLORS,
	STATUS_SYMBOLS,
	getPostToolText,
	ResponseBlock,
	StderrBlock,
} from './hookEventUtils.js';

type Props = {
	event: HookEventDisplay;
};

export default function ToolCallEvent({event}: Props): React.ReactNode {
	const color = STATUS_COLORS[event.status];
	const symbol = STATUS_SYMBOLS[event.status];
	const payload = event.payload;

	if (!isPreToolUseEvent(payload) && !isPermissionRequestEvent(payload))
		return null;

	const parsed = parseToolName(payload.tool_name);
	const inlineParams = formatInlineParams(payload.tool_input);
	const postResponse = event.postToolPayload
		? getPostToolText(event.postToolPayload)
		: '';

	return (
		<Box flexDirection="column" marginBottom={1}>
			<Box>
				<Text color={color}>{symbol} </Text>
				<Text color={color} bold>
					{parsed.displayName}
				</Text>
				<Text dimColor>{inlineParams}</Text>
			</Box>
			<ResponseBlock
				response={postResponse}
				isFailed={event.postToolFailed ?? false}
			/>
			<StderrBlock result={event.result} />
		</Box>
	);
}
