/**
 * Claude process types.
 *
 * Types for spawning and managing Claude Code headless processes.
 */

import {type IsolationConfig, type IsolationPreset} from './isolation.js';

/**
 * Options for spawning a Claude Code headless process.
 */
export type SpawnClaudeOptions = {
	/** The prompt to send to Claude */
	prompt: string;
	/** Project directory used as cwd for the Claude process */
	projectDir: string;
	/** Instance ID of the athena-cli process (used for socket routing) */
	instanceId: number;
	/** Optional session ID to resume an existing conversation */
	sessionId?: string;
	/**
	 * Isolation configuration for the spawned Claude process.
	 * Controls which settings/hooks/MCP servers are loaded.
	 * Defaults to 'strict' preset (user settings only, athena hooks injected).
	 */
	isolation?: IsolationConfig | IsolationPreset;
	/** Called when stdout data is received */
	onStdout?: (data: string) => void;
	/** Called when stderr data is received */
	onStderr?: (data: string) => void;
	/** Called when the process exits */
	onExit?: (code: number | null) => void;
	/** Called when spawn fails (e.g., claude command not found) */
	onError?: (error: Error) => void;
};

/**
 * Result returned by the useClaudeProcess hook.
 */
export type UseClaudeProcessResult = {
	spawn: (
		prompt: string,
		sessionId?: string,
		isolation?: Partial<IsolationConfig>,
	) => Promise<void>;
	isRunning: boolean;
	output: string[];
	kill: () => Promise<void>;
};
