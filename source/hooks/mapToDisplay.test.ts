import {describe, it, expect} from 'vitest';
import {mapToDisplay} from './mapToDisplay.js';
import type {RuntimeEvent} from '../runtime/types.js';

function makeRuntimeEvent(overrides?: Partial<RuntimeEvent>): RuntimeEvent {
	return {
		id: 'req-1',
		timestamp: 1000,
		hookName: 'PreToolUse',
		sessionId: 'sess-1',
		toolName: 'Bash',
		toolUseId: 'tu-1',
		context: {cwd: '/project', transcriptPath: '/tmp/t.jsonl'},
		interaction: {expectsDecision: true, canBlock: true},
		payload: {
			hook_event_name: 'PreToolUse',
			tool_name: 'Bash',
			tool_input: {},
		},
		...overrides,
	};
}

describe('mapToDisplay', () => {
	it('maps basic fields', () => {
		const display = mapToDisplay(makeRuntimeEvent());

		expect(display.id).toBe('req-1');
		expect(display.timestamp).toEqual(new Date(1000));
		expect(display.hookName).toBe('PreToolUse');
		expect(display.toolName).toBe('Bash');
		expect(display.toolUseId).toBe('tu-1');
		expect(display.status).toBe('pending');
	});

	it('passes payload through as-is', () => {
		const event = makeRuntimeEvent();
		const display = mapToDisplay(event);

		expect(display.payload).toBe(event.payload);
	});

	it('handles unknown hook names without error', () => {
		const display = mapToDisplay(makeRuntimeEvent({hookName: 'FutureEvent'}));
		expect(display.hookName).toBe('FutureEvent');
	});
});
