import {describe, it, expect, vi} from 'vitest';
import {
	handleSubagentStop,
	handlePermissionRequest,
	handleAskUserQuestion,
	dispatchEvent,
	type HandlerContext,
	type HandlerCallbacks,
} from './eventHandlers.js';
import type {HookEventEnvelope} from '../types/hooks/envelope.js';
import type {HookEventDisplay} from '../types/hooks/display.js';
import type {HookRule} from '../types/rules.js';

// Suppress console.error from handler internals
vi.spyOn(console, 'error').mockImplementation(() => {});

function makeCtx(
	hookEventName: string,
	payload: Record<string, unknown>,
): HandlerContext {
	return {
		envelope: {
			request_id: 'req-1',
			ts: Date.now(),
			session_id: 'sess-1',
			hook_event_name: hookEventName as HookEventEnvelope['hook_event_name'],
			payload: payload as HookEventEnvelope['payload'],
		},
		displayEvent: {
			id: 'req-1',
			timestamp: new Date(),
			hookName: hookEventName as HookEventDisplay['hookName'],
			payload: payload as HookEventDisplay['payload'],
			status: 'pending',
		},
		receiveTimestamp: Date.now(),
	};
}

function makeCallbacks(): HandlerCallbacks & {_rules: HookRule[]} {
	return {
		_rules: [],
		getRules: function () {
			return this._rules;
		},
		storeWithAutoPassthrough: vi.fn(),
		storeWithoutPassthrough: vi.fn(),
		addEvent: vi.fn(),
		respond: vi.fn(),
		enqueuePermission: vi.fn(),
		enqueueQuestion: vi.fn(),
		setCurrentSessionId: vi.fn(),
		onTranscriptParsed: vi.fn(),
	};
}

describe('handleSubagentStop', () => {
	it('returns false for non-SubagentStop events', () => {
		const ctx = makeCtx('PreToolUse', {
			hook_event_name: 'PreToolUse',
			tool_name: 'Bash',
			tool_input: {},
		});
		const cb = makeCallbacks();
		expect(handleSubagentStop(ctx, cb)).toBe(false);
	});

	it('handles SubagentStop events and stores with auto-passthrough', () => {
		const ctx = makeCtx('SubagentStop', {
			hook_event_name: 'SubagentStop',
			session_id: 'sess-1',
			transcript_path: '/tmp/t.jsonl',
			cwd: '/project',
			stop_hook_active: false,
			agent_id: 'agent-1',
			agent_type: 'general',
		});
		const cb = makeCallbacks();

		expect(handleSubagentStop(ctx, cb)).toBe(true);
		expect(cb.storeWithAutoPassthrough).toHaveBeenCalledWith(ctx);
		expect(cb.addEvent).toHaveBeenCalledWith(ctx.displayEvent);
	});
});

describe('handlePermissionRequest', () => {
	it('returns false for non-PermissionRequest events', () => {
		const ctx = makeCtx('PreToolUse', {
			hook_event_name: 'PreToolUse',
			tool_name: 'Bash',
			tool_input: {},
		});
		const cb = makeCallbacks();
		expect(handlePermissionRequest(ctx, cb)).toBe(false);
	});

	it('blocks when a deny rule matches', () => {
		const ctx = makeCtx('PermissionRequest', {
			hook_event_name: 'PermissionRequest',
			tool_name: 'Bash',
			tool_input: {},
		});
		const cb = makeCallbacks();
		cb._rules = [{id: '1', toolName: 'Bash', action: 'deny', addedBy: 'test'}];

		expect(handlePermissionRequest(ctx, cb)).toBe(true);
		expect(cb.respond).toHaveBeenCalled();
		expect(cb.addEvent).toHaveBeenCalled();
		expect(cb.enqueuePermission).not.toHaveBeenCalled();
	});

	it('auto-allows when an approve rule matches', () => {
		const ctx = makeCtx('PermissionRequest', {
			hook_event_name: 'PermissionRequest',
			tool_name: 'Bash',
			tool_input: {},
		});
		const cb = makeCallbacks();
		cb._rules = [
			{id: '1', toolName: 'Bash', action: 'approve', addedBy: 'test'},
		];

		expect(handlePermissionRequest(ctx, cb)).toBe(true);
		expect(cb.respond).toHaveBeenCalled();
		expect(cb.addEvent).toHaveBeenCalled();
		expect(cb.enqueuePermission).not.toHaveBeenCalled();
	});

	it('enqueues for permission dialog when no rule matches', () => {
		const ctx = makeCtx('PermissionRequest', {
			hook_event_name: 'PermissionRequest',
			tool_name: 'Bash',
			tool_input: {},
		});
		const cb = makeCallbacks();

		expect(handlePermissionRequest(ctx, cb)).toBe(true);
		expect(cb.enqueuePermission).toHaveBeenCalledWith('req-1');
		expect(cb.addEvent).toHaveBeenCalled();
		expect(cb.respond).not.toHaveBeenCalled();
	});

	it('auto-allows when server-wide approve rule matches', () => {
		const ctx = makeCtx('PermissionRequest', {
			hook_event_name: 'PermissionRequest',
			tool_name: 'mcp__agent-web-interface__click',
			tool_input: {},
		});
		const cb = makeCallbacks();
		cb._rules = [
			{
				id: '1',
				toolName: 'mcp__agent-web-interface__*',
				action: 'approve',
				addedBy: 'permission-dialog',
			},
		];

		expect(handlePermissionRequest(ctx, cb)).toBe(true);
		expect(cb.respond).toHaveBeenCalled();
		expect(cb.enqueuePermission).not.toHaveBeenCalled();
	});
});

describe('handleAskUserQuestion', () => {
	it('returns false for non-AskUserQuestion PreToolUse events', () => {
		const ctx = makeCtx('PreToolUse', {
			hook_event_name: 'PreToolUse',
			tool_name: 'Bash',
			tool_input: {},
		});
		const cb = makeCallbacks();
		expect(handleAskUserQuestion(ctx, cb)).toBe(false);
	});

	it('returns false for non-PreToolUse events', () => {
		const ctx = makeCtx('Notification', {
			hook_event_name: 'Notification',
			message: 'test',
		});
		const cb = makeCallbacks();
		expect(handleAskUserQuestion(ctx, cb)).toBe(false);
	});

	it('enqueues AskUserQuestion events', () => {
		const ctx = makeCtx('PreToolUse', {
			hook_event_name: 'PreToolUse',
			tool_name: 'AskUserQuestion',
			tool_input: {},
		});
		const cb = makeCallbacks();

		expect(handleAskUserQuestion(ctx, cb)).toBe(true);
		expect(cb.enqueueQuestion).toHaveBeenCalledWith('req-1');
		expect(cb.addEvent).toHaveBeenCalled();
		expect(cb.storeWithoutPassthrough).toHaveBeenCalledWith(ctx);
	});
});

describe('dispatchEvent', () => {
	it('falls through to default auto-passthrough for PreToolUse events', () => {
		const ctx = makeCtx('PreToolUse', {
			hook_event_name: 'PreToolUse',
			tool_name: 'Read',
			tool_input: {},
		});
		const cb = makeCallbacks();

		dispatchEvent(ctx, cb);

		// PreToolUse events (not AskUserQuestion) passthrough — Claude Code
		// handles permissions via PermissionRequest hook instead
		expect(cb.storeWithAutoPassthrough).toHaveBeenCalledWith(ctx);
		expect(cb.addEvent).toHaveBeenCalled();
	});

	it('falls through to default auto-passthrough for unknown events', () => {
		const ctx = makeCtx('Notification', {
			hook_event_name: 'Notification',
			session_id: 'sess-1',
			transcript_path: '/tmp/t.jsonl',
			cwd: '/project',
			message: 'test',
		});
		const cb = makeCallbacks();

		dispatchEvent(ctx, cb);

		expect(cb.storeWithAutoPassthrough).toHaveBeenCalledWith(ctx);
		expect(cb.addEvent).toHaveBeenCalled();
	});

	it('calls handleSessionTracking for SessionStart events', () => {
		const ctx = makeCtx('SessionStart', {
			hook_event_name: 'SessionStart',
			session_id: 'sess-1',
			transcript_path: '/tmp/t.jsonl',
			cwd: '/project',
			source: 'startup',
		});
		const cb = makeCallbacks();

		dispatchEvent(ctx, cb);

		expect(cb.setCurrentSessionId).toHaveBeenCalledWith('sess-1');
	});

	it('dispatches PermissionRequest to permission dialog (not passthrough)', () => {
		const ctx = makeCtx('PermissionRequest', {
			hook_event_name: 'PermissionRequest',
			tool_name: 'Bash',
			tool_input: {},
		});
		const cb = makeCallbacks();

		dispatchEvent(ctx, cb);

		// No rule → enqueue for user permission dialog
		expect(cb.enqueuePermission).toHaveBeenCalledWith('req-1');
		expect(cb.storeWithAutoPassthrough).not.toHaveBeenCalled();
	});
});
