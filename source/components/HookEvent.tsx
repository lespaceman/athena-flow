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
import ToolCallEvent from './ToolCallEvent.js';
import SubagentEvent from './SubagentEvent.js';
import OrphanPostToolUseEvent from './OrphanPostToolUseEvent.js';
import GenericHookEvent from './GenericHookEvent.js';

type Props = {
	event: HookEventDisplay;
	debug?: boolean;
};

export default function HookEvent({event, debug}: Props): React.ReactNode {
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
		return <SubagentEvent event={event} />;
	}

	if (
		(isPostToolUseEvent(payload) || isPostToolUseFailureEvent(payload)) &&
		!debug
	) {
		return <OrphanPostToolUseEvent event={event} />;
	}

	return <GenericHookEvent event={event} debug={debug} />;
}
