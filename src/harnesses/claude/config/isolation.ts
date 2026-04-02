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

/** Preset key selecting an isolation profile from {@link ISOLATION_PRESETS}. */
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
 * Claude Code first-party cloud integrations to explicitly block.
 *
 * These are Anthropic-hosted MCP services (Gmail, Calendar, Atlassian) that
 * Claude Code injects regardless of `--setting-sources` or `--strict-mcp-config`.
 * We block them via `--disallowedTools` as a belt-and-suspenders measure.
 */
const DISALLOWED_FIRST_PARTY_MCPS = [
	'mcp__claude_ai_Gmail__*',
	'mcp__claude_ai_Google_Calendar__*',
	'mcp__claude_ai_Atlassian__*',
];

/**
 * Preset configurations for common isolation use cases.
 *
 * All presets share:
 * - `--setting-sources ""` — full isolation from Claude Code settings
 * - `--strict-mcp-config` — only MCP servers from athena's `--mcp-config`
 * - `--disallowedTools` — explicitly block first-party cloud integrations
 *
 * Presets differ only in the allowedTools whitelist:
 * - `strict`:     Core code tools only (default)
 * - `minimal`:    Core + web + subagents + MCP wildcard
 * - `permissive`: Core + web + subagents + notebooks + MCP wildcard
 */
export const ISOLATION_PRESETS: Record<
	IsolationPreset,
	Partial<IsolationConfig>
> = {
	/**
	 * Strict isolation (default):
	 * - No Claude settings loaded (full isolation)
	 * - Only MCP servers from athena's --mcp-config
	 * - Allow core code tools (read, edit, search, bash)
	 */
	strict: {
		strictMcpConfig: true,
		allowedTools: ['Read', 'Edit', 'Glob', 'Grep', 'Bash', 'Write'],
		disallowedTools: DISALLOWED_FIRST_PARTY_MCPS,
	},

	/**
	 * Minimal isolation:
	 * - No Claude settings loaded (full isolation)
	 * - Only MCP servers from athena's --mcp-config
	 * - Allow core tools + web access + subagents + plugin MCP
	 */
	minimal: {
		strictMcpConfig: true,
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
			'Agent',
			'Skill',
			'mcp__*',
		],
		disallowedTools: DISALLOWED_FIRST_PARTY_MCPS,
	},

	/**
	 * Permissive:
	 * - No Claude settings loaded (full isolation)
	 * - Only MCP servers from athena's --mcp-config
	 * - Allow all tools including MCP wildcard + notebooks
	 */
	permissive: {
		strictMcpConfig: true,
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
			'Agent',
			'Skill',
			'NotebookEdit',
			'mcp__*',
		],
		disallowedTools: DISALLOWED_FIRST_PARTY_MCPS,
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
