/**
 * Protocol envelope types for hook communication.
 *
 * These types define the wire protocol between hook-forwarder and the Ink CLI.
 */

import {type ClaudeHookEvent, type HookEventName} from './events.js';
import {type HookResultPayload} from './result.js';

/**
 * Envelope sent from forwarder to Ink CLI via UDS.
 */
export type HookEventEnvelope = {
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
	request_id: string;
	ts: number;
	payload: HookResultPayload;
};

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
