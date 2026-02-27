/**
 * Hook server types.
 *
 * Types for the hook server that receives events from hook-forwarder.
 */

import type {RuntimeEvent} from '../runtime/types';

export type PermissionDecision =
	| 'allow'
	| 'deny'
	| 'always-allow'
	| 'always-deny'
	| 'always-allow-server';

export type PermissionQueueItem = {
	request_id: string;
	ts: number;
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
	return {
		request_id: event.id,
		ts: event.timestamp,
		hookName: event.hookName,
		tool_name: event.toolName ?? (payload.tool_name as string) ?? 'Unknown',
		tool_input: (payload.tool_input as Record<string, unknown>) ?? {},
		tool_use_id: event.toolUseId ?? (payload.tool_use_id as string | undefined),
		suggestions: payload.permission_suggestions,
	};
}
