/**
 * Protocol envelope types for hook communication.
 *
 * These types define the wire protocol between hook-forwarder and the Ink CLI.
 */

import {type ClaudeHookEvent, type HookEventName} from './events.js';
import {type HookResultPayload} from './result.js';

// Protocol version for hook communication
export const PROTOCOL_VERSION = 1;

/**
 * Envelope sent from forwarder to Ink CLI via UDS.
 */
export type HookEventEnvelope = {
	v: number;
	kind: 'hook_event';
	request_id: string;
	ts: number;
	session_id: string;
	hook_event_name: HookEventName;
	payload: ClaudeHookEvent;
};

/**
 * Envelope sent from Ink CLI back to forwarder via UDS.
 */
export type HookResultEnvelope = {
	v: number;
	kind: 'hook_result';
	request_id: string;
	ts: number;
	payload: HookResultPayload;
};

/**
 * Known hook event names (documentation reference).
 *
 * NOTE: Validation no longer rejects unknown event names for forward
 * compatibility. Unknown events are auto-passthroughed by the server.
 * This set is kept for documentation and for handlers that want to
 * check if an event is one they explicitly support.
 *
 * Complete list of Claude Code hooks:
 * - SessionStart: Session begins or resumes
 * - UserPromptSubmit: User submits a prompt
 * - PreToolUse: Before tool execution
 * - PermissionRequest: When permission dialog appears
 * - PostToolUse: After tool succeeds
 * - PostToolUseFailure: After tool fails
 * - SubagentStart: When spawning a subagent
 * - SubagentStop: When subagent finishes
 * - Stop: Claude finishes responding
 * - PreCompact: Before context compaction
 * - SessionEnd: Session terminates
 * - Notification: Claude Code sends notifications
 * - Setup: When invoked with --init, --init-only, or --maintenance flags
 */
export const VALID_HOOK_EVENT_NAMES = new Set<string>([
	'SessionStart',
	'UserPromptSubmit',
	'PreToolUse',
	'PermissionRequest',
	'PostToolUse',
	'PostToolUseFailure',
	'SubagentStart',
	'SubagentStop',
	'Stop',
	'PreCompact',
	'SessionEnd',
	'Notification',
	'Setup',
]);

/**
 * Type guard to validate HookEventEnvelope structure.
 */
export function isValidHookEventEnvelope(
	obj: unknown,
): obj is HookEventEnvelope {
	if (typeof obj !== 'object' || obj === null) {
		return false;
	}

	const envelope = obj as Record<string, unknown>;

	return (
		typeof envelope['v'] === 'number' &&
		envelope['v'] >= 1 && // Accept current and future protocol versions
		envelope['kind'] === 'hook_event' &&
		typeof envelope['request_id'] === 'string' &&
		envelope['request_id'].length > 0 &&
		typeof envelope['ts'] === 'number' &&
		typeof envelope['session_id'] === 'string' &&
		typeof envelope['hook_event_name'] === 'string' &&
		envelope['hook_event_name'].length > 0 && // Accept unknown event names for forward compatibility
		typeof envelope['payload'] === 'object' &&
		envelope['payload'] !== null
	);
}

/**
 * Helper to generate unique IDs for requests.
 */
export function generateId(): string {
	return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
