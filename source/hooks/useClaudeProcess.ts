import {useCallback, useEffect, useRef, useState} from 'react';
import {type ChildProcess} from 'node:child_process';
import {spawnClaude} from '../utils/spawnClaude.js';

// Maximum output lines to keep in memory to prevent unbounded growth
const MAX_OUTPUT = 1000;

export type UseClaudeProcessResult = {
	spawn: (prompt: string) => void;
	isRunning: boolean;
	output: string[];
	kill: () => void;
};

/**
 * React hook to manage Claude headless process lifecycle.
 *
 * Spawns Claude Code with `-p` flag and tracks its state.
 * Hook events are received via the separate hook server (useHookServer).
 */
export function useClaudeProcess(projectDir: string): UseClaudeProcessResult {
	const processRef = useRef<ChildProcess | null>(null);
	const isMountedRef = useRef(true);
	const [isRunning, setIsRunning] = useState(false);
	const [output, setOutput] = useState<string[]>([]);

	const kill = useCallback(() => {
		if (processRef.current) {
			processRef.current.kill();
			processRef.current = null;
			if (isMountedRef.current) {
				setIsRunning(false);
			}
		}
	}, []);

	const spawn = useCallback(
		(prompt: string) => {
			// Kill existing process if running
			if (processRef.current) {
				processRef.current.kill();
			}

			setOutput([]);
			setIsRunning(true);

			const child = spawnClaude({
				prompt,
				projectDir,
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
					if (!isMountedRef.current) return;
					processRef.current = null;
					setIsRunning(false);
					if (code !== 0 && code !== null) {
						setOutput(prev => [...prev, `[exit code: ${code}]`]);
					}
				},
				onError: (error: Error) => {
					if (!isMountedRef.current) return;
					processRef.current = null;
					setIsRunning(false);
					setOutput(prev => [...prev, `[error] ${error.message}`]);
				},
			});

			processRef.current = child;
		},
		[projectDir],
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
