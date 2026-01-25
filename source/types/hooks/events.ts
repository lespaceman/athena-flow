/**
 * Discriminated union types for Claude Code hook events.
 *
 * These types provide proper type safety through discriminated unions,
 * allowing TypeScript to narrow types based on hook_event_name.
 */

// Base fields present in all hook events
type BaseHookEvent = {
	session_id: string;
	transcript_path: string;
	cwd: string;
};

// Tool-related fields for PreToolUse and PostToolUse
type ToolEventBase = BaseHookEvent & {
	tool_name: string;
	tool_input: Record<string, unknown>;
};

// PreToolUse: Before a tool is executed
export type PreToolUseEvent = ToolEventBase & {
	hook_event_name: 'PreToolUse';
};

// PostToolUse: After a tool is executed
export type PostToolUseEvent = ToolEventBase & {
	hook_event_name: 'PostToolUse';
	tool_response: unknown;
};

// Notification: Claude sends a notification
export type NotificationEvent = BaseHookEvent & {
	hook_event_name: 'Notification';
	title: string;
	message: string;
};

// Stop: Session stop event
export type StopEvent = BaseHookEvent & {
	hook_event_name: 'Stop';
	stop_reason: string;
	stop_ts: number;
	stop_hook_active: boolean;
};

// SubagentStop: Subagent stop event
export type SubagentStopEvent = BaseHookEvent & {
	hook_event_name: 'SubagentStop';
	stop_reason: string;
	stop_ts: number;
	stop_hook_active: boolean;
};

// UserPromptSubmit: User submits a prompt
export type UserPromptSubmitEvent = BaseHookEvent & {
	hook_event_name: 'UserPromptSubmit';
};

// SessionStart: Session begins
export type SessionStartEvent = BaseHookEvent & {
	hook_event_name: 'SessionStart';
	session_type: string;
};

// SessionEnd: Session ends
export type SessionEndEvent = BaseHookEvent & {
	hook_event_name: 'SessionEnd';
	session_type: string;
};

/**
 * Union of all hook event types.
 * TypeScript can narrow this type based on hook_event_name.
 */
export type ClaudeHookEvent =
	| PreToolUseEvent
	| PostToolUseEvent
	| NotificationEvent
	| StopEvent
	| SubagentStopEvent
	| UserPromptSubmitEvent
	| SessionStartEvent
	| SessionEndEvent;

/**
 * All valid hook event names.
 * Derived from the ClaudeHookEvent union type.
 */
export type HookEventName = ClaudeHookEvent['hook_event_name'];

// Type guards for each event type

export function isPreToolUseEvent(
	event: ClaudeHookEvent,
): event is PreToolUseEvent {
	return event.hook_event_name === 'PreToolUse';
}

export function isPostToolUseEvent(
	event: ClaudeHookEvent,
): event is PostToolUseEvent {
	return event.hook_event_name === 'PostToolUse';
}

export function isNotificationEvent(
	event: ClaudeHookEvent,
): event is NotificationEvent {
	return event.hook_event_name === 'Notification';
}

export function isStopEvent(event: ClaudeHookEvent): event is StopEvent {
	return event.hook_event_name === 'Stop';
}

export function isSubagentStopEvent(
	event: ClaudeHookEvent,
): event is SubagentStopEvent {
	return event.hook_event_name === 'SubagentStop';
}

export function isUserPromptSubmitEvent(
	event: ClaudeHookEvent,
): event is UserPromptSubmitEvent {
	return event.hook_event_name === 'UserPromptSubmit';
}

export function isSessionStartEvent(
	event: ClaudeHookEvent,
): event is SessionStartEvent {
	return event.hook_event_name === 'SessionStart';
}

export function isSessionEndEvent(
	event: ClaudeHookEvent,
): event is SessionEndEvent {
	return event.hook_event_name === 'SessionEnd';
}

/**
 * Check if an event is a tool-related event (PreToolUse or PostToolUse).
 */
export function isToolEvent(
	event: ClaudeHookEvent,
): event is PreToolUseEvent | PostToolUseEvent {
	return (
		event.hook_event_name === 'PreToolUse' ||
		event.hook_event_name === 'PostToolUse'
	);
}
