import React from 'react';
import {
	type HookEventDisplay,
	isPreToolUseEvent,
	isPostToolUseEvent,
	isPostToolUseFailureEvent,
	isPermissionRequestEvent,
	isSubagentStopEvent,
} from '../types/hooks/index.js';
import SessionEndEvent from './SessionEndEvent.js';
import AskUserQuestionEvent from './AskUserQuestionEvent.js';
import {TASK_TOOL_NAMES} from '../types/todo.js';
import UnifiedToolCallEvent from './UnifiedToolCallEvent.js';
import TaskAgentEvent from './TaskAgentEvent.js';
import SubagentStopEvent from './SubagentStopEvent.js';
import GenericHookEvent from './GenericHookEvent.js';

type Props = {
	event: HookEventDisplay;
	verbose?: boolean;
};

export default function HookEvent({event, verbose}: Props): React.ReactNode {
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

	// Task PreToolUse → agent start marker (shows subagent_type + prompt)
	if (isPreToolUseEvent(payload) && payload.tool_name === 'Task') {
		return <TaskAgentEvent event={event} />;
	}

	// Unified tool call: PreToolUse/PermissionRequest (with paired post-tool result)
	// or orphaned PostToolUse/PostToolUseFailure (no matching PreToolUse)
	if (
		isPreToolUseEvent(payload) ||
		isPermissionRequestEvent(payload) ||
		isPostToolUseEvent(payload) ||
		isPostToolUseFailureEvent(payload)
	) {
		return (
			<UnifiedToolCallEvent
				event={event}
				verbose={verbose}
				isNested={Boolean(event.parentSubagentId)}
			/>
		);
	}

	if (isSubagentStopEvent(payload)) {
		return <SubagentStopEvent event={event} />;
	}

	// GenericHookEvent — only for truly unrecognized event types
	return <GenericHookEvent event={event} verbose={verbose} />;
}
