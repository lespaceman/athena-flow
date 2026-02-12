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
	getPostToolText,
	StderrBlock,
} from './hookEventUtils.js';
import {ToolOutputRenderer, ToolResultContainer} from './ToolOutput/index.js';
import {useTheme} from '../theme/index.js';

type Props = {
	event: HookEventDisplay;
	verbose?: boolean;
};

const BULLET = '\u25cf'; // ●

/**
 * Resolve the post-tool payload from either a standalone orphaned event
 * or from the paired postToolEvent merged by useContentOrdering.
 */
function resolvePostPayload(
	event: HookEventDisplay,
): (PostToolUseEvent | PostToolUseFailureEvent) | null {
	const {payload, postToolEvent} = event;

	// Standalone: the event itself is a PostToolUse/PostToolUseFailure
	if (isPostToolUseEvent(payload) || isPostToolUseFailureEvent(payload)) {
		return payload;
	}

	// Paired: postToolEvent was merged by useContentOrdering
	if (
		postToolEvent &&
		(isPostToolUseEvent(postToolEvent.payload) ||
			isPostToolUseFailureEvent(postToolEvent.payload))
	) {
		return postToolEvent.payload;
	}

	return null;
}

export default function UnifiedToolCallEvent({
	event,
	verbose,
}: Props): React.ReactNode {
	const theme = useTheme();
	const statusColors = getStatusColors(theme);
	const payload = event.payload;

	// All tool events (Pre/Post/PermissionRequest) share tool_name and tool_input
	const toolName = (payload as {tool_name: string}).tool_name;
	const toolInput = (payload as {tool_input: Record<string, unknown>})
		.tool_input;

	const isStandalonePost =
		!isPreToolUseEvent(payload) && !isPermissionRequestEvent(payload);

	// Pending when awaiting a post-tool result.
	// Only show "Running…" if this event has a toolUseId (pairing is possible).
	// Without toolUseId, we can't pair with PostToolUse so fall back to status-based rendering.
	const isPending =
		event.status === 'pending' ||
		(event.status !== 'blocked' &&
			!event.postToolEvent &&
			!isStandalonePost &&
			!!event.toolUseId);

	const [pulse, setPulse] = useState(true);
	useEffect(() => {
		if (!isPending) return;
		const id = setInterval(() => setPulse(p => !p), 500);
		return () => clearInterval(id);
	}, [isPending]);

	const parsed = parseToolName(toolName);
	const inlineParams = formatInlineParams(toolInput);

	const resolvedPost = resolvePostPayload(event);

	// Determine bullet color and response content
	let bulletColor: string;
	let responseNode: React.ReactNode = null;

	if (event.status === 'blocked') {
		bulletColor = statusColors.blocked;
		responseNode = (
			<ToolResultContainer gutterColor={statusColors.blocked} dimGutter={false}>
				<Text color={statusColors.blocked}>User rejected</Text>
			</ToolResultContainer>
		);
	} else if (resolvedPost) {
		const isFailed = isPostToolUseFailureEvent(resolvedPost);
		bulletColor = isFailed ? statusColors.blocked : statusColors.passthrough;
		if (isFailed) {
			const errorText = getPostToolText(resolvedPost) || 'Unknown error';
			responseNode = (
				<ToolResultContainer
					gutterColor={statusColors.blocked}
					dimGutter={false}
				>
					<Text color={statusColors.blocked}>{errorText}</Text>
				</ToolResultContainer>
			);
		} else {
			responseNode = (
				<ToolResultContainer>
					{availableWidth => (
						<ToolOutputRenderer
							toolName={toolName}
							toolInput={toolInput}
							toolResponse={
								isPostToolUseEvent(resolvedPost)
									? resolvedPost.tool_response
									: undefined
							}
							availableWidth={availableWidth}
						/>
					)}
				</ToolResultContainer>
			);
		}
	} else if (isPending) {
		// Actively waiting for PostToolUse result
		bulletColor = statusColors.pending;
		responseNode = (
			<ToolResultContainer>
				<Text dimColor>Running…</Text>
			</ToolResultContainer>
		);
	} else {
		// Completed but no paired result (no toolUseId, or pairing unavailable)
		bulletColor = statusColors.passthrough;
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
					<Text dimColor>{JSON.stringify(toolInput, null, 2)}</Text>
				</Box>
			)}
			{responseNode}
			{verbose && resolvedPost && (
				<Box paddingLeft={3}>
					<Text dimColor>{getPostToolText(resolvedPost)}</Text>
				</Box>
			)}
			<StderrBlock result={event.result} />
			{event.postToolEvent && (
				<StderrBlock result={event.postToolEvent.result} />
			)}
		</Box>
	);
}
