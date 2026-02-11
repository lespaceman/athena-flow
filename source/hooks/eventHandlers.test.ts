import {describe, it, expect, vi} from 'vitest';
import {
	handleSubagentStop,
	handlePermissionRequest,
	handleAskUserQuestion,
	handlePreToolUseRules,
	handlePermissionCheck,
	handleSafeToolAutoAllow,
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
			v: 1,
			kind: 'hook_event',
			request_id: 'req-1',
			ts: Date.now(),
			session_id: 'sess-1',
			hook_event_name: hookEventName as HookEventEnvelope['hook_event_name'],
			payload: payload as HookEventEnvelope['payload'],
		},
		displayEvent: {
			id: 'evt-1',
			requestId: 'req-1',
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
	});

	it('auto-allows when no deny rule and does not add event', () => {
		const ctx = makeCtx('PermissionRequest', {
			hook_event_name: 'PermissionRequest',
			tool_name: 'Bash',
			tool_input: {},
		});
		const cb = makeCallbacks();

		expect(handlePermissionRequest(ctx, cb)).toBe(true);
		expect(cb.respond).toHaveBeenCalled();
		// PermissionRequest is suppressed in UI (duplicates PreToolUse)
		expect(cb.addEvent).not.toHaveBeenCalled();
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

describe('handlePreToolUseRules', () => {
	it('returns false for non-PreToolUse events', () => {
		const ctx = makeCtx('Notification', {
			hook_event_name: 'Notification',
			message: 'test',
		});
		const cb = makeCallbacks();
		expect(handlePreToolUseRules(ctx, cb)).toBe(false);
	});

	it('returns false when no rule matches', () => {
		const ctx = makeCtx('PreToolUse', {
			hook_event_name: 'PreToolUse',
			tool_name: 'Read',
			tool_input: {},
		});
		const cb = makeCallbacks();
		expect(handlePreToolUseRules(ctx, cb)).toBe(false);
	});

	it('applies matching deny rule', () => {
		const ctx = makeCtx('PreToolUse', {
			hook_event_name: 'PreToolUse',
			tool_name: 'Bash',
			tool_input: {},
		});
		const cb = makeCallbacks();
		cb._rules = [{id: '1', toolName: 'Bash', action: 'deny', addedBy: 'test'}];

		expect(handlePreToolUseRules(ctx, cb)).toBe(true);
		expect(cb.respond).toHaveBeenCalled();
		expect(cb.addEvent).toHaveBeenCalled();
	});

	it('applies matching approve rule', () => {
		const ctx = makeCtx('PreToolUse', {
			hook_event_name: 'PreToolUse',
			tool_name: 'Bash',
			tool_input: {},
		});
		const cb = makeCallbacks();
		cb._rules = [
			{id: '1', toolName: 'Bash', action: 'approve', addedBy: 'test'},
		];

		expect(handlePreToolUseRules(ctx, cb)).toBe(true);
		expect(cb.respond).toHaveBeenCalled();
		expect(cb.addEvent).toHaveBeenCalled();
	});
});

describe('handleSafeToolAutoAllow', () => {
	it('returns false for non-PreToolUse events', () => {
		const ctx = makeCtx('Notification', {
			hook_event_name: 'Notification',
			message: 'test',
		});
		const cb = makeCallbacks();
		expect(handleSafeToolAutoAllow(ctx, cb)).toBe(false);
	});

	it('explicitly allows READ-tier MCP tools instead of passthrough', () => {
		const ctx = makeCtx('PreToolUse', {
			hook_event_name: 'PreToolUse',
			tool_name: 'mcp__agent-web-interface__take_screenshot',
			tool_input: {},
		});
		const cb = makeCallbacks();

		expect(handleSafeToolAutoAllow(ctx, cb)).toBe(true);
		expect(cb.respond).toHaveBeenCalled();
		expect(cb.addEvent).toHaveBeenCalled();
	});

	it('explicitly allows safe built-in tools', () => {
		const ctx = makeCtx('PreToolUse', {
			hook_event_name: 'PreToolUse',
			tool_name: 'Read',
			tool_input: {},
		});
		const cb = makeCallbacks();

		expect(handleSafeToolAutoAllow(ctx, cb)).toBe(true);
		expect(cb.respond).toHaveBeenCalled();
	});

	it('returns false for dangerous tools (lets permission check handle them)', () => {
		const ctx = makeCtx('PreToolUse', {
			hook_event_name: 'PreToolUse',
			tool_name: 'mcp__agent-web-interface__click',
			tool_input: {},
		});
		const cb = makeCallbacks();

		expect(handleSafeToolAutoAllow(ctx, cb)).toBe(false);
	});

	it('explicitly allows close_page and close_session', () => {
		for (const action of ['close_page', 'close_session']) {
			const ctx = makeCtx('PreToolUse', {
				hook_event_name: 'PreToolUse',
				tool_name: `mcp__agent-web-interface__${action}`,
				tool_input: {},
			});
			const cb = makeCallbacks();

			expect(handleSafeToolAutoAllow(ctx, cb)).toBe(true);
			expect(cb.respond).toHaveBeenCalled();
		}
	});
});

describe('handlePreToolUseRules with server-wide prefix rules', () => {
	it('auto-approves MCP tools when server-wide rule exists', () => {
		const ctx = makeCtx('PreToolUse', {
			hook_event_name: 'PreToolUse',
			tool_name: 'mcp__agent-web-interface__navigate',
			tool_input: {url: 'https://example.com'},
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

		expect(handlePreToolUseRules(ctx, cb)).toBe(true);
		expect(cb.respond).toHaveBeenCalled();
	});

	it('auto-denies MCP tools when server-wide deny rule exists', () => {
		const ctx = makeCtx('PreToolUse', {
			hook_event_name: 'PreToolUse',
			tool_name: 'mcp__agent-web-interface__click',
			tool_input: {},
		});
		const cb = makeCallbacks();
		cb._rules = [
			{
				id: '1',
				toolName: 'mcp__agent-web-interface__*',
				action: 'deny',
				addedBy: 'permission-dialog',
			},
		];

		expect(handlePreToolUseRules(ctx, cb)).toBe(true);
		expect(cb.respond).toHaveBeenCalled();
	});

	it('does not match server-wide rule for different server', () => {
		const ctx = makeCtx('PreToolUse', {
			hook_event_name: 'PreToolUse',
			tool_name: 'mcp__other-server__action',
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

		expect(handlePreToolUseRules(ctx, cb)).toBe(false);
	});
});

describe('handlePermissionCheck', () => {
	it('returns false for non-PreToolUse events', () => {
		const ctx = makeCtx('Notification', {
			hook_event_name: 'Notification',
			message: 'test',
		});
		const cb = makeCallbacks();
		expect(handlePermissionCheck(ctx, cb)).toBe(false);
	});

	it('returns false for safe tools', () => {
		const ctx = makeCtx('PreToolUse', {
			hook_event_name: 'PreToolUse',
			tool_name: 'Read',
			tool_input: {},
		});
		const cb = makeCallbacks();
		expect(handlePermissionCheck(ctx, cb)).toBe(false);
	});

	it('enqueues permission for dangerous tools without rules', () => {
		const ctx = makeCtx('PreToolUse', {
			hook_event_name: 'PreToolUse',
			tool_name: 'Bash',
			tool_input: {command: 'rm -rf /'},
		});
		const cb = makeCallbacks();

		expect(handlePermissionCheck(ctx, cb)).toBe(true);
		expect(cb.enqueuePermission).toHaveBeenCalledWith('req-1');
		expect(cb.addEvent).toHaveBeenCalled();
	});
});

describe('dispatchEvent', () => {
	it('falls through to default auto-passthrough when no handler matches', () => {
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

	it('dispatches PermissionRequest to its handler (not default)', () => {
		const ctx = makeCtx('PermissionRequest', {
			hook_event_name: 'PermissionRequest',
			tool_name: 'Bash',
			tool_input: {},
		});
		const cb = makeCallbacks();

		dispatchEvent(ctx, cb);

		// PermissionRequest handler responds directly, not via auto-passthrough
		expect(cb.respond).toHaveBeenCalled();
		expect(cb.storeWithAutoPassthrough).not.toHaveBeenCalled();
	});

	it('explicitly allows READ-tier MCP tools (not passthrough)', () => {
		const ctx = makeCtx('PreToolUse', {
			hook_event_name: 'PreToolUse',
			tool_name: 'mcp__agent-web-interface__take_screenshot',
			tool_input: {},
		});
		const cb = makeCallbacks();

		dispatchEvent(ctx, cb);

		// Should explicitly allow, not passthrough
		expect(cb.respond).toHaveBeenCalled();
		expect(cb.storeWithAutoPassthrough).not.toHaveBeenCalled();
	});
});
