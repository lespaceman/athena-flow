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
	type ClaudeHookInput,
} from './hooks.js';

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
		const validPayload: ClaudeHookInput = {
			session_id: 'test-session',
			transcript_path: '/path/to/transcript.jsonl',
			cwd: '/project',
			hook_event_name: 'PreToolUse',
			tool_name: 'Bash',
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
				'PreToolUse',
				'PostToolUse',
				'Notification',
				'Stop',
				'SubagentStop',
				'UserPromptSubmit',
				'SessionStart',
				'SessionEnd',
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
});
