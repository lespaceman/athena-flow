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
import TaskList from './TaskList.js';
import {type TodoWriteInput} from '../types/todo.js';
import ToolCallEvent from './ToolCallEvent.js';
import ToolResultEvent from './ToolResultEvent.js';
import SubagentEvent from './SubagentEvent.js';
import SubagentStopEvent from './SubagentStopEvent.js';
import GenericHookEvent from './GenericHookEvent.js';

type Props = {
	event: HookEventDisplay;
	verbose?: boolean;
	childEventsByAgent?: Map<string, HookEventDisplay[]>;
};

export default function HookEvent({
	event,
	verbose,
	childEventsByAgent,
}: Props): React.ReactNode {
	if (event.hookName === 'SessionEnd') {
		return <SessionEndEvent event={event} />;
	}

	const payload = event.payload;

	if (isPreToolUseEvent(payload) && payload.tool_name === 'AskUserQuestion') {
		return <AskUserQuestionEvent event={event} />;
	}

	// TodoWrite events are excluded from the main timeline (useContentOrdering
	// renders the latest one as a sticky widget). This branch is reached when
	// a TodoWrite appears as a child event inside a subagent box.
	if (isPreToolUseEvent(payload) && payload.tool_name === 'TodoWrite') {
		const input = payload.tool_input as TodoWriteInput;
		const todos = Array.isArray(input.todos) ? input.todos : [];
		return <TaskList tasks={todos} />;
	}

	if (isPreToolUseEvent(payload) || isPermissionRequestEvent(payload)) {
		return <ToolCallEvent event={event} verbose={verbose} />;
	}

	if (isPostToolUseEvent(payload) || isPostToolUseFailureEvent(payload)) {
		return <ToolResultEvent event={event} verbose={verbose} />;
	}

	if (isSubagentStartEvent(payload)) {
		return (
			<SubagentEvent event={event} childEventsByAgent={childEventsByAgent} />
		);
	}

	if (isSubagentStopEvent(payload)) {
		return <SubagentStopEvent event={event} verbose={verbose} />;
	}

	// GenericHookEvent — only for truly unrecognized event types
	return <GenericHookEvent event={event} verbose={verbose} />;
}
