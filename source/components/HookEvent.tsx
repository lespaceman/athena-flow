import React from 'react';
import {
	type HookEventDisplay,
	isPreToolUseEvent,
	isPostToolUseEvent,
	isPostToolUseFailureEvent,
	isPermissionRequestEvent,
	isSubagentStartEvent,
	isSubagentStopEvent,
} from '../types/hooks/index.js';
import SessionEndEvent from './SessionEndEvent.js';
import AskUserQuestionEvent from './AskUserQuestionEvent.js';
import TodoWriteEvent from './TodoWriteEvent.js';
import ToolCallEvent from './ToolCallEvent.js';
import SubagentEvent from './SubagentEvent.js';
import OrphanPostToolUseEvent from './OrphanPostToolUseEvent.js';
import GenericHookEvent from './GenericHookEvent.js';

type Props = {
	event: HookEventDisplay;
	debug?: boolean;
	childEventsByAgent?: Map<string, HookEventDisplay[]>;
};

export default function HookEvent({
	event,
	debug,
	childEventsByAgent,
}: Props): React.ReactNode {
	if (event.hookName === 'SessionEnd') {
		return <SessionEndEvent event={event} />;
	}

	const payload = event.payload;

	if (
		isPreToolUseEvent(payload) &&
		payload.tool_name === 'AskUserQuestion' &&
		!debug
	) {
		return <AskUserQuestionEvent event={event} />;
	}

	// TodoWrite events are excluded from the main timeline (useContentOrdering
	// renders the latest one as a sticky widget). This branch is reached when
	// a TodoWrite appears as a child event inside a subagent box.
	if (
		isPreToolUseEvent(payload) &&
		payload.tool_name === 'TodoWrite' &&
		!debug
	) {
		return <TodoWriteEvent event={event} />;
	}

	if (
		(isPreToolUseEvent(payload) || isPermissionRequestEvent(payload)) &&
		!debug
	) {
		return <ToolCallEvent event={event} />;
	}

	if (
		(isSubagentStartEvent(payload) || isSubagentStopEvent(payload)) &&
		!debug
	) {
		return (
			<SubagentEvent event={event} childEventsByAgent={childEventsByAgent} />
		);
	}

	if (
		(isPostToolUseEvent(payload) || isPostToolUseFailureEvent(payload)) &&
		!debug
	) {
		return <OrphanPostToolUseEvent event={event} />;
	}

	return <GenericHookEvent event={event} debug={debug} />;
}
