import {useCallback, useEffect, useRef, useState} from 'react';
import {type ChildProcess} from 'node:child_process';
import {spawnClaude} from '../utils/spawnClaude.js';
import {type UseClaudeProcessResult} from '../types/process.js';

// Re-export type for backwards compatibility
export type {UseClaudeProcessResult};

// Maximum output lines to keep in memory to prevent unbounded growth
const MAX_OUTPUT = 1000;
// Timeout for waiting for process to exit during kill
const KILL_TIMEOUT_MS = 3000;

/**
 * React hook to manage Claude headless process lifecycle.
 *
 * Spawns Claude Code with `-p` flag and tracks its state.
 * Hook events are received via the separate hook server (useHookServer).
 */
export function useClaudeProcess(
	projectDir: string,
	instanceId: number,
): UseClaudeProcessResult {
	const processRef = useRef<ChildProcess | null>(null);
	const isMountedRef = useRef(true);
	const exitResolverRef = useRef<(() => void) | null>(null);
	const [isRunning, setIsRunning] = useState(false);
	const [output, setOutput] = useState<string[]>([]);

	const kill = useCallback(async (): Promise<void> => {
		if (!processRef.current) {
			return;
		}

		// Create promise to wait for process exit
		const exitPromise = new Promise<void>(resolve => {
			exitResolverRef.current = resolve;
		});

		// Set a timeout fallback in case process doesn't exit cleanly
		let timeoutId: ReturnType<typeof setTimeout>;
		const timeoutPromise = new Promise<void>(resolve => {
			timeoutId = setTimeout(resolve, KILL_TIMEOUT_MS);
		});

		processRef.current.kill();

		// Wait for exit or timeout
		await Promise.race([exitPromise, timeoutPromise]);

		// Clean up timeout to prevent memory leak
		clearTimeout(timeoutId!);

		// Clean up
		exitResolverRef.current = null;
		processRef.current = null;
		if (isMountedRef.current) {
			setIsRunning(false);
		}
	}, []);

	const spawn = useCallback(
		async (prompt: string, sessionId?: string): Promise<void> => {
			// Kill existing process if running and wait for it to exit
			await kill();

			setOutput([]);
			setIsRunning(true);

			const child = spawnClaude({
				prompt,
				projectDir,
				instanceId,
				sessionId,
				onStdout: (data: string) => {
					if (!isMountedRef.current) return;
					setOutput(prev => {
						const updated = [...prev, data];
						// Limit output size to prevent memory issues
						if (updated.length > MAX_OUTPUT) {
							return updated.slice(-MAX_OUTPUT);
						}
						return updated;
					});
				},
				onStderr: (data: string) => {
					if (!isMountedRef.current) return;
					setOutput(prev => {
						const updated = [...prev, `[stderr] ${data}`];
						if (updated.length > MAX_OUTPUT) {
							return updated.slice(-MAX_OUTPUT);
						}
						return updated;
					});
				},
				onExit: (code: number | null) => {
					// Resolve any pending kill promise
					if (exitResolverRef.current) {
						exitResolverRef.current();
						exitResolverRef.current = null;
					}
					if (!isMountedRef.current) return;
					processRef.current = null;
					setIsRunning(false);
					if (code !== 0 && code !== null) {
						setOutput(prev => [...prev, `[exit code: ${code}]`]);
					}
				},
				onError: (error: Error) => {
					// Resolve any pending kill promise
					if (exitResolverRef.current) {
						exitResolverRef.current();
						exitResolverRef.current = null;
					}
					if (!isMountedRef.current) return;
					processRef.current = null;
					setIsRunning(false);
					setOutput(prev => [...prev, `[error] ${error.message}`]);
				},
			});

			processRef.current = child;
		},
		[projectDir, instanceId, kill],
	);

	// Cleanup on unmount - kill any running process
	useEffect(() => {
		isMountedRef.current = true;

		return () => {
			isMountedRef.current = false;
			if (processRef.current) {
				processRef.current.kill();
				processRef.current = null;
			}
		};
	}, []);

	return {
		spawn,
		isRunning,
		output,
		kill,
	};
}
