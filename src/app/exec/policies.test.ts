import {describe, it, expect} from 'vitest';
import {
	isAskUserQuestionEvent,
	resolvePermissionPolicy,
	resolveQuestionPolicy,
} from './policies';
import type {RuntimeEvent} from '../../core/runtime/types';

function runtimeEvent(partial: Partial<RuntimeEvent>): RuntimeEvent {
	return {
		id: 'evt-1',
		timestamp: Date.now(),
		kind: 'permission.request',
		hookName: 'PermissionRequest',
		sessionId: 'sess-1',
		data: {},
		context: {cwd: '/tmp', transcriptPath: '/tmp/t.jsonl'},
		interaction: {expectsDecision: true},
		payload: {},
		...partial,
	};
}

describe('resolvePermissionPolicy', () => {
	it('returns allow decision', () => {
		const res = resolvePermissionPolicy(
			'allow',
			runtimeEvent({toolName: 'Bash'}),
		);
		expect(res.action).toBe('respond');
		if (res.action === 'respond') {
			expect(res.decision.intent).toEqual({kind: 'permission_allow'});
		}
	});

	it('returns deny decision', () => {
		const res = resolvePermissionPolicy(
			'deny',
			runtimeEvent({toolName: 'Bash'}),
		);
		expect(res.action).toBe('respond');
		if (res.action === 'respond') {
			expect(res.decision.intent).toEqual(
				expect.objectContaining({kind: 'permission_deny'}),
			);
		}
	});

	it('fails in fail mode', () => {
		const res = resolvePermissionPolicy(
			'fail',
			runtimeEvent({toolName: 'Bash'}),
		);
		expect(res).toEqual(
			expect.objectContaining({
				action: 'fail',
			}),
		);
	});

	it('uses data.tool_name when event.toolName is unavailable', () => {
		const res = resolvePermissionPolicy(
			'fail',
			runtimeEvent({
				toolName: undefined,
				data: {tool_name: 'Read'},
			}),
		);
		expect(res).toEqual(
			expect.objectContaining({
				action: 'fail',
				reason: expect.stringContaining('"Read"'),
			}),
		);
	});
});

describe('resolveQuestionPolicy', () => {
	it('returns empty question answer decision', () => {
		const res = resolveQuestionPolicy('empty');
		expect(res.action).toBe('respond');
		if (res.action === 'respond') {
			expect(res.decision.intent).toEqual({
				kind: 'question_answer',
				answers: {},
			});
		}
	});

	it('fails in fail mode', () => {
		const res = resolveQuestionPolicy('fail');
		expect(res).toEqual(
			expect.objectContaining({
				action: 'fail',
			}),
		);
	});
});

describe('isAskUserQuestionEvent', () => {
	it('matches AskUserQuestion tool.pre events', () => {
		expect(
			isAskUserQuestionEvent(
				runtimeEvent({kind: 'tool.pre', toolName: 'AskUserQuestion'}),
			),
		).toBe(true);
	});

	it('matches AskUserQuestion when tool name is only in event data', () => {
		expect(
			isAskUserQuestionEvent(
				runtimeEvent({
					kind: 'tool.pre',
					toolName: undefined,
					data: {tool_name: 'AskUserQuestion'},
				}),
			),
		).toBe(true);
	});

	it('does not match unrelated events', () => {
		expect(
			isAskUserQuestionEvent(
				runtimeEvent({kind: 'tool.pre', toolName: 'Bash'}),
			),
		).toBe(false);
	});
});
