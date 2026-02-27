import {describe, it, expect, vi} from 'vitest';
import {handleEvent, type ControllerCallbacks} from './runtimeController';
import type {RuntimeEvent} from '../runtime/types';
import type {HookRule} from './rules';
import {mapLegacyHookNameToRuntimeKind} from '../runtime/events';

function makeEvent(
	hookName: string,
	extra?: Partial<RuntimeEvent>,
): RuntimeEvent {
	return {
		id: 'req-1',
		timestamp: Date.now(),
		kind: mapLegacyHookNameToRuntimeKind(hookName),
		data: {
			tool_name: 'Bash',
			tool_input: {},
		},
		hookName,
		sessionId: 'sess-1',
		context: {cwd: '/project', transcriptPath: '/tmp/t.jsonl'},
		interaction: {expectsDecision: true, canBlock: true},
		payload: {
			hook_event_name: hookName,
			session_id: 'sess-1',
			transcript_path: '/tmp/t.jsonl',
			cwd: '/project',
			tool_name: 'Bash',
			tool_input: {},
		},
		toolName: 'Bash',
		...extra,
	};
}

function makeCallbacks(): ControllerCallbacks & {
	_rules: HookRule[];
} {
	return {
		_rules: [],
		getRules() {
			return this._rules;
		},
		enqueuePermission: vi.fn(),
		enqueueQuestion: vi.fn(),
	};
}

describe('hookController handleEvent', () => {
	it('enqueues PermissionRequest for user when no rule matches', () => {
		const cb = makeCallbacks();
		const result = handleEvent(makeEvent('PermissionRequest'), cb);

		expect(result.handled).toBe(true);
		expect(result.decision).toBeUndefined();
		expect(cb.enqueuePermission).toHaveBeenCalledWith(
			expect.objectContaining({id: 'req-1', hookName: 'PermissionRequest'}),
		);
	});

	it('returns immediate allow decision when approve rule matches', () => {
		const cb = makeCallbacks();
		cb._rules = [
			{id: '1', toolName: 'Bash', action: 'approve', addedBy: 'test'},
		];
		const result = handleEvent(makeEvent('PermissionRequest'), cb);

		expect(result.handled).toBe(true);
		expect(result.decision).toBeDefined();
		expect(result.decision!.type).toBe('json');
		expect(result.decision!.source).toBe('rule');
		expect(result.decision!.intent).toEqual({kind: 'permission_allow'});
	});

	it('returns immediate deny decision when deny rule matches', () => {
		const cb = makeCallbacks();
		cb._rules = [{id: '1', toolName: 'Bash', action: 'deny', addedBy: 'test'}];
		const result = handleEvent(makeEvent('PermissionRequest'), cb);

		expect(result.handled).toBe(true);
		expect(result.decision!.intent).toEqual({
			kind: 'permission_deny',
			reason: 'Blocked by rule: test',
		});
	});

	it('enqueues AskUserQuestion PreToolUse events', () => {
		const cb = makeCallbacks();
		const event = makeEvent('PreToolUse', {toolName: 'AskUserQuestion'});
		const result = handleEvent(event, cb);

		expect(result.handled).toBe(true);
		expect(cb.enqueueQuestion).toHaveBeenCalledWith('req-1');
	});

	it('auto-allows PreToolUse when no rule matches (no permission prompt)', () => {
		const cb = makeCallbacks();
		const result = handleEvent(makeEvent('PreToolUse'), cb);

		expect(result.handled).toBe(true);
		expect(result.decision).toBeDefined();
		expect(result.decision!.intent).toEqual({kind: 'pre_tool_allow'});
		expect(cb.enqueuePermission).not.toHaveBeenCalled();
	});

	it('returns immediate pre_tool_allow when approve rule matches PreToolUse', () => {
		const cb = makeCallbacks();
		cb._rules = [
			{id: '1', toolName: 'Bash', action: 'approve', addedBy: 'test'},
		];
		const result = handleEvent(makeEvent('PreToolUse'), cb);

		expect(result.handled).toBe(true);
		expect(result.decision).toBeDefined();
		expect(result.decision!.intent).toEqual({kind: 'pre_tool_allow'});
	});

	it('returns immediate pre_tool_deny when deny rule matches PreToolUse', () => {
		const cb = makeCallbacks();
		cb._rules = [{id: '1', toolName: 'Bash', action: 'deny', addedBy: 'test'}];
		const result = handleEvent(makeEvent('PreToolUse'), cb);

		expect(result.handled).toBe(true);
		expect(result.decision!.intent).toEqual({
			kind: 'pre_tool_deny',
			reason: 'Blocked by rule: test',
		});
	});

	it('returns handled:false for unknown events', () => {
		const cb = makeCallbacks();
		const result = handleEvent(makeEvent('FutureEvent'), cb);

		expect(result.handled).toBe(false);
	});

	it('passes through Stop events without handling', () => {
		const cb = makeCallbacks();
		const result = handleEvent(makeEvent('Stop'), cb);
		expect(result.handled).toBe(false);
	});
});
