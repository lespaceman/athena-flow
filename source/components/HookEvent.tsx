import React from 'react';
import type {FeedEvent} from '../feed/types.js';
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
	event: FeedEvent;
	verbose?: boolean;
};

export default function HookEvent({event, verbose}: Props): React.ReactNode {
	if (
		!verbose &&
		(event.kind === 'session.start' || event.kind === 'user.prompt')
	) {
		return null;
	}

	if (event.kind === 'session.end') {
		return <SessionEndEvent event={event} />;
	}

	if (event.kind === 'tool.pre' && event.data.tool_name === 'AskUserQuestion') {
		return <AskUserQuestionEvent event={event} />;
	}

	if (event.kind === 'tool.pre' && TASK_TOOL_NAMES.has(event.data.tool_name)) {
		return null;
	}

	let content: React.ReactNode = null;

	if (event.kind === 'tool.pre' && event.data.tool_name === 'Task') {
		content = <TaskAgentEvent event={event} />;
	} else if (event.kind === 'tool.pre' || event.kind === 'permission.request') {
		content = <UnifiedToolCallEvent event={event} verbose={verbose} />;
	} else if (
		(event.kind === 'tool.post' || event.kind === 'tool.failure') &&
		event.data.tool_name === 'Task'
	) {
		content = <SubagentResultEvent event={event} verbose={verbose} />;
	} else if (event.kind === 'tool.post' || event.kind === 'tool.failure') {
		content = <PostToolResult event={event} verbose={verbose} />;
	} else if (event.kind === 'subagent.start') {
		content = <SubagentStartEvent event={event} />;
	} else {
		content = <GenericHookEvent event={event} verbose={verbose} />;
	}

	if (content == null) return null;
	return content;
}
