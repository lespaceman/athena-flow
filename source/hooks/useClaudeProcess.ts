import {useCallback, useEffect, useRef, useState} from 'react';
import {type ChildProcess} from 'node:child_process';
import {spawnClaude} from '../utils/spawnClaude.js';
import {type UseClaudeProcessResult} from '../types/process.js';
import {
	type IsolationConfig,
	type IsolationPreset,
	resolveIsolationConfig,
} from '../types/isolation.js';
import type {TokenUsage} from '../types/headerMetrics.js';
import {createTokenAccumulator} from '../utils/parseStreamJson.js';
import type {WorkflowConfig} from '../workflows/types.js';
import {
	applyPromptTemplate,
	writeLoopState,
	removeLoopState,
} from '../workflows/index.js';

// Re-export type for backwards compatibility
export type {UseClaudeProcessResult};

/**
 * Merge isolation layers: base preset -> plugin MCP config -> per-command override.
 * Returns the original preset unchanged when no overrides are needed.
 */
function mergeIsolation(
	base: IsolationConfig | IsolationPreset | undefined,
	pluginMcpConfig: string | undefined,
	perCommand: Partial<IsolationConfig> | undefined,
): IsolationConfig | IsolationPreset | undefined {
	if (!pluginMcpConfig && !perCommand) return base;

	return {
		...resolveIsolationConfig(base),
		...(pluginMcpConfig ? {mcpConfig: pluginMcpConfig} : {}),
		...(perCommand ?? {}),
	};
}

// Maximum output lines to keep in memory to prevent unbounded growth
const MAX_OUTPUT = 1000;
// Timeout for waiting for process to exit during kill
const KILL_TIMEOUT_MS = 3000;

const NULL_TOKENS: TokenUsage = {
	input: null,
	output: null,
	cacheRead: null,
	cacheWrite: null,
	total: null,
	contextSize: null,
};

/**
 * React hook to manage Claude headless process lifecycle.
 *
 * Spawns Claude Code with `-p` flag and tracks its state.
 * Hook events are received via the separate hook server (useHookServer).
 *
 * By default, uses strict isolation (user settings only, athena hooks injected).
 */
// jq filter that extracts text content from assistant messages
const JQ_ASSISTANT_TEXT_FILTER =
	'select(.type == "message" and .role == "assistant") | .content[] | select(.type == "text") | .text';

export function useClaudeProcess(
	projectDir: string,
	instanceId: number,
	isolation?: IsolationConfig | IsolationPreset,
	pluginMcpConfig?: string,
	verbose?: boolean,
	workflow?: WorkflowConfig,
): UseClaudeProcessResult {
	const processRef = useRef<ChildProcess | null>(null);
	const abortRef = useRef<AbortController>(new AbortController());
	const exitResolverRef = useRef<(() => void) | null>(null);
	const tokenAccRef = useRef(createTokenAccumulator());
	const [isRunning, setIsRunning] = useState(false);
	const [output, setOutput] = useState<string[]>([]);
	const [streamingText, setStreamingText] = useState('');
	const [tokenUsage, setTokenUsage] = useState<TokenUsage>(NULL_TOKENS);

	const sendInterrupt = useCallback((): void => {
		if (!processRef.current) return;
		processRef.current.kill('SIGINT');
	}, []);

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

		// Clean up ralph-loop state to prevent zombie loops
		if (workflow?.loop?.enabled) {
			removeLoopState(projectDir);
		}

		// Wait for exit or timeout
		await Promise.race([exitPromise, timeoutPromise]);

		// Clean up timeout to prevent memory leak
		clearTimeout(timeoutId!);

		// Clean up
		exitResolverRef.current = null;
		processRef.current = null;
		if (!abortRef.current.signal.aborted) {
			setIsRunning(false);
		}
	}, []);

	const spawn = useCallback(
		async (
			prompt: string,
			sessionId?: string,
			perCallIsolation?: Partial<IsolationConfig>,
		): Promise<void> => {
			// Kill existing process if running and wait for it to exit
			await kill();

			setOutput([]);
			setStreamingText('');
			setIsRunning(true);
			tokenAccRef.current.reset();
			// Preserve last known contextSize across runs — it stays valid until
			// the new run reports updated context numbers.
			setTokenUsage(prev => ({
				...NULL_TOKENS,
				contextSize: prev.contextSize,
			}));

			// Apply workflow: transform prompt and arm loop
			let effectivePrompt = prompt;
			if (workflow) {
				effectivePrompt = applyPromptTemplate(workflow.promptTemplate, prompt);
				if (workflow.loop) {
					removeLoopState(projectDir); // Clean any stale state
					writeLoopState(projectDir, effectivePrompt, workflow.loop);
				}
			}

			const child = spawnClaude({
				prompt: effectivePrompt,
				projectDir,
				instanceId,
				sessionId,
				isolation: mergeIsolation(isolation, pluginMcpConfig, perCallIsolation),
				...(verbose
					? {
							jqFilter: JQ_ASSISTANT_TEXT_FILTER,
							onFilteredStdout: (data: string) => {
								if (abortRef.current.signal.aborted) return;
								setStreamingText(prev => prev + data);
							},
							onJqStderr: (data: string) => {
								if (abortRef.current.signal.aborted) return;
								setOutput(prev => [...prev, `[jq] ${data}`]);
							},
						}
					: {}),
				onStdout: (data: string) => {
					if (abortRef.current.signal.aborted) return;
					// Parse stream-json for token usage
					tokenAccRef.current.feed(data);
					setTokenUsage(tokenAccRef.current.getUsage());

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
					if (abortRef.current.signal.aborted) return;
					setOutput(prev => {
						const updated = [...prev, `[stderr] ${data}`];
						if (updated.length > MAX_OUTPUT) {
							return updated.slice(-MAX_OUTPUT);
						}
						return updated;
					});
				},
				onExit: (code: number | null) => {
					// Flush any remaining buffered data for final token count
					tokenAccRef.current.flush();
					if (!abortRef.current.signal.aborted) {
						setTokenUsage(tokenAccRef.current.getUsage());
					}

					// Resolve any pending kill promise
					if (exitResolverRef.current) {
						exitResolverRef.current();
						exitResolverRef.current = null;
					}
					if (abortRef.current.signal.aborted) return;
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
					if (abortRef.current.signal.aborted) return;
					processRef.current = null;
					setIsRunning(false);
					setOutput(prev => [...prev, `[error] ${error.message}`]);
				},
			});

			processRef.current = child;
		},
		[
			projectDir,
			instanceId,
			isolation,
			pluginMcpConfig,
			verbose,
			workflow,
			kill,
		],
	);

	// Cleanup on unmount - kill any running process
	useEffect(() => {
		abortRef.current = new AbortController();

		return () => {
			abortRef.current.abort();
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
		sendInterrupt,
		streamingText,
		tokenUsage,
	};
}
