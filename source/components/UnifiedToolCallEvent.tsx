/**
 * Unified tool call renderer: shows a PreToolUse/PermissionRequest event
 * with its PostToolUse/PostToolUseFailure result nested underneath.
 *
 * Also handles standalone (orphaned) PostToolUse/PostToolUseFailure events
 * that arrive without a matching PreToolUse anchor.
 */

import React, {useState, useEffect} from 'react';
import {Box, Text} from 'ink';
import {
	type HookEventDisplay,
	type PostToolUseEvent,
	type PostToolUseFailureEvent,
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

	// Guard: must be a tool event
	if (
		!isPreToolUseEvent(payload) &&
		!isPermissionRequestEvent(payload) &&
		!isPostToolUseEvent(payload) &&
		!isPostToolUseFailureEvent(payload)
	) {
		return null;
	}

	// Standalone (orphaned) post-tool events have no matching PreToolUse anchor
	const isStandalonePost =
		!isPreToolUseEvent(payload) && !isPermissionRequestEvent(payload);

	// Pending when awaiting a post-tool result (not blocked, not standalone)
	const isPending =
		event.status === 'pending' ||
		(event.status !== 'blocked' && !event.postToolEvent && !isStandalonePost);

	const [pulse, setPulse] = useState(true);
	useEffect(() => {
		if (!isPending) return;
		const id = setInterval(() => setPulse(p => !p), 500);
		return () => clearInterval(id);
	}, [isPending]);

	const parsed = parseToolName(payload.tool_name);
	const inlineParams = formatInlineParams(payload.tool_input);

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
		// Orphaned post-tool event — payload is guaranteed to be a post-tool type
		const postEvent = payload as PostToolUseEvent | PostToolUseFailureEvent;
		const isFailed = isPostToolUseFailureEvent(postEvent);
		bulletColor = isFailed ? statusColors.blocked : statusColors.passthrough;
		responseNode = renderResponse(
			getPostToolText(postEvent),
			isFailed,
			statusColors.blocked,
		);
	} else if (postPayload) {
		// Has a matched post-tool result
		const postEvent = postPayload as PostToolUseEvent | PostToolUseFailureEvent;
		const isFailed = isPostToolUseFailureEvent(postEvent);
		bulletColor = isFailed ? statusColors.blocked : statusColors.passthrough;
		responseNode = renderResponse(
			getPostToolText(postEvent),
			isFailed,
			statusColors.blocked,
		);
	} else {
		// Pending — no result yet (pulsates between bright yellow and dim)
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
				<Text color={bulletColor} dimColor={isPending && !pulse}>
					{BULLET}{' '}
				</Text>
				<Text color={bulletColor} bold>
					{parsed.displayName}
				</Text>
				<Text dimColor>{inlineParams}</Text>
			</Box>
			{verbose && (
				<Box paddingLeft={3}>
					<Text dimColor>{JSON.stringify(payload.tool_input, null, 2)}</Text>
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
