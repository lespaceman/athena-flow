/**
 * Renders SubagentStart (with optional merged SubagentStop) and orphan
 * SubagentStop events.
 *
 * Both variants share the same bordered-box visual treatment with diamond
 * symbols in magenta. Child events (tool calls within the subagent) are
 * rendered compactly inside the border box.
 */

import React from 'react';
import {Box, Text} from 'ink';
import {
	type HookEventDisplay,
	type SubagentStartEvent,
	type SubagentStopEvent,
	isSubagentStartEvent,
	isSubagentStopEvent,
	isPreToolUseEvent,
	isPermissionRequestEvent,
} from '../types/hooks/index.js';
import {parseToolName, formatInlineParams} from '../utils/toolNameParser.js';
import {
	STATUS_COLORS,
	STATUS_SYMBOLS,
	SUBAGENT_COLOR,
	SUBAGENT_SYMBOLS,
	formatElapsed,
	getPostToolText,
	ResponseBlock,
	StderrBlock,
} from './hookEventUtils.js';

type Props = {
	event: HookEventDisplay;
	childEventsByAgent?: Map<string, HookEventDisplay[]>;
};

/**
 * Compact renderer for a child tool call inside a subagent box.
 */
function ChildToolCallEvent({
	event,
}: {
	event: HookEventDisplay;
}): React.ReactNode {
	const color = STATUS_COLORS[event.status];
	const symbol = STATUS_SYMBOLS[event.status];
	const payload = event.payload;

	if (isPreToolUseEvent(payload) || isPermissionRequestEvent(payload)) {
		const parsed = parseToolName(payload.tool_name);
		const inlineParams = formatInlineParams(payload.tool_input);
		const postResponse = event.postToolPayload
			? getPostToolText(event.postToolPayload)
			: '';
		return (
			<Box flexDirection="column">
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

	// Fallback for other child event types
	return (
		<Box>
			<Text color={color}>{symbol} </Text>
			<Text color={color}>{event.hookName}</Text>
		</Box>
	);
}

/**
 * SubagentStart event, optionally merged with its SubagentStop.
 * Child events are rendered inside the bordered box.
 */
function SubagentStartDisplay({
	event,
	childEventsByAgent,
}: Props): React.ReactNode {
	const payload = event.payload as SubagentStartEvent;
	const subSymbol = SUBAGENT_SYMBOLS[event.status];
	const children = childEventsByAgent?.get(payload.agent_id) ?? [];
	const stopResponseText = event.transcriptSummary?.lastAssistantText
		? event.transcriptSummary.lastAssistantText
		: event.subagentStopPayload
			? 'completed'
			: '';
	const elapsed = event.subagentStopTimestamp
		? formatElapsed(event.timestamp, event.subagentStopTimestamp)
		: '';

	return (
		<Box flexDirection="column" marginBottom={1}>
			<Box
				borderStyle="round"
				borderColor={SUBAGENT_COLOR}
				flexDirection="column"
			>
				<Box>
					<Text color={SUBAGENT_COLOR}>{subSymbol} </Text>
					<Text color={SUBAGENT_COLOR} bold>
						Task({payload.agent_type})
					</Text>
					<Text dimColor>
						{' '}
						{payload.agent_id}
						{elapsed ? ` ${elapsed}` : ''}
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
								<ChildToolCallEvent event={child} />
							</Box>
						))}
					</Box>
				)}
				{stopResponseText ? (
					<ResponseBlock response={stopResponseText} isFailed={false} />
				) : null}
			</Box>
			<StderrBlock result={event.result} />
		</Box>
	);
}

/**
 * Orphan SubagentStop (no matching SubagentStart was found).
 */
function OrphanSubagentStopEvent({
	event,
}: {
	event: HookEventDisplay;
}): React.ReactNode {
	const payload = event.payload as SubagentStopEvent;
	const subSymbol = SUBAGENT_SYMBOLS[event.status];

	return (
		<Box flexDirection="column" marginBottom={1}>
			<Box
				borderStyle="round"
				borderColor={SUBAGENT_COLOR}
				flexDirection="column"
			>
				<Box>
					<Text color={SUBAGENT_COLOR}>{subSymbol} </Text>
					<Text color={SUBAGENT_COLOR} bold>
						Task({payload.agent_type})
					</Text>
					<Text dimColor> (completed)</Text>
				</Box>
			</Box>
			<StderrBlock result={event.result} />
		</Box>
	);
}

/**
 * Dispatcher: routes to SubagentStart or orphan SubagentStop rendering.
 */
export default function SubagentEvent({
	event,
	childEventsByAgent,
}: Props): React.ReactNode {
	if (isSubagentStartEvent(event.payload)) {
		return (
			<SubagentStartDisplay
				event={event}
				childEventsByAgent={childEventsByAgent}
			/>
		);
	}
	if (isSubagentStopEvent(event.payload)) {
		return <OrphanSubagentStopEvent event={event} />;
	}
	return null;
}
