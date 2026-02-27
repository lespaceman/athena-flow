/**
 * Hook server types.
 *
 * Types for the hook server that receives events from hook-forwarder.
 */

import type {RuntimeEvent} from '../runtime/types';
import type {RuntimeEventKind} from '../runtime/events';

export type PermissionDecision =
	| 'allow'
	| 'deny'
	| 'always-allow'
	| 'always-deny'
	| 'always-allow-server';

export type PermissionQueueItem = {
	request_id: string;
	ts: number;
	kind?: RuntimeEventKind;
	/** @deprecated Use `kind` */
	hookName: string;
	tool_name: string;
	tool_input: Record<string, unknown>;
	tool_use_id?: string;
	suggestions?: unknown;
};

export function extractPermissionSnapshot(
	event: RuntimeEvent,
): PermissionQueueItem {
	const payload = event.payload as Record<string, unknown>;
	const data = (event.data ?? {}) as Record<string, unknown>;
	const toolNameFromData =
		typeof data['tool_name'] === 'string' ? data['tool_name'] : undefined;
	const toolNameFromPayload =
		typeof payload['tool_name'] === 'string' ? payload['tool_name'] : undefined;
	const toolInputFromData =
		typeof data['tool_input'] === 'object' && data['tool_input'] !== null
			? (data['tool_input'] as Record<string, unknown>)
			: undefined;
	const toolInputFromPayload =
		typeof payload['tool_input'] === 'object' && payload['tool_input'] !== null
			? (payload['tool_input'] as Record<string, unknown>)
			: undefined;
	const toolUseIdFromData =
		typeof data['tool_use_id'] === 'string' ? data['tool_use_id'] : undefined;
	const toolUseIdFromPayload =
		typeof payload['tool_use_id'] === 'string'
			? payload['tool_use_id']
			: undefined;
	return {
		request_id: event.id,
		ts: event.timestamp,
		kind: event.kind,
		hookName: event.hookName,
		tool_name:
			event.toolName ?? toolNameFromData ?? toolNameFromPayload ?? 'Unknown',
		tool_input: toolInputFromData ?? toolInputFromPayload ?? {},
		tool_use_id: event.toolUseId ?? toolUseIdFromData ?? toolUseIdFromPayload,
		suggestions: data.permission_suggestions ?? payload.permission_suggestions,
	};
}
