/**
 * @vitest-environment jsdom
 */
import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {renderHook, act} from '@testing-library/react';
import {useClaudeProcess} from './useClaudeProcess.js';
import * as spawnModule from '../utils/spawnClaude.js';
import {EventEmitter} from 'node:events';
import type {ChildProcess} from 'node:child_process';

// Create mock child process
function createMockChildProcess(): ChildProcess {
	const mockProcess = new EventEmitter() as ChildProcess;
	mockProcess.kill = vi.fn().mockReturnValue(true);
	return mockProcess;
}

vi.mock('../utils/spawnClaude.js', () => ({
	spawnClaude: vi.fn(),
}));

describe('useClaudeProcess', () => {
	let mockProcess: ChildProcess;
	let capturedCallbacks: {
		onStdout?: (data: string) => void;
		onStderr?: (data: string) => void;
		onExit?: (code: number | null) => void;
		onError?: (error: Error) => void;
	};

	beforeEach(() => {
		mockProcess = createMockChildProcess();
		capturedCallbacks = {};

		vi.mocked(spawnModule.spawnClaude).mockImplementation(options => {
			capturedCallbacks.onStdout = options.onStdout;
			capturedCallbacks.onStderr = options.onStderr;
			capturedCallbacks.onExit = options.onExit;
			capturedCallbacks.onError = options.onError;
			return mockProcess;
		});
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it('should initialize with isRunning false', () => {
		const {result} = renderHook(() => useClaudeProcess('/test'));

		expect(result.current.isRunning).toBe(false);
	});

	it('should initialize with empty output', () => {
		const {result} = renderHook(() => useClaudeProcess('/test'));

		expect(result.current.output).toEqual([]);
	});

	it('should set isRunning to true when spawn is called', () => {
		const {result} = renderHook(() => useClaudeProcess('/test'));

		act(() => {
			result.current.spawn('test prompt');
		});

		expect(result.current.isRunning).toBe(true);
	});

	it('should call spawnClaude with correct arguments', () => {
		const {result} = renderHook(() => useClaudeProcess('/test/dir'));

		act(() => {
			result.current.spawn('my prompt');
		});

		expect(spawnModule.spawnClaude).toHaveBeenCalledWith(
			expect.objectContaining({
				prompt: 'my prompt',
				projectDir: '/test/dir',
			}),
		);
	});

	it('should add stdout data to output', () => {
		const {result} = renderHook(() => useClaudeProcess('/test'));

		act(() => {
			result.current.spawn('test');
		});

		act(() => {
			capturedCallbacks.onStdout?.('line 1');
		});

		act(() => {
			capturedCallbacks.onStdout?.('line 2');
		});

		expect(result.current.output).toEqual(['line 1', 'line 2']);
	});

	it('should add stderr data to output with prefix', () => {
		const {result} = renderHook(() => useClaudeProcess('/test'));

		act(() => {
			result.current.spawn('test');
		});

		act(() => {
			capturedCallbacks.onStderr?.('error message');
		});

		expect(result.current.output).toEqual(['[stderr] error message']);
	});

	it('should set isRunning to false when process exits', () => {
		const {result} = renderHook(() => useClaudeProcess('/test'));

		act(() => {
			result.current.spawn('test');
		});

		expect(result.current.isRunning).toBe(true);

		act(() => {
			capturedCallbacks.onExit?.(0);
		});

		expect(result.current.isRunning).toBe(false);
	});

	it('should reset output when spawning new process', () => {
		const {result} = renderHook(() => useClaudeProcess('/test'));

		act(() => {
			result.current.spawn('test1');
		});

		act(() => {
			capturedCallbacks.onStdout?.('old output');
		});

		expect(result.current.output).toEqual(['old output']);

		act(() => {
			result.current.spawn('test2');
		});

		expect(result.current.output).toEqual([]);
	});

	it('should kill existing process when spawning new one', () => {
		const {result} = renderHook(() => useClaudeProcess('/test'));

		act(() => {
			result.current.spawn('test1');
		});

		act(() => {
			result.current.spawn('test2');
		});

		expect(mockProcess.kill).toHaveBeenCalled();
	});

	it('should kill process when kill is called', () => {
		const {result} = renderHook(() => useClaudeProcess('/test'));

		act(() => {
			result.current.spawn('test');
		});

		act(() => {
			result.current.kill();
		});

		expect(mockProcess.kill).toHaveBeenCalled();
		expect(result.current.isRunning).toBe(false);
	});

	it('should handle kill when no process is running', () => {
		const {result} = renderHook(() => useClaudeProcess('/test'));

		// Should not throw
		expect(() => {
			act(() => {
				result.current.kill();
			});
		}).not.toThrow();
	});

	it('should kill process on unmount', () => {
		const {result, unmount} = renderHook(() => useClaudeProcess('/test'));

		act(() => {
			result.current.spawn('test');
		});

		unmount();

		expect(mockProcess.kill).toHaveBeenCalled();
	});

	it('should not update state after unmount', () => {
		const {result, unmount} = renderHook(() => useClaudeProcess('/test'));

		act(() => {
			result.current.spawn('test');
		});

		unmount();

		// These should not throw or cause React warnings
		expect(() => {
			capturedCallbacks.onStdout?.('data after unmount');
			capturedCallbacks.onStderr?.('error after unmount');
			capturedCallbacks.onExit?.(0);
		}).not.toThrow();
	});

	it('should handle spawn error', () => {
		const {result} = renderHook(() => useClaudeProcess('/test'));

		act(() => {
			result.current.spawn('test');
		});

		act(() => {
			capturedCallbacks.onError?.(new Error('spawn claude ENOENT'));
		});

		expect(result.current.isRunning).toBe(false);
		expect(result.current.output).toContain('[error] spawn claude ENOENT');
	});

	it('should log non-zero exit code', () => {
		const {result} = renderHook(() => useClaudeProcess('/test'));

		act(() => {
			result.current.spawn('test');
		});

		act(() => {
			capturedCallbacks.onExit?.(1);
		});

		expect(result.current.isRunning).toBe(false);
		expect(result.current.output).toContain('[exit code: 1]');
	});

	it('should not log zero exit code', () => {
		const {result} = renderHook(() => useClaudeProcess('/test'));

		act(() => {
			result.current.spawn('test');
		});

		act(() => {
			capturedCallbacks.onExit?.(0);
		});

		expect(result.current.output).not.toContain('[exit code: 0]');
	});

	it('should limit output size to prevent memory issues', () => {
		const {result} = renderHook(() => useClaudeProcess('/test'));

		act(() => {
			result.current.spawn('test');
		});

		// Add more than MAX_OUTPUT (1000) lines
		act(() => {
			for (let i = 0; i < 1100; i++) {
				capturedCallbacks.onStdout?.(`line ${i}`);
			}
		});

		// Should be limited to 1000
		expect(result.current.output.length).toBe(1000);
		// Should keep the most recent lines
		expect(result.current.output[999]).toBe('line 1099');
	});

	it('should not pass sessionId to spawnClaude when not provided', () => {
		const {result} = renderHook(() => useClaudeProcess('/test'));

		act(() => {
			result.current.spawn('my prompt');
		});

		expect(spawnModule.spawnClaude).toHaveBeenCalledWith(
			expect.objectContaining({
				prompt: 'my prompt',
				projectDir: '/test',
				sessionId: undefined,
			}),
		);
	});

	it('should pass sessionId to spawnClaude when provided', () => {
		const {result} = renderHook(() => useClaudeProcess('/test'));

		act(() => {
			result.current.spawn('my prompt', 'abc-123-session');
		});

		expect(spawnModule.spawnClaude).toHaveBeenCalledWith(
			expect.objectContaining({
				prompt: 'my prompt',
				projectDir: '/test',
				sessionId: 'abc-123-session',
			}),
		);
	});
});
