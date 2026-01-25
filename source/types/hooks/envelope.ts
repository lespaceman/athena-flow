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
 * Valid hook event names for validation.
 */
export const VALID_HOOK_EVENT_NAMES = new Set<string>([
	'PreToolUse',
	'PostToolUse',
	'Notification',
	'Stop',
	'SubagentStop',
	'UserPromptSubmit',
	'SessionStart',
	'SessionEnd',
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
		envelope['v'] === PROTOCOL_VERSION && // Validate version matches
		envelope['kind'] === 'hook_event' &&
		typeof envelope['request_id'] === 'string' &&
		envelope['request_id'].length > 0 &&
		typeof envelope['ts'] === 'number' &&
		typeof envelope['session_id'] === 'string' &&
		typeof envelope['hook_event_name'] === 'string' &&
		VALID_HOOK_EVENT_NAMES.has(envelope['hook_event_name']) &&
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
