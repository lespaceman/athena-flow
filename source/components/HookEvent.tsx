import React from 'react';
import type {HookEventDisplay} from '../types/hooks/display.js';
import SessionEndEvent from './SessionEndEvent.js';
import AskUserQuestionEvent from './AskUserQuestionEvent.js';
import {TASK_TOOL_NAMES} from '../types/todo.js';
import UnifiedToolCallEvent from './UnifiedToolCallEvent.js';
import TaskAgentEvent from './TaskAgentEvent.js';
import SubagentStartEvent from './SubagentStartEvent.js';
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

	if (event.hookName === 'PreToolUse' && event.toolName === 'AskUserQuestion') {
		return <AskUserQuestionEvent event={event} />;
	}

	if (
		event.hookName === 'PreToolUse' &&
		TASK_TOOL_NAMES.has(event.toolName ?? '')
	) {
		return null;
	}

	let content: React.ReactNode = null;

	if (event.hookName === 'PreToolUse' && event.toolName === 'Task') {
		content = <TaskAgentEvent event={event} />;
	} else if (
		event.hookName === 'PreToolUse' ||
		event.hookName === 'PermissionRequest'
	) {
		content = <UnifiedToolCallEvent event={event} verbose={verbose} />;
	} else if (
		(event.hookName === 'PostToolUse' ||
			event.hookName === 'PostToolUseFailure') &&
		event.toolName === 'Task'
	) {
		content = <SubagentResultEvent event={event} verbose={verbose} />;
	} else if (
		event.hookName === 'PostToolUse' ||
		event.hookName === 'PostToolUseFailure'
	) {
		content = <PostToolResult event={event} verbose={verbose} />;
	} else if (event.hookName === 'SubagentStart') {
		content = <SubagentStartEvent event={event} />;
	} else {
		content = <GenericHookEvent event={event} verbose={verbose} />;
	}

	if (content == null) return null;

	return content;
}
