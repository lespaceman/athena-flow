/**
 * Renders a SubagentStart event with child events inside a bordered box.
 *
 * When the subagent completes, the corresponding SubagentStop event is merged
 * into event.stopEvent, allowing this single component to render both the
 * running state and the completed state with response text.
 */

import React from 'react';
import {Box, Text} from 'ink';
import {
	type HookEventDisplay,
	isSubagentStartEvent,
	isPreToolUseEvent,
	isPermissionRequestEvent,
	isPostToolUseEvent,
	isPostToolUseFailureEvent,
} from '../types/hooks/index.js';
import {parseToolName, formatInlineParams} from '../utils/toolNameParser.js';
import {
	getStatusColors,
	STATUS_SYMBOLS,
	SUBAGENT_SYMBOLS,
	getPostToolText,
	ResponseBlock,
	StderrBlock,
} from './hookEventUtils.js';
import {ToolOutputRenderer, ToolResultContainer} from './ToolOutput/index.js';
import {useTheme} from '../theme/index.js';

type Props = {
	event: HookEventDisplay;
	childEventsByAgent?: Map<string, HookEventDisplay[]>;
};

/**
 * Compact renderer for a child event inside a subagent box.
 */
function ChildEvent({event}: {event: HookEventDisplay}): React.ReactNode {
	const theme = useTheme();
	const statusColors = getStatusColors(theme);
	const color = statusColors[event.status];
	const symbol = STATUS_SYMBOLS[event.status];
	const payload = event.payload;

	if (isPreToolUseEvent(payload) || isPermissionRequestEvent(payload)) {
		const parsed = parseToolName(payload.tool_name);
		const inlineParams = formatInlineParams(payload.tool_input);
		return (
			<Box flexDirection="column">
				<Box>
					<Text color={color}>{symbol} </Text>
					<Text color={color} bold>
						{parsed.displayName}
					</Text>
					<Text dimColor>{inlineParams}</Text>
				</Box>
				<StderrBlock result={event.result} />
			</Box>
		);
	}

	if (isPostToolUseEvent(payload) || isPostToolUseFailureEvent(payload)) {
		const parsed = parseToolName(payload.tool_name);
		const isFailed = isPostToolUseFailureEvent(payload);
		return (
			<Box flexDirection="column">
				<Box>
					<Text color={color}>{symbol} </Text>
					<Text color={color} bold>
						{parsed.displayName}
					</Text>
					<Text dimColor>{isFailed ? ' (failed)' : ' (response)'}</Text>
				</Box>
				{isFailed ? (
					<ResponseBlock response={getPostToolText(payload)} isFailed={true} />
				) : (
					<ToolResultContainer>
						{(availableWidth) => (
							<ToolOutputRenderer
								toolName={payload.tool_name}
								toolInput={payload.tool_input}
								toolResponse={
									isPostToolUseEvent(payload)
										? payload.tool_response
										: undefined
								}
								availableWidth={availableWidth}
							/>
						)}
					</ToolResultContainer>
				)}
				<StderrBlock result={event.result} />
			</Box>
		);
	}

	// Fallback for other child event types
	return (
		<Box>
			<Text color={color}>{symbol} </Text>
			<Text color={color}>{event.hookName}</Text>
		</Box>
	);
}

export default function SubagentEvent({
	event,
	childEventsByAgent,
}: Props): React.ReactNode {
	const theme = useTheme();
	if (!isSubagentStartEvent(event.payload)) return null;

	// TypeScript narrows payload to SubagentStartEvent after the guard
	const payload = event.payload;
	const subSymbol = SUBAGENT_SYMBOLS[event.status];
	const children = childEventsByAgent?.get(payload.agent_id) ?? [];

	// Check if subagent has completed (stopEvent is merged from SubagentStop)
	const isCompleted = Boolean(event.stopEvent);
	const responseText =
		event.stopEvent?.transcriptSummary?.lastAssistantText ?? '';

	return (
		<Box flexDirection="column" marginBottom={1}>
			<Box
				borderStyle="round"
				borderColor={theme.accentSecondary}
				flexDirection="column"
			>
				<Box>
					<Text color={theme.accentSecondary}>{subSymbol} </Text>
					<Text color={theme.accentSecondary} bold>
						Task({payload.agent_type})
					</Text>
					<Text dimColor>
						{' '}
						{payload.agent_id}
						{isCompleted ? ' (completed)' : ''}
					</Text>
				</Box>
				{children.length > 0 && (
					<Box flexDirection="column" paddingLeft={1} marginTop={1}>
						{children.map((child, i) => (
							<Box
								key={child.id}
								flexDirection="column"
								marginTop={i > 0 ? 1 : 0}
							>
								<ChildEvent event={child} />
							</Box>
						))}
					</Box>
				)}
				{isCompleted && responseText && (
					<ResponseBlock response={responseText} isFailed={false} />
				)}
			</Box>
			<StderrBlock result={event.result} />
		</Box>
	);
}
