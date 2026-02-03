/**
 * Renders a standalone PostToolUse or PostToolUseFailure event that had
 * no matching PreToolUse to merge into.
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
} from './hookEventUtils.js';

type Props = {
	event: HookEventDisplay;
};

export default function OrphanPostToolUseEvent({
	event,
}: Props): React.ReactNode {
	const color = STATUS_COLORS[event.status];
	const symbol = STATUS_SYMBOLS[event.status];
	const payload = event.payload;

	if (!isPostToolUseEvent(payload) && !isPostToolUseFailureEvent(payload)) {
		return null;
	}

	const parsed = parseToolName(payload.tool_name);
	const isFailed = isPostToolUseFailureEvent(payload);

	return (
		<Box flexDirection="column" marginBottom={1}>
			<Box>
				<Text color={color}>{symbol} </Text>
				<Text color={color} bold>
					{parsed.displayName}
				</Text>
				<Text dimColor> (response)</Text>
			</Box>
			<ResponseBlock response={getPostToolText(payload)} isFailed={isFailed} />
		</Box>
	);
}
