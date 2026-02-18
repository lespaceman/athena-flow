import React from 'react';
import type {FeedEvent} from '../feed/types.js';
import SessionEndEvent from './SessionEndEvent.js';
import AskUserQuestionEvent from './AskUserQuestionEvent.js';
import {TASK_TOOL_NAMES} from '../types/todo.js';
import UnifiedToolCallEvent from './UnifiedToolCallEvent.js';
import TaskAgentEvent from './TaskAgentEvent.js';
import SubagentStartEvent from './SubagentStartEvent.js';
import SubagentStopEvent from './SubagentStopEvent.js';
import SubagentResultEvent from './SubagentResultEvent.js';
import AgentMessageEvent from './AgentMessageEvent.js';
import PostToolResult from './PostToolResult.js';
import GenericHookEvent from './GenericHookEvent.js';

type Props = {
	event: FeedEvent;
	verbose?: boolean;
	expanded?: boolean;
	parentWidth?: number;
};

export default function HookEvent({
	event,
	verbose,
	expanded,
	parentWidth,
}: Props): React.ReactNode {
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

	if (event.kind === 'tool.pre' && event.data.tool_name === 'Task') {
		return <TaskAgentEvent event={event} />;
	}

	if (event.kind === 'tool.pre' || event.kind === 'permission.request') {
		return (
			<UnifiedToolCallEvent
				event={event}
				verbose={verbose}
				expanded={expanded}
				parentWidth={parentWidth}
			/>
		);
	}

	if (
		(event.kind === 'tool.post' || event.kind === 'tool.failure') &&
		event.data.tool_name === 'Task'
	) {
		return <SubagentResultEvent event={event} verbose={verbose} />;
	}

	if (event.kind === 'tool.post' || event.kind === 'tool.failure') {
		return (
			<PostToolResult
				event={event}
				verbose={verbose}
				parentWidth={parentWidth}
			/>
		);
	}

	if (event.kind === 'subagent.start') {
		return <SubagentStartEvent event={event} />;
	}

	if (event.kind === 'subagent.stop') {
		return (
			<SubagentStopEvent
				event={event}
				expanded={expanded}
				parentWidth={parentWidth}
			/>
		);
	}

	if (event.kind === 'agent.message') {
		return (
			<AgentMessageEvent
				event={event}
				expanded={expanded}
				parentWidth={parentWidth}
			/>
		);
	}

	return <GenericHookEvent event={event} verbose={verbose} />;
}
