import {describe, it, expect} from 'vitest';
import {mapDecisionToResult} from '../decisionMapper.js';
import type {RuntimeEvent, RuntimeDecision} from '../../../types.js';

function makeEvent(hookName: string, extra?: Partial<RuntimeEvent>): RuntimeEvent {
	return {
		id: 'req-1',
		timestamp: 1000,
		hookName,
		sessionId: 'sess-1',
		context: {cwd: '/project', transcriptPath: '/tmp/t.jsonl'},
		interaction: {expectsDecision: true, canBlock: true},
		payload: {hook_event_name: hookName, tool_name: 'Bash', tool_input: {}},
		...extra,
	};
}

describe('mapDecisionToResult', () => {
	it('maps passthrough to exit 0 with no output', () => {
		const result = mapDecisionToResult(
			makeEvent('PreToolUse'),
			{type: 'passthrough', source: 'timeout'},
		);
		expect(result.action).toBe('passthrough');
		expect(result.stdout_json).toBeUndefined();
		expect(result.stderr).toBeUndefined();
	});

	it('maps block to block_with_stderr', () => {
		const result = mapDecisionToResult(
			makeEvent('PreToolUse'),
			{type: 'block', source: 'user', reason: 'Blocked by user'},
		);
		expect(result.action).toBe('block_with_stderr');
		expect(result.stderr).toBe('Blocked by user');
	});

	it('maps permission_allow intent for PermissionRequest', () => {
		const result = mapDecisionToResult(
			makeEvent('PermissionRequest'),
			{type: 'json', source: 'user', intent: {kind: 'permission_allow'}},
		);
		expect(result.action).toBe('json_output');
		expect(result.stdout_json).toEqual({
			hookSpecificOutput: {
				hookEventName: 'PermissionRequest',
				decision: {behavior: 'allow'},
			},
		});
	});

	it('maps permission_deny intent for PermissionRequest', () => {
		const result = mapDecisionToResult(
			makeEvent('PermissionRequest'),
			{type: 'json', source: 'rule', intent: {kind: 'permission_deny', reason: 'Denied by rule'}},
		);
		expect(result.action).toBe('json_output');
		const output = result.stdout_json as Record<string, unknown>;
		const hso = output.hookSpecificOutput as Record<string, unknown>;
		const decision = hso.decision as Record<string, unknown>;
		expect(decision.behavior).toBe('deny');
		expect(decision.reason).toBe('Denied by rule');
	});

	it('maps question_answer intent for PreToolUse AskUserQuestion', () => {
		const event = makeEvent('PreToolUse');
		(event.payload as Record<string, unknown>).tool_name = 'AskUserQuestion';
		const result = mapDecisionToResult(
			event,
			{type: 'json', source: 'user', intent: {kind: 'question_answer', answers: {q1: 'a1'}}},
		);
		expect(result.action).toBe('json_output');
		const output = result.stdout_json as Record<string, unknown>;
		const hso = output.hookSpecificOutput as Record<string, unknown>;
		expect(hso.permissionDecision).toBe('allow');
		expect(hso.updatedInput).toEqual({answers: {q1: 'a1'}});
	});

	it('maps pre_tool_allow intent', () => {
		const result = mapDecisionToResult(
			makeEvent('PreToolUse'),
			{type: 'json', source: 'user', intent: {kind: 'pre_tool_allow'}},
		);
		expect(result.action).toBe('json_output');
		const output = result.stdout_json as Record<string, unknown>;
		const hso = output.hookSpecificOutput as Record<string, unknown>;
		expect(hso.permissionDecision).toBe('allow');
	});

	it('maps pre_tool_deny intent', () => {
		const result = mapDecisionToResult(
			makeEvent('PreToolUse'),
			{type: 'json', source: 'user', intent: {kind: 'pre_tool_deny', reason: 'No'}},
		);
		expect(result.action).toBe('json_output');
		const output = result.stdout_json as Record<string, unknown>;
		const hso = output.hookSpecificOutput as Record<string, unknown>;
		expect(hso.permissionDecision).toBe('deny');
		expect(hso.permissionDecisionReason).toBe('No');
	});
});
