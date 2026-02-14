import React from 'react';
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
import {truncateLine} from '../utils/truncate.js';
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
	/** When true, adds left indentation to indicate this is a subagent child event. */
	isNested?: boolean;
};

const BULLET = '\u25cf'; // ●

function isPostPayload(
	p: unknown,
): p is PostToolUseEvent | PostToolUseFailureEvent {
	return (
		isPostToolUseEvent(p as PostToolUseEvent) ||
		isPostToolUseFailureEvent(p as PostToolUseFailureEvent)
	);
}

/**
 * Resolve the post-tool payload from either a standalone orphaned event
 * or from the paired postToolEvent merged by useContentOrdering.
 */
function resolvePostPayload(
	event: HookEventDisplay,
): (PostToolUseEvent | PostToolUseFailureEvent) | null {
	if (isPostPayload(event.payload)) return event.payload;
	if (event.postToolEvent && isPostPayload(event.postToolEvent.payload)) {
		return event.postToolEvent.payload;
	}
	return null;
}

export default function UnifiedToolCallEvent({
	event,
	verbose,
	isNested,
}: Props): React.ReactNode {
	const theme = useTheme();
	const statusColors = getStatusColors(theme);
	const payload = event.payload;

	const toolName = (payload as {tool_name: string}).tool_name;
	const toolInput = (payload as {tool_input: Record<string, unknown>})
		.tool_input;

	const isStandalonePost =
		!isPreToolUseEvent(payload) && !isPermissionRequestEvent(payload);

	const isPending =
		event.status === 'pending' ||
		(event.status !== 'blocked' &&
			!event.postToolEvent &&
			!isStandalonePost &&
			!!event.toolUseId);

	const parsed = parseToolName(toolName);
	const inlineParams = formatInlineParams(toolInput);

	const terminalWidth = process.stdout.columns ?? 80;
	const bulletWidth = 2; // "● "
	const nameWidth = parsed.displayName.length;
	const availableForParams = terminalWidth - bulletWidth - nameWidth;
	const truncatedParams = truncateLine(
		inlineParams,
		Math.max(availableForParams, 10),
	);

	const resolvedPost = resolvePostPayload(event);

	const isFailed = resolvedPost
		? isPostToolUseFailureEvent(resolvedPost)
		: false;

	let bulletColor: string;
	let responseNode: React.ReactNode = null;

	if (event.status === 'blocked') {
		bulletColor = statusColors.blocked;
		responseNode = (
			<ToolResultContainer gutterColor={statusColors.blocked} dimGutter={false}>
				<Text color={statusColors.blocked}>User rejected</Text>
			</ToolResultContainer>
		);
	} else if (isFailed) {
		bulletColor = statusColors.blocked;
		const errorText = getPostToolText(resolvedPost!) || 'Unknown error';
		responseNode = (
			<ToolResultContainer gutterColor={statusColors.blocked} dimGutter={false}>
				<Text color={statusColors.blocked}>{errorText}</Text>
			</ToolResultContainer>
		);
	} else if (resolvedPost) {
		bulletColor = statusColors.passthrough;
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
	} else if (isPending) {
		bulletColor = statusColors.pending;
		responseNode = (
			<ToolResultContainer>
				<Text dimColor>Running…</Text>
			</ToolResultContainer>
		);
	} else {
		bulletColor = statusColors.passthrough;
	}

	return (
		<Box flexDirection="column" marginBottom={1} paddingLeft={isNested ? 2 : 0}>
			<Box>
				<Text color={bulletColor} dimColor={isPending}>
					{BULLET}{' '}
				</Text>
				<Text color={bulletColor} bold>
					{parsed.displayName}
				</Text>
				<Text dimColor>{truncatedParams}</Text>
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
