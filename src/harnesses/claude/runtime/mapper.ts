/**
 * Maps HookEventEnvelope (Claude wire protocol) → RuntimeEvent (UI boundary).
 *
 * This is the ONLY file that imports Claude event type guards.
 * All protocol-specific knowledge is encapsulated here.
 */

import type {HookEventEnvelope} from '../protocol/envelope';
import {
	isToolEvent,
	isSubagentStartEvent,
	isSubagentStopEvent,
} from '../protocol/events';
import type {RuntimeEvent} from '../../../core/runtime/types';
import {getInteractionHints} from './interactionRules';

export function mapEnvelopeToRuntimeEvent(
	envelope: HookEventEnvelope,
): RuntimeEvent {
	const payload = envelope.payload;

	// Ensure payload is always an object
	const safePayload =
		typeof payload === 'object' && payload !== null
			? payload
			: {value: payload};

	// Extract tool-related derived fields
	let toolName: string | undefined;
	let toolUseId: string | undefined;
	if (isToolEvent(payload)) {
		toolName = payload.tool_name;
		toolUseId = payload.tool_use_id;
	}

	// Extract subagent derived fields
	let agentId: string | undefined;
	let agentType: string | undefined;
	if (isSubagentStartEvent(payload)) {
		agentId = payload.agent_id;
		agentType = payload.agent_type;
	} else if (isSubagentStopEvent(payload)) {
		agentId = payload.agent_id;
		agentType = payload.agent_type;
	}

	// Build context from base fields (always present on all hook events)
	const context: RuntimeEvent['context'] = {
		cwd: ((payload as Record<string, unknown>).cwd as string | undefined) ?? '',
		transcriptPath:
			((payload as Record<string, unknown>).transcript_path as
				| string
				| undefined) ?? '',
		permissionMode: (payload as Record<string, unknown>).permission_mode as
			| string
			| undefined,
	};

	return {
		id: envelope.request_id,
		timestamp: envelope.ts,
		hookName: envelope.hook_event_name,
		sessionId: envelope.session_id,
		toolName,
		toolUseId,
		agentId,
		agentType,
		context,
		interaction: getInteractionHints(envelope.hook_event_name),
		payload: safePayload,
	};
}
