/**
 * Isolation types for spawning Claude Code processes.
 *
 * Controls how the spawned headless Claude Code process is isolated
 * from the project's configuration.
 *
 * IMPORTANT: athena-cli always uses `--setting-sources ""` to completely
 * isolate from Claude Code's settings. All configuration comes from athena's
 * own generated settings file. This ensures athena is fully self-contained
 * and doesn't inherit unexpected behavior from user's Claude settings.
 */

/**
 * Preset isolation levels for common use cases.
 *
 * All presets use full settings isolation (`--setting-sources ""`).
 * The difference is in MCP server access:
 *
 * - `strict`: Block all MCP servers (default)
 * - `minimal`: Allow project MCP servers
 * - `permissive`: Allow project MCP servers (same as minimal for now)
 */
export type IsolationPreset = 'strict' | 'minimal' | 'permissive';

/**
 * Configuration for isolating the spawned Claude Code process.
 *
 * These options map to Claude Code CLI flags. See:
 * https://docs.anthropic.com/en/docs/claude-code/cli-reference
 */
export type IsolationConfig = {
	/** Use a preset configuration instead of custom settings */
	preset?: IsolationPreset;

	// === Tool Access ===
	/** Tools to allow without prompting (whitelist). See permission rule syntax. */
	allowedTools?: string[];
	/** Tools to remove from model context (blacklist) */
	disallowedTools?: string[];
	/** Restrict which built-in tools Claude can use ("" to disable all, "default" for all, or tool names) */
	tools?: string;

	// === MCP Configuration ===
	/** Path to custom MCP config file or JSON string */
	mcpConfig?: string;
	/** Ignore project MCP servers (default: true for strict isolation) */
	strictMcpConfig?: boolean;

	// === Permission & Security ===
	/** Permission mode for tool execution (e.g., "plan", "default") */
	permissionMode?: string;
	/** Skip all permission prompts (use with caution) */
	dangerouslySkipPermissions?: boolean;
	/** Enable permission bypassing as an option without immediately activating it */
	allowDangerouslySkipPermissions?: boolean;

	// === Directories ===
	/** Additional directories to grant Claude access to (passed as --add-dir flags) */
	additionalDirectories?: string[];

	// === Model & Agent ===
	/** Model to use (alias like "sonnet"/"opus" or full model name) */
	model?: string;
	/** Fallback model when default is overloaded */
	fallbackModel?: string;
	/** Specify an agent for the session */
	agent?: string;
	/** Define custom subagents dynamically via JSON object */
	agents?: Record<
		string,
		{
			description: string;
			prompt: string;
			tools?: string[];
			model?: 'sonnet' | 'opus' | 'haiku' | 'inherit';
		}
	>;

	// === System Prompt ===
	/** Replace the entire system prompt with custom text */
	systemPrompt?: string;
	/** Path to file containing system prompt replacement */
	systemPromptFile?: string;
	/** Append custom text to the end of the default system prompt */
	appendSystemPrompt?: string;
	/** Path to file containing text to append to system prompt */
	appendSystemPromptFile?: string;

	// === Session Management ===
	/** Continue most recent conversation in current directory */
	continueSession?: boolean;
	/** When resuming, create a new session ID instead of reusing the original */
	forkSession?: boolean;
	/** Disable session persistence (sessions not saved to disk) */
	noSessionPersistence?: boolean;

	// === Output & Debugging ===
	/** Enable verbose logging (full turn-by-turn output) */
	verbose?: boolean;
	/** Enable debug mode with optional category filtering (e.g., "api,hooks") */
	debug?: string | boolean;

	// === Limits ===
	/** Maximum number of agentic turns before stopping */
	maxTurns?: number;
	/** Maximum dollar amount for API calls */
	maxBudgetUsd?: number;

	// === Plugins ===
	/** Load plugins from directories (repeatable) */
	pluginDirs?: string[];

	// === Features ===
	/** Disable all skills and slash commands */
	disableSlashCommands?: boolean;
	/** Enable Chrome browser integration */
	chrome?: boolean;
	/** Disable Chrome browser integration */
	noChrome?: boolean;

	// === Structured Output ===
	/** JSON Schema for validated output (requires json output format) */
	jsonSchema?: string | Record<string, unknown>;
	/** Include partial streaming events in output */
	includePartialMessages?: boolean;
};

/**
 * Preset configurations for common isolation use cases.
 *
 * All presets use `--setting-sources ""` for full isolation from Claude's
 * settings. The presets differ in MCP server access and allowed tools.
 */
export const ISOLATION_PRESETS: Record<
	IsolationPreset,
	Partial<IsolationConfig>
> = {
	/**
	 * Strict isolation (default):
	 * - No Claude settings loaded (full isolation)
	 * - Block all MCP servers
	 * - Allow core code tools (read, edit, search, bash)
	 * - No network or MCP tools
	 */
	strict: {
		strictMcpConfig: true,
		allowedTools: ['Read', 'Edit', 'Glob', 'Grep', 'Bash', 'Write'],
	},

	/**
	 * Minimal isolation:
	 * - No Claude settings loaded (full isolation)
	 * - Allow project MCP servers
	 * - Allow core tools + web access + subagents
	 */
	minimal: {
		strictMcpConfig: false,
		allowedTools: [
			'Read',
			'Edit',
			'Write',
			'Glob',
			'Grep',
			'Bash',
			'WebSearch',
			'WebFetch',
			'Task',
			'Skill',
			'mcp__*',
		],
	},

	/**
	 * Permissive:
	 * - No Claude settings loaded (full isolation)
	 * - Allow project MCP servers
	 * - Allow all tools including MCP wildcard
	 */
	permissive: {
		strictMcpConfig: false,
		allowedTools: [
			'Read',
			'Edit',
			'Write',
			'Glob',
			'Grep',
			'Bash',
			'WebSearch',
			'WebFetch',
			'Task',
			'Skill',
			'NotebookEdit',
			'mcp__*',
		],
	},
};

/**
 * Resolves an isolation preset or config into a full config.
 */
export function resolveIsolationConfig(
	isolation?: IsolationConfig | IsolationPreset,
): IsolationConfig {
	// Default to strict isolation
	if (!isolation) {
		return {...ISOLATION_PRESETS.strict};
	}

	// If it's a string preset, expand it
	if (typeof isolation === 'string') {
		return {...ISOLATION_PRESETS[isolation]};
	}

	// If it has a preset, merge with custom settings
	if (isolation.preset) {
		return {
			...ISOLATION_PRESETS[isolation.preset],
			...isolation,
		};
	}

	// Return as-is
	return isolation;
}
