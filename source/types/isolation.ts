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
 */
export type IsolationConfig = {
	/** Use a preset configuration instead of custom settings */
	preset?: IsolationPreset;
	/** Tools to allow (whitelist) */
	allowedTools?: string[];
	/** Tools to disallow (blacklist) */
	disallowedTools?: string[];
	/** Path to custom MCP config file */
	mcpConfig?: string;
	/** Ignore project MCP servers (default: true for strict isolation) */
	strictMcpConfig?: boolean;
	/** Permission mode for tool execution */
	permissionMode?: string;
	/** Additional directories to grant Claude access to (passed as --add-dir flags) */
	additionalDirectories?: string[];
};

/**
 * Preset configurations for common isolation use cases.
 *
 * All presets use `--setting-sources ""` for full isolation from Claude's
 * settings. The presets differ only in MCP server access.
 */
export const ISOLATION_PRESETS: Record<
	IsolationPreset,
	Partial<IsolationConfig>
> = {
	/**
	 * Strict isolation (default):
	 * - No Claude settings loaded (full isolation)
	 * - Block all MCP servers
	 * - All config comes from athena's settings file
	 */
	strict: {
		strictMcpConfig: true,
	},

	/**
	 * Minimal isolation:
	 * - No Claude settings loaded (full isolation)
	 * - Allow project MCP servers (for tools that need external services)
	 */
	minimal: {
		strictMcpConfig: false,
	},

	/**
	 * Permissive:
	 * - No Claude settings loaded (full isolation)
	 * - Allow project MCP servers
	 */
	permissive: {
		strictMcpConfig: false,
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
