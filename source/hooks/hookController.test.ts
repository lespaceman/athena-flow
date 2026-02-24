import {describe, it, expect, vi} from 'vitest';
import {handleEvent, type ControllerCallbacks} from './hookController.js';
import type {RuntimeEvent} from '../runtime/types.js';
import type {HookRule} from '../types/rules.js';
import type {LoopState} from '../workflows/loopManager.js';

function makeEvent(
	hookName: string,
	extra?: Partial<RuntimeEvent>,
): RuntimeEvent {
	return {
		id: 'req-1',
		timestamp: Date.now(),
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

function makeCallbacks(loopState?: LoopState | null): ControllerCallbacks & {
	_rules: HookRule[];
	_loopUpdates: Partial<LoopState>[];
} {
	return {
		_rules: [],
		_loopUpdates: [],
		getRules() {
			return this._rules;
		},
		enqueuePermission: vi.fn(),
		enqueueQuestion: vi.fn(),
		getLoopState() {
			return loopState ?? null;
		},
		updateLoopState(update: Partial<LoopState>) {
			this._loopUpdates.push(update);
		},
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

	describe('Stop event handling', () => {
		it('returns handled:false when no loop state (no getLoopState)', () => {
			const cb = makeCallbacks();
			cb.getLoopState = undefined;
			const result = handleEvent(makeEvent('Stop'), cb);
			expect(result.handled).toBe(false);
		});

		it('returns handled:false when getLoopState returns null', () => {
			const cb = makeCallbacks(null);
			const result = handleEvent(makeEvent('Stop'), cb);
			expect(result.handled).toBe(false);
		});

		it('returns handled:false when loop is inactive', () => {
			const cb = makeCallbacks({
				active: false,
				iteration: 3,
				maxIterations: 5,
				completionMarker: 'DONE',
				continueMessage: 'Keep going',
				trackerContent: '# Progress',
			});
			const result = handleEvent(makeEvent('Stop'), cb);
			expect(result.handled).toBe(false);
		});

		it('deactivates and returns handled:false when maxIterations reached', () => {
			const cb = makeCallbacks({
				active: true,
				iteration: 5,
				maxIterations: 5,
				completionMarker: 'DONE',
				continueMessage: 'Keep going',
				trackerContent: '# Progress',
			});
			const result = handleEvent(makeEvent('Stop'), cb);
			expect(result.handled).toBe(false);
			expect(cb._loopUpdates).toEqual([{active: false}]);
		});

		it('deactivates and returns handled:false when completion marker found', () => {
			const cb = makeCallbacks({
				active: true,
				iteration: 2,
				maxIterations: 5,
				completionMarker: 'DONE',
				continueMessage: 'Keep going',
				trackerContent: '# Progress\n\nDONE',
			});
			const result = handleEvent(makeEvent('Stop'), cb);
			expect(result.handled).toBe(false);
			expect(cb._loopUpdates).toEqual([{active: false}]);
		});

		it('blocks stop and increments iteration when loop should continue', () => {
			const cb = makeCallbacks({
				active: true,
				iteration: 2,
				maxIterations: 5,
				completionMarker: 'DONE',
				continueMessage: 'Keep going',
				trackerContent: '# Progress\n\nStill working...',
			});
			const result = handleEvent(makeEvent('Stop'), cb);

			expect(result.handled).toBe(true);
			expect(result.decision).toBeDefined();
			expect(result.decision!.type).toBe('json');
			expect(result.decision!.intent).toEqual({
				kind: 'stop_block',
				reason: 'Keep going',
			});
			expect(cb._loopUpdates).toEqual([{iteration: 3}]);
		});
	});
});
