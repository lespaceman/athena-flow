/**
 * Unified tool call renderer: shows a PreToolUse/PermissionRequest event
 * with its PostToolUse/PostToolUseFailure result nested underneath.
 *
 * Also handles standalone (orphaned) PostToolUse/PostToolUseFailure events
 * that arrive without a matching PreToolUse anchor.
 */

import React from 'react';
import {Box, Text} from 'ink';
import {
	type HookEventDisplay,
	isPreToolUseEvent,
	isPermissionRequestEvent,
	isPostToolUseEvent,
	isPostToolUseFailureEvent,
} from '../types/hooks/index.js';
import {parseToolName, formatInlineParams} from '../utils/toolNameParser.js';
import {
	getStatusColors,
	RESPONSE_PREFIX,
	getPostToolText,
	formatResponseBlock,
	StderrBlock,
} from './hookEventUtils.js';
import {useTheme} from '../theme/index.js';

type Props = {
	event: HookEventDisplay;
	verbose?: boolean;
};

const BULLET = '\u25cf'; // ●

export default function UnifiedToolCallEvent({
	event,
	verbose,
}: Props): React.ReactNode {
	const theme = useTheme();
	const statusColors = getStatusColors(theme);
	const payload = event.payload;
	const postPayload = event.postToolEvent?.payload;

	// Determine if this is a standalone post-tool event (orphaned)
	const isStandalonePost =
		(isPostToolUseEvent(payload) || isPostToolUseFailureEvent(payload)) &&
		!isPreToolUseEvent(payload) &&
		!isPermissionRequestEvent(payload);

	// For standalone post events, use the event's own payload for tool info
	const toolPayload = isStandalonePost ? payload : payload;

	// Must be a tool event
	if (
		!isPreToolUseEvent(toolPayload) &&
		!isPermissionRequestEvent(toolPayload) &&
		!isPostToolUseEvent(toolPayload) &&
		!isPostToolUseFailureEvent(toolPayload)
	) {
		return null;
	}

	const parsed = parseToolName(toolPayload.tool_name);
	const inlineParams = formatInlineParams(toolPayload.tool_input);

	// Determine state and colors
	let bulletColor: string;
	let responseNode: React.ReactNode = null;

	if (event.status === 'blocked') {
		// User rejected
		bulletColor = statusColors.blocked;
		responseNode = (
			<Box paddingLeft={2}>
				<Text color={statusColors.blocked}>{RESPONSE_PREFIX}User rejected</Text>
			</Box>
		);
	} else if (isStandalonePost) {
		// Orphaned post-tool event
		const isFailed = isPostToolUseFailureEvent(payload);
		bulletColor = isFailed ? statusColors.blocked : statusColors.passthrough;
		const responseText = getPostToolText(
			payload as Parameters<typeof getPostToolText>[0],
		);
		responseNode = renderResponse(responseText, isFailed, statusColors.blocked);
	} else if (postPayload) {
		// Has a matched post-tool result
		const isFailed = isPostToolUseFailureEvent(postPayload);
		bulletColor = isFailed ? statusColors.blocked : statusColors.passthrough;
		const responseText = getPostToolText(
			postPayload as Parameters<typeof getPostToolText>[0],
		);
		responseNode = renderResponse(responseText, isFailed, statusColors.blocked);
	} else {
		// Pending — no result yet
		bulletColor = statusColors.pending;
		responseNode = (
			<Box paddingLeft={2}>
				<Text dimColor>{'\u2514 Running\u2026'}</Text>
			</Box>
		);
	}

	return (
		<Box flexDirection="column" marginBottom={1}>
			<Box>
				<Text color={bulletColor}>{BULLET} </Text>
				<Text color={bulletColor} bold>
					{parsed.displayName}
				</Text>
				<Text dimColor>{inlineParams}</Text>
			</Box>
			{verbose && (
				<Box paddingLeft={3}>
					<Text dimColor>
						{JSON.stringify(toolPayload.tool_input, null, 2)}
					</Text>
				</Box>
			)}
			{responseNode}
			{verbose && postPayload && renderVerboseResponse(postPayload)}
			<StderrBlock result={event.result} />
			{event.postToolEvent && (
				<StderrBlock result={event.postToolEvent.result} />
			)}
		</Box>
	);
}

function renderResponse(
	responseText: string,
	isFailed: boolean,
	errorColor: string,
): React.ReactNode {
	if (isFailed) {
		return (
			<Box paddingLeft={2}>
				<Text color={errorColor}>
					{formatResponseBlock(responseText || 'Unknown error')}
				</Text>
			</Box>
		);
	}

	const displayText = responseText || '(no output)';
	return (
		<Box paddingLeft={2}>
			<Text dimColor>{formatResponseBlock(displayText)}</Text>
		</Box>
	);
}

function renderVerboseResponse(
	postPayload: HookEventDisplay['payload'],
): React.ReactNode {
	if (
		!isPostToolUseEvent(postPayload) &&
		!isPostToolUseFailureEvent(postPayload)
	) {
		return null;
	}
	const responseText = getPostToolText(postPayload);
	if (!responseText) return null;
	return (
		<Box paddingLeft={3}>
			<Text dimColor>{responseText}</Text>
		</Box>
	);
}
