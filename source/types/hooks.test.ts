import {describe, it, expect} from 'vitest';
import {
	PROTOCOL_VERSION,
	isValidHookEventEnvelope,
	generateId,
	createPassthroughResult,
	createBlockResult,
	createJsonOutputResult,
	createPreToolUseDenyResult,
	type HookEventEnvelope,
	type ClaudeHookEvent,
	type PreToolUseEvent,
	type PermissionRequestEvent,
	type PostToolUseEvent,
	type PostToolUseFailureEvent,
	type NotificationEvent,
	type StopEvent,
	type SubagentStartEvent,
	type SubagentStopEvent,
	type UserPromptSubmitEvent,
	type PreCompactEvent,
	type SetupEvent,
	type SessionStartEvent,
	type SessionEndEvent,
	isPreToolUseEvent,
	isPermissionRequestEvent,
	isPostToolUseEvent,
	isPostToolUseFailureEvent,
	isNotificationEvent,
	isStopEvent,
	isSubagentStartEvent,
	isSubagentStopEvent,
	isUserPromptSubmitEvent,
	isPreCompactEvent,
	isSetupEvent,
	isSessionStartEvent,
	isSessionEndEvent,
	isToolEvent,
} from './hooks/index.js';

// Helper to create base event fields
const createBaseEvent = () => ({
	session_id: 'test-session',
	transcript_path: '/path/to/transcript.jsonl',
	cwd: '/project',
});

describe('hooks types', () => {
	describe('PROTOCOL_VERSION', () => {
		it('should be version 1', () => {
			expect(PROTOCOL_VERSION).toBe(1);
		});
	});

	describe('generateId', () => {
		it('should generate unique IDs', () => {
			const id1 = generateId();
			const id2 = generateId();
			expect(id1).not.toBe(id2);
		});

		it('should generate IDs with timestamp prefix', () => {
			const before = Date.now();
			const id = generateId();
			const after = Date.now();

			const timestamp = Number.parseInt(id.split('-')[0] ?? '0', 10);
			expect(timestamp).toBeGreaterThanOrEqual(before);
			expect(timestamp).toBeLessThanOrEqual(after);
		});

		it('should generate IDs with random suffix', () => {
			const id = generateId();
			const parts = id.split('-');
			expect(parts.length).toBe(2);
			expect(parts[1]?.length).toBeGreaterThan(0);
		});
	});

	describe('isValidHookEventEnvelope', () => {
		const validPayload: PreToolUseEvent = {
			...createBaseEvent(),
			hook_event_name: 'PreToolUse',
			tool_name: 'Bash',
			tool_input: {command: 'ls'},
		};

		const validEnvelope: HookEventEnvelope = {
			v: 1,
			kind: 'hook_event',
			request_id: 'req-123',
			ts: Date.now(),
			session_id: 'test-session',
			hook_event_name: 'PreToolUse',
			payload: validPayload,
		};

		it('should return true for valid envelope', () => {
			expect(isValidHookEventEnvelope(validEnvelope)).toBe(true);
		});

		it('should return false for null', () => {
			expect(isValidHookEventEnvelope(null)).toBe(false);
		});

		it('should return false for undefined', () => {
			expect(isValidHookEventEnvelope(undefined)).toBe(false);
		});

		it('should return false for non-object', () => {
			expect(isValidHookEventEnvelope('string')).toBe(false);
			expect(isValidHookEventEnvelope(123)).toBe(false);
			expect(isValidHookEventEnvelope([])).toBe(false);
		});

		it('should return false for missing version', () => {
			const envelope = {...validEnvelope, v: undefined};
			expect(isValidHookEventEnvelope(envelope)).toBe(false);
		});

		it('should return false for mismatched protocol version', () => {
			const envelope = {...validEnvelope, v: 999};
			expect(isValidHookEventEnvelope(envelope)).toBe(false);
		});

		it('should return false for wrong kind', () => {
			const envelope = {...validEnvelope, kind: 'hook_result'};
			expect(isValidHookEventEnvelope(envelope)).toBe(false);
		});

		it('should return false for missing request_id', () => {
			const envelope = {...validEnvelope, request_id: undefined};
			expect(isValidHookEventEnvelope(envelope)).toBe(false);
		});

		it('should return false for empty request_id', () => {
			const envelope = {...validEnvelope, request_id: ''};
			expect(isValidHookEventEnvelope(envelope)).toBe(false);
		});

		it('should return false for invalid hook_event_name', () => {
			const envelope = {...validEnvelope, hook_event_name: 'InvalidEvent'};
			expect(isValidHookEventEnvelope(envelope)).toBe(false);
		});

		it('should return false for missing payload', () => {
			const envelope = {...validEnvelope, payload: undefined};
			expect(isValidHookEventEnvelope(envelope)).toBe(false);
		});

		it('should return false for null payload', () => {
			const envelope = {...validEnvelope, payload: null};
			expect(isValidHookEventEnvelope(envelope)).toBe(false);
		});

		it('should accept all valid hook event names', () => {
			const validNames = [
				'SessionStart',
				'UserPromptSubmit',
				'PreToolUse',
				'PermissionRequest',
				'PostToolUse',
				'PostToolUseFailure',
				'SubagentStart',
				'SubagentStop',
				'Stop',
				'PreCompact',
				'SessionEnd',
				'Notification',
				'Setup',
			];

			for (const name of validNames) {
				const envelope = {...validEnvelope, hook_event_name: name};
				expect(isValidHookEventEnvelope(envelope)).toBe(true);
			}
		});
	});

	describe('createPassthroughResult', () => {
		it('should create passthrough result', () => {
			const result = createPassthroughResult();
			expect(result).toEqual({action: 'passthrough'});
		});
	});

	describe('createBlockResult', () => {
		it('should create block result with reason', () => {
			const result = createBlockResult('Permission denied');
			expect(result).toEqual({
				action: 'block_with_stderr',
				stderr: 'Permission denied',
			});
		});
	});

	describe('createJsonOutputResult', () => {
		it('should create json output result', () => {
			const json = {foo: 'bar', count: 42};
			const result = createJsonOutputResult(json);
			expect(result).toEqual({
				action: 'json_output',
				stdout_json: {foo: 'bar', count: 42},
			});
		});
	});

	describe('createPreToolUseDenyResult', () => {
		it('should create PreToolUse deny result', () => {
			const result = createPreToolUseDenyResult('Blocked by policy');
			expect(result).toEqual({
				action: 'json_output',
				stdout_json: {
					hookSpecificOutput: {
						hookEventName: 'PreToolUse',
						permissionDecision: 'deny',
						permissionDecisionReason: 'Blocked by policy',
					},
				},
			});
		});
	});

	describe('type guards', () => {
		const preToolUseEvent: PreToolUseEvent = {
			...createBaseEvent(),
			hook_event_name: 'PreToolUse',
			tool_name: 'Bash',
			tool_input: {command: 'ls'},
		};

		const permissionRequestEvent: PermissionRequestEvent = {
			...createBaseEvent(),
			hook_event_name: 'PermissionRequest',
			tool_name: 'Bash',
			tool_input: {command: 'rm -rf /'},
		};

		const postToolUseEvent: PostToolUseEvent = {
			...createBaseEvent(),
			hook_event_name: 'PostToolUse',
			tool_name: 'Bash',
			tool_input: {command: 'ls'},
			tool_response: 'file1.txt\nfile2.txt',
		};

		const postToolUseFailureEvent: PostToolUseFailureEvent = {
			...createBaseEvent(),
			hook_event_name: 'PostToolUseFailure',
			tool_name: 'Bash',
			tool_input: {command: 'ls'},
			error: 'command not found',
		};

		const notificationEvent: NotificationEvent = {
			...createBaseEvent(),
			hook_event_name: 'Notification',
			message: 'Test notification',
			notification_type: 'permission_prompt',
		};

		const stopEvent: StopEvent = {
			...createBaseEvent(),
			hook_event_name: 'Stop',
			stop_hook_active: true,
		};

		const subagentStartEvent: SubagentStartEvent = {
			...createBaseEvent(),
			hook_event_name: 'SubagentStart',
			agent_id: 'agent-123',
			agent_type: 'Explore',
		};

		const subagentStopEvent: SubagentStopEvent = {
			...createBaseEvent(),
			hook_event_name: 'SubagentStop',
			stop_hook_active: false,
			agent_id: 'agent-123',
		};

		const userPromptSubmitEvent: UserPromptSubmitEvent = {
			...createBaseEvent(),
			hook_event_name: 'UserPromptSubmit',
			prompt: 'Hello, Claude!',
		};

		const preCompactEvent: PreCompactEvent = {
			...createBaseEvent(),
			hook_event_name: 'PreCompact',
			trigger: 'manual',
			custom_instructions: 'Keep important context',
		};

		const setupEvent: SetupEvent = {
			...createBaseEvent(),
			hook_event_name: 'Setup',
			trigger: 'init',
		};

		const sessionStartEvent: SessionStartEvent = {
			...createBaseEvent(),
			hook_event_name: 'SessionStart',
			source: 'startup',
			model: 'claude-sonnet-4-20250514',
		};

		const sessionEndEvent: SessionEndEvent = {
			...createBaseEvent(),
			hook_event_name: 'SessionEnd',
			reason: 'other',
		};

		describe('isPreToolUseEvent', () => {
			it('should return true for PreToolUse event', () => {
				expect(isPreToolUseEvent(preToolUseEvent)).toBe(true);
			});

			it('should return false for other events', () => {
				expect(isPreToolUseEvent(postToolUseEvent)).toBe(false);
				expect(isPreToolUseEvent(notificationEvent)).toBe(false);
				expect(isPreToolUseEvent(sessionEndEvent)).toBe(false);
			});
		});

		describe('isPermissionRequestEvent', () => {
			it('should return true for PermissionRequest event', () => {
				expect(isPermissionRequestEvent(permissionRequestEvent)).toBe(true);
			});

			it('should return false for other events', () => {
				expect(isPermissionRequestEvent(preToolUseEvent)).toBe(false);
				expect(isPermissionRequestEvent(postToolUseEvent)).toBe(false);
			});
		});

		describe('isPostToolUseEvent', () => {
			it('should return true for PostToolUse event', () => {
				expect(isPostToolUseEvent(postToolUseEvent)).toBe(true);
			});

			it('should return false for other events', () => {
				expect(isPostToolUseEvent(preToolUseEvent)).toBe(false);
				expect(isPostToolUseEvent(postToolUseFailureEvent)).toBe(false);
				expect(isPostToolUseEvent(notificationEvent)).toBe(false);
			});
		});

		describe('isPostToolUseFailureEvent', () => {
			it('should return true for PostToolUseFailure event', () => {
				expect(isPostToolUseFailureEvent(postToolUseFailureEvent)).toBe(true);
			});

			it('should return false for other events', () => {
				expect(isPostToolUseFailureEvent(postToolUseEvent)).toBe(false);
				expect(isPostToolUseFailureEvent(preToolUseEvent)).toBe(false);
			});
		});

		describe('isNotificationEvent', () => {
			it('should return true for Notification event', () => {
				expect(isNotificationEvent(notificationEvent)).toBe(true);
			});

			it('should return false for other events', () => {
				expect(isNotificationEvent(preToolUseEvent)).toBe(false);
				expect(isNotificationEvent(stopEvent)).toBe(false);
			});
		});

		describe('isStopEvent', () => {
			it('should return true for Stop event', () => {
				expect(isStopEvent(stopEvent)).toBe(true);
			});

			it('should return false for other events', () => {
				expect(isStopEvent(subagentStopEvent)).toBe(false);
				expect(isStopEvent(preToolUseEvent)).toBe(false);
			});
		});

		describe('isSubagentStartEvent', () => {
			it('should return true for SubagentStart event', () => {
				expect(isSubagentStartEvent(subagentStartEvent)).toBe(true);
			});

			it('should return false for other events', () => {
				expect(isSubagentStartEvent(subagentStopEvent)).toBe(false);
				expect(isSubagentStartEvent(preToolUseEvent)).toBe(false);
			});
		});

		describe('isSubagentStopEvent', () => {
			it('should return true for SubagentStop event', () => {
				expect(isSubagentStopEvent(subagentStopEvent)).toBe(true);
			});

			it('should return false for other events', () => {
				expect(isSubagentStopEvent(subagentStartEvent)).toBe(false);
				expect(isSubagentStopEvent(stopEvent)).toBe(false);
				expect(isSubagentStopEvent(preToolUseEvent)).toBe(false);
			});
		});

		describe('isUserPromptSubmitEvent', () => {
			it('should return true for UserPromptSubmit event', () => {
				expect(isUserPromptSubmitEvent(userPromptSubmitEvent)).toBe(true);
			});

			it('should return false for other events', () => {
				expect(isUserPromptSubmitEvent(preToolUseEvent)).toBe(false);
				expect(isUserPromptSubmitEvent(sessionStartEvent)).toBe(false);
			});
		});

		describe('isPreCompactEvent', () => {
			it('should return true for PreCompact event', () => {
				expect(isPreCompactEvent(preCompactEvent)).toBe(true);
			});

			it('should return false for other events', () => {
				expect(isPreCompactEvent(preToolUseEvent)).toBe(false);
				expect(isPreCompactEvent(sessionEndEvent)).toBe(false);
			});
		});

		describe('isSetupEvent', () => {
			it('should return true for Setup event', () => {
				expect(isSetupEvent(setupEvent)).toBe(true);
			});

			it('should return false for other events', () => {
				expect(isSetupEvent(sessionStartEvent)).toBe(false);
				expect(isSetupEvent(preToolUseEvent)).toBe(false);
			});
		});

		describe('isSessionStartEvent', () => {
			it('should return true for SessionStart event', () => {
				expect(isSessionStartEvent(sessionStartEvent)).toBe(true);
			});

			it('should return false for other events', () => {
				expect(isSessionStartEvent(sessionEndEvent)).toBe(false);
				expect(isSessionStartEvent(preToolUseEvent)).toBe(false);
			});
		});

		describe('isSessionEndEvent', () => {
			it('should return true for SessionEnd event', () => {
				expect(isSessionEndEvent(sessionEndEvent)).toBe(true);
			});

			it('should return false for other events', () => {
				expect(isSessionEndEvent(sessionStartEvent)).toBe(false);
				expect(isSessionEndEvent(preToolUseEvent)).toBe(false);
			});
		});

		describe('isToolEvent', () => {
			it('should return true for PreToolUse event', () => {
				expect(isToolEvent(preToolUseEvent)).toBe(true);
			});

			it('should return true for PermissionRequest event', () => {
				expect(isToolEvent(permissionRequestEvent)).toBe(true);
			});

			it('should return true for PostToolUse event', () => {
				expect(isToolEvent(postToolUseEvent)).toBe(true);
			});

			it('should return true for PostToolUseFailure event', () => {
				expect(isToolEvent(postToolUseFailureEvent)).toBe(true);
			});

			it('should return false for non-tool events', () => {
				expect(isToolEvent(notificationEvent)).toBe(false);
				expect(isToolEvent(stopEvent)).toBe(false);
				expect(isToolEvent(sessionEndEvent)).toBe(false);
				expect(isToolEvent(subagentStartEvent)).toBe(false);
			});
		});

		describe('discriminated union narrowing', () => {
			it('should allow TypeScript to narrow types based on hook_event_name', () => {
				const event: ClaudeHookEvent = preToolUseEvent;

				if (event.hook_event_name === 'PreToolUse') {
					// TypeScript should know this is a PreToolUseEvent
					expect(event.tool_name).toBe('Bash');
					expect(event.tool_input).toEqual({command: 'ls'});
				}
			});

			it('should allow accessing tool_response only on PostToolUse', () => {
				const event: ClaudeHookEvent = postToolUseEvent;

				if (isPostToolUseEvent(event)) {
					// TypeScript should know this is a PostToolUseEvent
					expect(event.tool_response).toBe('file1.txt\nfile2.txt');
				}
			});

			it('should allow accessing reason only on SessionEnd events', () => {
				const event: ClaudeHookEvent = sessionEndEvent;

				if (isSessionEndEvent(event)) {
					// TypeScript should know this is a SessionEndEvent
					expect(event.reason).toBe('other');
				}
			});

			it('should allow accessing source only on SessionStart events', () => {
				const event: ClaudeHookEvent = sessionStartEvent;

				if (isSessionStartEvent(event)) {
					// TypeScript should know this is a SessionStartEvent
					expect(event.source).toBe('startup');
					expect(event.model).toBe('claude-sonnet-4-20250514');
				}
			});

			it('should allow accessing agent_id on subagent events', () => {
				const event: ClaudeHookEvent = subagentStartEvent;

				if (isSubagentStartEvent(event)) {
					// TypeScript should know this is a SubagentStartEvent
					expect(event.agent_id).toBe('agent-123');
					expect(event.agent_type).toBe('Explore');
				}
			});

			it('should allow accessing trigger on PreCompact events', () => {
				const event: ClaudeHookEvent = preCompactEvent;

				if (isPreCompactEvent(event)) {
					// TypeScript should know this is a PreCompactEvent
					expect(event.trigger).toBe('manual');
					expect(event.custom_instructions).toBe('Keep important context');
				}
			});
		});
	});
});
