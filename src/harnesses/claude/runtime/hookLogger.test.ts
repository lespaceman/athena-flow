import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import * as fs from 'node:fs';
import {
	initHookLogger,
	logHookReceived,
	logHookResponded,
	closeHookLogger,
	getLogFilePath,
} from './hookLogger';
import {type HookEventEnvelope} from '../protocol/index';

vi.mock('node:fs');

const mockedFs = vi.mocked(fs);

describe('hookLogger', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		closeHookLogger();
	});

	afterEach(() => {
		closeHookLogger();
	});

	describe('initHookLogger', () => {
		it('creates the log directory', () => {
			initHookLogger('/project');

			expect(mockedFs.mkdirSync).toHaveBeenCalledWith('/project/.claude/logs', {
				recursive: true,
			});
		});

		it('sets the log file path', () => {
			initHookLogger('/project');

			expect(getLogFilePath()).toBe('/project/.claude/logs/hooks.jsonl');
		});

		it('handles directory creation errors gracefully', () => {
			mockedFs.mkdirSync.mockImplementation(() => {
				throw new Error('Permission denied');
			});

			// Should not throw
			expect(() => initHookLogger('/project')).not.toThrow();
			expect(getLogFilePath()).toBe('/project/.claude/logs/hooks.jsonl');
		});
	});

	describe('logHookReceived', () => {
		it('does nothing if not initialized', () => {
			const envelope: HookEventEnvelope = {
				v: 1,
				kind: 'hook_event',
				request_id: 'req-123',
				ts: Date.now(),
				session_id: 'session-456',
				hook_event_name: 'PreToolUse',
				payload: {tool_name: 'Bash', tool_input: {command: 'ls'}},
			};

			logHookReceived(envelope);

			expect(mockedFs.appendFileSync).not.toHaveBeenCalled();
		});

		it('logs hook event with tool name', () => {
			initHookLogger('/project');

			const envelope: HookEventEnvelope = {
				v: 1,
				kind: 'hook_event',
				request_id: 'req-123',
				ts: Date.now(),
				session_id: 'session-456',
				hook_event_name: 'PreToolUse',
				payload: {tool_name: 'Bash', tool_input: {command: 'ls'}},
			};

			logHookReceived(envelope);

			expect(mockedFs.appendFileSync).toHaveBeenCalledTimes(1);
			const [filePath, content] = mockedFs.appendFileSync.mock.calls[0]!;
			expect(filePath).toBe('/project/.claude/logs/hooks.jsonl');

			const entry = JSON.parse(content as string);
			expect(entry.type).toBe('received');
			expect(entry.event).toBe('PreToolUse');
			expect(entry.request_id).toBe('req-123');
			expect(entry.session_id).toBe('session-456');
			expect(entry.tool).toBe('Bash');
			expect(entry.payload).toEqual({
				tool_name: 'Bash',
				tool_input: {command: 'ls'},
			});
			expect(entry.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
		});

		it('logs hook event without tool name for non-tool events', () => {
			initHookLogger('/project');

			const envelope: HookEventEnvelope = {
				v: 1,
				kind: 'hook_event',
				request_id: 'req-789',
				ts: Date.now(),
				session_id: 'session-456',
				hook_event_name: 'SessionStart',
				payload: {cwd: '/project'},
			};

			logHookReceived(envelope);

			const [, content] = mockedFs.appendFileSync.mock.calls[0]!;
			const entry = JSON.parse(content as string);
			expect(entry.type).toBe('received');
			expect(entry.event).toBe('SessionStart');
			expect(entry.tool).toBeUndefined();
		});

		it('handles write errors gracefully', () => {
			initHookLogger('/project');
			mockedFs.appendFileSync.mockImplementation(() => {
				throw new Error('Disk full');
			});

			const envelope: HookEventEnvelope = {
				v: 1,
				kind: 'hook_event',
				request_id: 'req-123',
				ts: Date.now(),
				session_id: 'session-456',
				hook_event_name: 'PreToolUse',
				payload: {tool_name: 'Bash', tool_input: {command: 'ls'}},
			};

			// Should not throw
			expect(() => logHookReceived(envelope)).not.toThrow();
		});
	});

	describe('logHookResponded', () => {
		it('does nothing if not initialized', () => {
			logHookResponded('req-123', 'passthrough', 100);

			expect(mockedFs.appendFileSync).not.toHaveBeenCalled();
		});

		it('logs response with all fields', () => {
			initHookLogger('/project');

			logHookResponded('req-123', 'passthrough', 150);

			expect(mockedFs.appendFileSync).toHaveBeenCalledTimes(1);
			const [filePath, content] = mockedFs.appendFileSync.mock.calls[0]!;
			expect(filePath).toBe('/project/.claude/logs/hooks.jsonl');

			const entry = JSON.parse(content as string);
			expect(entry.type).toBe('responded');
			expect(entry.request_id).toBe('req-123');
			expect(entry.action).toBe('passthrough');
			expect(entry.response_time_ms).toBe(150);
			expect(entry.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
		});

		it('logs block_with_stderr action', () => {
			initHookLogger('/project');

			logHookResponded('req-456', 'block_with_stderr', 50);

			const [, content] = mockedFs.appendFileSync.mock.calls[0]!;
			const entry = JSON.parse(content as string);
			expect(entry.action).toBe('block_with_stderr');
		});

		it('logs json_output action', () => {
			initHookLogger('/project');

			logHookResponded('req-789', 'json_output', 200);

			const [, content] = mockedFs.appendFileSync.mock.calls[0]!;
			const entry = JSON.parse(content as string);
			expect(entry.action).toBe('json_output');
		});

		it('handles write errors gracefully', () => {
			initHookLogger('/project');
			mockedFs.appendFileSync.mockImplementation(() => {
				throw new Error('Disk full');
			});

			// Should not throw
			expect(() =>
				logHookResponded('req-123', 'passthrough', 100),
			).not.toThrow();
		});
	});

	describe('closeHookLogger', () => {
		it('resets the logger state', () => {
			initHookLogger('/project');
			expect(getLogFilePath()).not.toBeNull();

			closeHookLogger();
			expect(getLogFilePath()).toBeNull();
		});

		it('prevents logging after close', () => {
			initHookLogger('/project');
			closeHookLogger();

			const envelope: HookEventEnvelope = {
				v: 1,
				kind: 'hook_event',
				request_id: 'req-123',
				ts: Date.now(),
				session_id: 'session-456',
				hook_event_name: 'PreToolUse',
				payload: {tool_name: 'Bash', tool_input: {command: 'ls'}},
			};

			logHookReceived(envelope);
			logHookResponded('req-123', 'passthrough', 100);

			expect(mockedFs.appendFileSync).not.toHaveBeenCalled();
		});
	});
});
