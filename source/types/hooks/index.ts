/**
 * Hook types barrel export.
 *
 * Re-exports all hook-related types from a single entry point.
 */

// Event types and type guards
export {
	type PreToolUseEvent,
	type PermissionRequestEvent,
	type PostToolUseEvent,
	type PostToolUseFailureEvent,
	type NotificationEvent,
	type StopEvent,
	type SubagentStartEvent,
	type SubagentStopEvent,
	type UserPromptSubmitEvent,
	type PreCompactEvent,
	type SetupEvent,
	type SessionStartEvent,
	type SessionEndEvent,
	type ClaudeHookEvent,
	type HookEventName,
	isPreToolUseEvent,
	isPermissionRequestEvent,
	isPostToolUseEvent,
	isPostToolUseFailureEvent,
	isNotificationEvent,
	isSubagentStartEvent,
	isSubagentStopEvent,
	isSessionStartEvent,
	isSessionEndEvent,
	isToolEvent,
} from './events.js';

// Protocol envelope types
export {
	type HookEventEnvelope,
	type HookResultEnvelope,
	isValidHookEventEnvelope,
	generateId,
} from './envelope.js';

// Result types and helpers
export {
	type HookAction,
	type HookResultPayload,
	type PreToolUseOutput,
	createPreToolUseAllowResult,
	createPreToolUseDenyResult,
	createAskUserQuestionResult,
	createPermissionRequestAllowResult,
	createPermissionRequestDenyResult,
} from './result.js';

// Display types
export {type HookEventStatus, type HookEventDisplay} from './display.js';
