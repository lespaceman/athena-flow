import type {RuntimeEvent} from '../../../core/runtime/types';

let counter = 0;

export function fillDefaults(partial: Partial<RuntimeEvent>): RuntimeEvent {
	counter++;
	return {
		id: partial.id ?? `mock-${counter}`,
		timestamp: partial.timestamp ?? Date.now(),
		hookName: partial.hookName ?? 'Notification',
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
			hook_event_name: partial.hookName ?? 'Notification',
		},
	};
}
