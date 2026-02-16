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
import TaskAgentEvent from './TaskAgentEvent.js';
import SubagentStartEvent from './SubagentStartEvent.js';
import SubagentStopEvent from './SubagentStopEvent.js';
import SubagentResultEvent from './SubagentResultEvent.js';
import PostToolResult from './PostToolResult.js';
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

	let content: React.ReactNode = null;

	// Task PreToolUse → agent start marker (shows subagent_type + prompt)
	if (isPreToolUseEvent(payload) && payload.tool_name === 'Task') {
		content = <TaskAgentEvent event={event} />;
	} else if (isPreToolUseEvent(payload) || isPermissionRequestEvent(payload)) {
		// PreToolUse/PermissionRequest → tool call header (● Tool params)
		content = <UnifiedToolCallEvent event={event} verbose={verbose} />;
	} else if (
		(isPostToolUseEvent(payload) || isPostToolUseFailureEvent(payload)) &&
		payload.tool_name === 'Task'
	) {
		// PostToolUse(Task) → "Done" header + result body (combined Static item)
		content = <SubagentResultEvent event={event} verbose={verbose} />;
	} else if (
		isPostToolUseEvent(payload) ||
		isPostToolUseFailureEvent(payload)
	) {
		// PostToolUse/PostToolUseFailure → standalone result (⎿ output)
		content = <PostToolResult event={event} verbose={verbose} />;
	} else if (isSubagentStartEvent(payload)) {
		content = <SubagentStartEvent event={event} />;
	} else if (isSubagentStopEvent(payload)) {
		content = <SubagentStopEvent event={event} />;
	} else {
		// GenericHookEvent — only for truly unrecognized event types
		content = <GenericHookEvent event={event} verbose={verbose} />;
	}

	if (content == null) return null;

	return content;
}
