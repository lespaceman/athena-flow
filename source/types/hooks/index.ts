/**
 * Hook types barrel export.
 *
 * Re-exports all hook-related types from a single entry point.
 */

// Event types and type guards
export {
	type PreToolUseEvent,
	type PostToolUseEvent,
	type NotificationEvent,
	type StopEvent,
	type SubagentStopEvent,
	type UserPromptSubmitEvent,
	type SessionStartEvent,
	type SessionEndEvent,
	type ClaudeHookEvent,
	type HookEventName,
	isPreToolUseEvent,
	isPostToolUseEvent,
	isNotificationEvent,
	isStopEvent,
	isSubagentStopEvent,
	isUserPromptSubmitEvent,
	isSessionStartEvent,
	isSessionEndEvent,
	isToolEvent,
} from './events.js';

// Protocol envelope types
export {
	PROTOCOL_VERSION,
	type HookEventEnvelope,
	type HookResultEnvelope,
	VALID_HOOK_EVENT_NAMES,
	isValidHookEventEnvelope,
	generateId,
} from './envelope.js';

// Result types and helpers
export {
	type HookAction,
	type HookResultPayload,
	type PreToolUseOutput,
	createPassthroughResult,
	createBlockResult,
	createJsonOutputResult,
	createPreToolUseDenyResult,
} from './result.js';

// Display types
export {type HookEventStatus, type HookEventDisplay} from './display.js';
