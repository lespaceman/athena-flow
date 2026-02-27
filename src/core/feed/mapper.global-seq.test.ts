import {describe, it, expect} from 'vitest';
import {createFeedMapper} from './mapper';
import type {RuntimeEvent} from '../runtime/types';
import {mapLegacyHookNameToRuntimeKind} from '../runtime/events';

function makeRuntimeEvent(
	overrides: Partial<RuntimeEvent> & {hookName: string},
): RuntimeEvent {
	const kind =
		overrides.kind ?? mapLegacyHookNameToRuntimeKind(overrides.hookName);
	const payload =
		typeof overrides.payload === 'object' && overrides.payload !== null
			? (overrides.payload as Record<string, unknown>)
			: {};
	return {
		id: `evt-${Math.random().toString(36).slice(2)}`,
		timestamp: Date.now(),
		kind,
		data: overrides.data ?? payload,
		sessionId: 'test-session',
		context: {cwd: '/tmp', transcriptPath: '/tmp/transcript.json'},
		interaction: {expectsDecision: false},
		payload,
		...overrides,
	};
}

describe('global monotonic seq', () => {
	it('seq never resets across runs', () => {
		const mapper = createFeedMapper();
		const events1 = [
			mapper.mapEvent(
				makeRuntimeEvent({
					hookName: 'SessionStart',
					payload: {session_id: 'adapter-1'},
				}),
			),
			mapper.mapEvent(
				makeRuntimeEvent({
					hookName: 'UserPromptSubmit',
					payload: {prompt: 'hello'},
				}),
			),
			mapper.mapEvent(
				makeRuntimeEvent({
					hookName: 'PreToolUse',
					payload: {tool_name: 'Bash', tool_input: {command: 'ls'}},
				}),
			),
		].flat();
		const maxSeqRun1 = Math.max(...events1.map(e => e.seq));

		const events2 = [
			mapper.mapEvent(
				makeRuntimeEvent({
					hookName: 'UserPromptSubmit',
					payload: {prompt: 'world'},
				}),
			),
			mapper.mapEvent(
				makeRuntimeEvent({
					hookName: 'PreToolUse',
					payload: {
						tool_name: 'Read',
						tool_input: {file_path: '/tmp/x'},
					},
				}),
			),
		].flat();
		const minSeqRun2 = Math.min(...events2.map(e => e.seq));

		expect(minSeqRun2).toBeGreaterThan(maxSeqRun1);
	});

	it('all seq values within a session are unique', () => {
		const mapper = createFeedMapper();
		const allEvents = [
			mapper.mapEvent(
				makeRuntimeEvent({
					hookName: 'SessionStart',
					payload: {session_id: 'a-1'},
				}),
			),
			mapper.mapEvent(
				makeRuntimeEvent({
					hookName: 'UserPromptSubmit',
					payload: {prompt: 'p1'},
				}),
			),
			mapper.mapEvent(
				makeRuntimeEvent({
					hookName: 'Stop',
					payload: {stop_hook_active: true},
				}),
			),
			mapper.mapEvent(
				makeRuntimeEvent({
					hookName: 'UserPromptSubmit',
					payload: {prompt: 'p2'},
				}),
			),
			mapper.mapEvent(
				makeRuntimeEvent({
					hookName: 'PreToolUse',
					payload: {tool_name: 'Bash', tool_input: {command: 'pwd'}},
				}),
			),
		].flat();
		const seqs = allEvents.map(e => e.seq);
		expect(new Set(seqs).size).toBe(seqs.length);
	});
});
