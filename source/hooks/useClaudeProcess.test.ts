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
	const TEST_INSTANCE_ID = 12345;
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
		const {result} = renderHook(() =>
			useClaudeProcess('/test', TEST_INSTANCE_ID),
		);

		expect(result.current.isRunning).toBe(false);
	});

	it('should initialize with empty output', () => {
		const {result} = renderHook(() =>
			useClaudeProcess('/test', TEST_INSTANCE_ID),
		);

		expect(result.current.output).toEqual([]);
	});

	it('should set isRunning to true when spawn is called', async () => {
		const {result} = renderHook(() =>
			useClaudeProcess('/test', TEST_INSTANCE_ID),
		);

		await act(async () => {
			await result.current.spawn('test prompt');
		});

		expect(result.current.isRunning).toBe(true);
	});

	it('should call spawnClaude with correct arguments including instanceId', async () => {
		const {result} = renderHook(() =>
			useClaudeProcess('/test/dir', TEST_INSTANCE_ID),
		);

		await act(async () => {
			await result.current.spawn('my prompt');
		});

		expect(spawnModule.spawnClaude).toHaveBeenCalledWith(
			expect.objectContaining({
				prompt: 'my prompt',
				projectDir: '/test/dir',
				instanceId: TEST_INSTANCE_ID,
			}),
		);
	});

	it('should add stdout data to output', async () => {
		const {result} = renderHook(() =>
			useClaudeProcess('/test', TEST_INSTANCE_ID),
		);

		await act(async () => {
			await result.current.spawn('test');
		});

		act(() => {
			capturedCallbacks.onStdout?.('line 1');
		});

		act(() => {
			capturedCallbacks.onStdout?.('line 2');
		});

		expect(result.current.output).toEqual(['line 1', 'line 2']);
	});

	it('should add stderr data to output with prefix', async () => {
		const {result} = renderHook(() =>
			useClaudeProcess('/test', TEST_INSTANCE_ID),
		);

		await act(async () => {
			await result.current.spawn('test');
		});

		act(() => {
			capturedCallbacks.onStderr?.('error message');
		});

		expect(result.current.output).toEqual(['[stderr] error message']);
	});

	it('should set isRunning to false when process exits', async () => {
		const {result} = renderHook(() =>
			useClaudeProcess('/test', TEST_INSTANCE_ID),
		);

		await act(async () => {
			await result.current.spawn('test');
		});

		expect(result.current.isRunning).toBe(true);

		act(() => {
			capturedCallbacks.onExit?.(0);
		});

		expect(result.current.isRunning).toBe(false);
	});

	it('should reset output when spawning new process', async () => {
		const {result} = renderHook(() =>
			useClaudeProcess('/test', TEST_INSTANCE_ID),
		);

		await act(async () => {
			await result.current.spawn('test1');
		});

		act(() => {
			capturedCallbacks.onStdout?.('old output');
		});

		expect(result.current.output).toEqual(['old output']);

		// Trigger exit so spawn can complete kill
		await act(async () => {
			const spawnPromise = result.current.spawn('test2');
			capturedCallbacks.onExit?.(0);
			await spawnPromise;
		});

		expect(result.current.output).toEqual([]);
	});

	it('should kill existing process when spawning new one and wait for exit', async () => {
		const {result} = renderHook(() =>
			useClaudeProcess('/test', TEST_INSTANCE_ID),
		);

		await act(async () => {
			await result.current.spawn('test1');
		});

		// Spawn new process - kill will wait for exit
		await act(async () => {
			const spawnPromise = result.current.spawn('test2');
			// Simulate process exit
			capturedCallbacks.onExit?.(0);
			await spawnPromise;
		});

		expect(mockProcess.kill).toHaveBeenCalled();
	});

	it('should kill process when kill is called and wait for exit', async () => {
		const {result} = renderHook(() =>
			useClaudeProcess('/test', TEST_INSTANCE_ID),
		);

		await act(async () => {
			await result.current.spawn('test');
		});

		await act(async () => {
			const killPromise = result.current.kill();
			// Simulate process exit
			capturedCallbacks.onExit?.(0);
			await killPromise;
		});

		expect(mockProcess.kill).toHaveBeenCalled();
		expect(result.current.isRunning).toBe(false);
	});

	it('should handle kill when no process is running', async () => {
		const {result} = renderHook(() =>
			useClaudeProcess('/test', TEST_INSTANCE_ID),
		);

		// Should not throw
		await expect(
			act(async () => {
				await result.current.kill();
			}),
		).resolves.not.toThrow();
	});

	it('should kill process on unmount', async () => {
		const {result, unmount} = renderHook(() =>
			useClaudeProcess('/test', TEST_INSTANCE_ID),
		);

		await act(async () => {
			await result.current.spawn('test');
		});

		unmount();

		expect(mockProcess.kill).toHaveBeenCalled();
	});

	it('should not update state after unmount', async () => {
		const {result, unmount} = renderHook(() =>
			useClaudeProcess('/test', TEST_INSTANCE_ID),
		);

		await act(async () => {
			await result.current.spawn('test');
		});

		unmount();

		// These should not throw or cause React warnings
		expect(() => {
			capturedCallbacks.onStdout?.('data after unmount');
			capturedCallbacks.onStderr?.('error after unmount');
			capturedCallbacks.onExit?.(0);
		}).not.toThrow();
	});

	it('should handle spawn error', async () => {
		const {result} = renderHook(() =>
			useClaudeProcess('/test', TEST_INSTANCE_ID),
		);

		await act(async () => {
			await result.current.spawn('test');
		});

		act(() => {
			capturedCallbacks.onError?.(new Error('spawn claude ENOENT'));
		});

		expect(result.current.isRunning).toBe(false);
		expect(result.current.output).toContain('[error] spawn claude ENOENT');
	});

	it('should log non-zero exit code', async () => {
		const {result} = renderHook(() =>
			useClaudeProcess('/test', TEST_INSTANCE_ID),
		);

		await act(async () => {
			await result.current.spawn('test');
		});

		act(() => {
			capturedCallbacks.onExit?.(1);
		});

		expect(result.current.isRunning).toBe(false);
		expect(result.current.output).toContain('[exit code: 1]');
	});

	it('should not log zero exit code', async () => {
		const {result} = renderHook(() =>
			useClaudeProcess('/test', TEST_INSTANCE_ID),
		);

		await act(async () => {
			await result.current.spawn('test');
		});

		act(() => {
			capturedCallbacks.onExit?.(0);
		});

		expect(result.current.output).not.toContain('[exit code: 0]');
	});

	it('should limit output size to prevent memory issues', async () => {
		const {result} = renderHook(() =>
			useClaudeProcess('/test', TEST_INSTANCE_ID),
		);

		await act(async () => {
			await result.current.spawn('test');
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

	it('should not pass sessionId to spawnClaude when not provided', async () => {
		const {result} = renderHook(() =>
			useClaudeProcess('/test', TEST_INSTANCE_ID),
		);

		await act(async () => {
			await result.current.spawn('my prompt');
		});

		expect(spawnModule.spawnClaude).toHaveBeenCalledWith(
			expect.objectContaining({
				prompt: 'my prompt',
				projectDir: '/test',
				instanceId: TEST_INSTANCE_ID,
				sessionId: undefined,
			}),
		);
	});

	it('should pass sessionId to spawnClaude when provided', async () => {
		const {result} = renderHook(() =>
			useClaudeProcess('/test', TEST_INSTANCE_ID),
		);

		await act(async () => {
			await result.current.spawn('my prompt', 'abc-123-session');
		});

		expect(spawnModule.spawnClaude).toHaveBeenCalledWith(
			expect.objectContaining({
				prompt: 'my prompt',
				projectDir: '/test',
				instanceId: TEST_INSTANCE_ID,
				sessionId: 'abc-123-session',
			}),
		);
	});

	it('should resolve kill after timeout if process does not exit', async () => {
		vi.useFakeTimers();
		const {result} = renderHook(() =>
			useClaudeProcess('/test', TEST_INSTANCE_ID),
		);

		await act(async () => {
			await result.current.spawn('test');
		});

		let killResolved = false;
		let killPromise: Promise<void>;

		act(() => {
			killPromise = result.current.kill();
			killPromise.then(() => {
				killResolved = true;
			});
		});

		// Should not be resolved yet (no exit event, no timeout)
		expect(killResolved).toBe(false);

		// Advance timer past KILL_TIMEOUT_MS (3000ms)
		await act(async () => {
			vi.advanceTimersByTime(3100);
		});

		// Wait for promise to resolve
		await act(async () => {
			await killPromise!;
		});

		expect(killResolved).toBe(true);
		expect(result.current.isRunning).toBe(false);

		vi.useRealTimers();
	});
});
