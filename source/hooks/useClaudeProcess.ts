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
	createLoopManager,
	type LoopManager,
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

export type UseClaudeProcessOptions = {
	initialTokens?: TokenUsage | null;
	onExitTokens?: (tokens: TokenUsage) => void;
};

export function useClaudeProcess(
	projectDir: string,
	instanceId: number,
	isolation?: IsolationConfig | IsolationPreset,
	pluginMcpConfig?: string,
	verbose?: boolean,
	workflow?: WorkflowConfig,
	options?: UseClaudeProcessOptions,
): UseClaudeProcessResult {
	const processRef = useRef<ChildProcess | null>(null);
	const abortRef = useRef<AbortController>(new AbortController());
	const exitResolverRef = useRef<(() => void) | null>(null);
	const tokenAccRef = useRef(createTokenAccumulator());
	const loopManagerRef = useRef<LoopManager | null>(null);
	const tokenBaseRef = useRef({
		input: options?.initialTokens?.input ?? 0,
		output: options?.initialTokens?.output ?? 0,
		cacheRead: options?.initialTokens?.cacheRead ?? 0,
		cacheWrite: options?.initialTokens?.cacheWrite ?? 0,
	});
	const [isRunning, setIsRunning] = useState(false);
	const [output, setOutput] = useState<string[]>([]);
	const [streamingText, setStreamingText] = useState('');
	const onExitTokensRef = useRef(options?.onExitTokens);
	onExitTokensRef.current = options?.onExitTokens;
	const [tokenUsage, setTokenUsage] = useState<TokenUsage>(
		() => options?.initialTokens ?? NULL_TOKENS,
	);
	const tokenUsageRef = useRef(tokenUsage);
	tokenUsageRef.current = tokenUsage;

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

		// Clean up loop tracker to prevent zombie loops
		loopManagerRef.current?.cleanup();
		loopManagerRef.current = null;

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
			// Capture cumulative base before this spawn (input/output/cache carry forward,
			// contextSize resets per-process since the new process reports its own).
			const current = tokenUsageRef.current;
			tokenBaseRef.current = {
				input: current.input ?? 0,
				output: current.output ?? 0,
				cacheRead: current.cacheRead ?? 0,
				cacheWrite: current.cacheWrite ?? 0,
			};

			// Apply workflow: transform prompt and arm loop
			let effectivePrompt = prompt;
			if (workflow) {
				effectivePrompt = applyPromptTemplate(workflow.promptTemplate, prompt);
				if (workflow.loop?.enabled) {
					// Clean up previous loop manager
					loopManagerRef.current?.cleanup();
					const trackerPath = `${projectDir}/.athena/sessions/${sessionId ?? 'default'}/loop-tracker.md`;
					const mgr = createLoopManager(trackerPath, workflow.loop);
					mgr.initialize();
					loopManagerRef.current = mgr;
				}
			}

			const child = spawnClaude({
				prompt: effectivePrompt,
				projectDir,
				instanceId,
				sessionId,
				isolation: mergeIsolation(isolation, pluginMcpConfig, perCallIsolation),
				env: workflow?.env,
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
					// Parse stream-json for token usage — merge with cumulative base
					tokenAccRef.current.feed(data);
					const acc = tokenAccRef.current.getUsage();
					const base = tokenBaseRef.current;
					setTokenUsage({
						input: (base.input || 0) + (acc.input ?? 0) || null,
						output: (base.output || 0) + (acc.output ?? 0) || null,
						cacheRead: (base.cacheRead || 0) + (acc.cacheRead ?? 0) || null,
						cacheWrite: (base.cacheWrite || 0) + (acc.cacheWrite ?? 0) || null,
						total:
							(base.input || 0) +
								(acc.input ?? 0) +
								(base.output || 0) +
								(acc.output ?? 0) || null,
						contextSize: acc.contextSize,
					});

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
					const finalAcc = tokenAccRef.current.getUsage();
					if (!abortRef.current.signal.aborted) {
						const base = tokenBaseRef.current;
						setTokenUsage({
							input: (base.input || 0) + (finalAcc.input ?? 0) || null,
							output: (base.output || 0) + (finalAcc.output ?? 0) || null,
							cacheRead:
								(base.cacheRead || 0) + (finalAcc.cacheRead ?? 0) || null,
							cacheWrite:
								(base.cacheWrite || 0) + (finalAcc.cacheWrite ?? 0) || null,
							total:
								(base.input || 0) +
									(finalAcc.input ?? 0) +
									(base.output || 0) +
									(finalAcc.output ?? 0) || null,
							contextSize: finalAcc.contextSize,
						});
					}
					// Persist this process's own tokens (not cumulative)
					onExitTokensRef.current?.(finalAcc);

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
		loopManager: loopManagerRef.current,
	};
}
