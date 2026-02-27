import type {RuntimeEvent} from '../../../core/runtime/types';
import {mapLegacyHookNameToRuntimeKind} from '../../../core/runtime/events';

let counter = 0;

export function fillDefaults(partial: Partial<RuntimeEvent>): RuntimeEvent {
	counter++;
	const hookName = partial.hookName ?? 'Notification';
	return {
		id: partial.id ?? `mock-${counter}`,
		timestamp: partial.timestamp ?? Date.now(),
		kind: partial.kind ?? mapLegacyHookNameToRuntimeKind(hookName),
		data: partial.data ?? {},
		hookName,
		sessionId: partial.sessionId ?? 'mock-session',
		toolName: partial.toolName,
		toolUseId: partial.toolUseId,
		agentId: partial.agentId,
		agentType: partial.agentType,
		context: partial.context ?? {
			cwd: '/mock',
			transcriptPath: '/mock/transcript.jsonl',
		},
		interaction: partial.interaction ?? {
			expectsDecision: false,
			canBlock: false,
		},
		payload: partial.payload ?? {
			hook_event_name: hookName,
		},
	};
}
