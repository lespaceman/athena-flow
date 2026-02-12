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
import {TASK_TOOL_NAMES} from '../types/todo.js';
import UnifiedToolCallEvent from './UnifiedToolCallEvent.js';
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
	// Skip noise events in non-verbose mode
	if (
		!verbose &&
		(event.hookName === 'SessionStart' || event.hookName === 'UserPromptSubmit')
	) {
		return null;
	}

	if (event.hookName === 'SessionEnd') {
		return <SessionEndEvent event={event} />;
	}

	const payload = event.payload;

	if (isPreToolUseEvent(payload) && payload.tool_name === 'AskUserQuestion') {
		return <AskUserQuestionEvent event={event} />;
	}

	// Task management tools (TodoWrite, TaskCreate, TaskUpdate, TaskList, TaskGet)
	// are excluded from the main timeline and aggregated into the sticky bottom
	// widget. When they appear as child events inside a subagent box, skip them
	// since they're internal state management.
	if (isPreToolUseEvent(payload) && TASK_TOOL_NAMES.has(payload.tool_name)) {
		return null;
	}

	if (isPreToolUseEvent(payload) || isPermissionRequestEvent(payload)) {
		return <UnifiedToolCallEvent event={event} verbose={verbose} />;
	}

	// Orphaned PostToolUse/PostToolUseFailure (no matching PreToolUse)
	if (isPostToolUseEvent(payload) || isPostToolUseFailureEvent(payload)) {
		return <UnifiedToolCallEvent event={event} verbose={verbose} />;
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
