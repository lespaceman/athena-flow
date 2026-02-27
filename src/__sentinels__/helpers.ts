import type {RuntimeEvent, RuntimeDecision} from '../core/runtime/types';

let counter = 0;

export function resetCounter(): void {
	counter = 0;
}

export function makeEvent(
	hookName: string,
	overrides: Partial<RuntimeEvent> = {},
): RuntimeEvent {
	counter++;
	return {
		id: `rt-${counter}`,
		timestamp: Date.now() + counter,
		hookName,
		sessionId: 'claude-sess-1',
		context: {cwd: '/tmp', transcriptPath: '/tmp/t.jsonl'},
		interaction: {expectsDecision: hookName === 'PermissionRequest'},
		payload: {
			...(hookName === 'SessionStart'
				? {session_id: 'claude-sess-1', source: 'startup'}
				: {}),
			...(hookName === 'UserPromptSubmit' ? {prompt: 'test prompt'} : {}),
			...(hookName === 'PreToolUse' ||
			hookName === 'PostToolUse' ||
			hookName === 'PostToolUseFailure'
				? {
						tool_name: 'Bash',
						tool_use_id: `tu-${counter}`,
						tool_input: {command: 'echo hi'},
					}
				: {}),
			...(hookName === 'PermissionRequest'
				? {tool_name: 'Bash', tool_use_id: `tu-${counter}`}
				: {}),
			...(hookName === 'Stop' || hookName === 'SubagentStop'
				? {stop_reason: 'end_turn', last_assistant_message: 'Done.'}
				: {}),
		},
		...overrides,
	};
}

export function makeDecision(
	intent: RuntimeDecision['intent'],
	source: RuntimeDecision['source'] = 'user',
): RuntimeDecision {
	return {type: 'json', source, intent};
}
