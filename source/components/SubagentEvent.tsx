/**
 * Renders SubagentStart (with optional merged SubagentStop) and orphan
 * SubagentStop events.
 *
 * Both variants share the same bordered-box visual treatment with diamond
 * symbols in magenta.
 */

import React from 'react';
import {Box, Text} from 'ink';
import {
	type HookEventDisplay,
	type SubagentStartEvent,
	type SubagentStopEvent,
	isSubagentStartEvent,
	isSubagentStopEvent,
} from '../types/hooks/index.js';
import {
	SUBAGENT_COLOR,
	SUBAGENT_SYMBOLS,
	formatElapsed,
	ResponseBlock,
	StderrBlock,
} from './hookEventUtils.js';

type Props = {
	event: HookEventDisplay;
};

/**
 * SubagentStart event, optionally merged with its SubagentStop.
 */
function SubagentStartDisplay({event}: Props): React.ReactNode {
	const payload = event.payload as SubagentStartEvent;
	const subSymbol = SUBAGENT_SYMBOLS[event.status];
	const stopResponseText = event.subagentStopPayload
		? (event.subagentStopPayload.agent_transcript_path ?? 'completed')
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
function OrphanSubagentStopEvent({event}: Props): React.ReactNode {
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
export default function SubagentEvent({event}: Props): React.ReactNode {
	if (isSubagentStartEvent(event.payload)) {
		return <SubagentStartDisplay event={event} />;
	}
	if (isSubagentStopEvent(event.payload)) {
		return <OrphanSubagentStopEvent event={event} />;
	}
	return null;
}
