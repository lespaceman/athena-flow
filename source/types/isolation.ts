/**
 * Isolation types for spawning Claude Code processes.
 *
 * Controls how the spawned headless Claude Code process is isolated
 * from the project's configuration.
 */

/**
 * Preset isolation levels for common use cases.
 *
 * - `strict`: User settings only, no project hooks/MCP/plugins (default)
 * - `minimal`: User settings only, but allow project MCP servers
 * - `permissive`: User + project settings, full project access
 */
export type IsolationPreset = 'strict' | 'minimal' | 'permissive';

/**
 * Setting source levels that Claude Code can load from.
 */
export type SettingSource = 'user' | 'project' | 'local';

/**
 * Configuration for isolating the spawned Claude Code process.
 */
export type IsolationConfig = {
	/** Use a preset configuration instead of custom settings */
	preset?: IsolationPreset;
	/** Which setting sources to load (default: ['user'] for strict isolation) */
	settingSources?: SettingSource[];
	/** Tools to allow (whitelist) */
	allowedTools?: string[];
	/** Tools to disallow (blacklist) */
	disallowedTools?: string[];
	/** Path to custom MCP config file */
	mcpConfig?: string;
	/** Ignore project MCP servers */
	strictMcpConfig?: boolean;
	/** Permission mode for tool execution */
	permissionMode?: string;
	/** Additional directories to grant Claude access to (passed as --add-dir flags) */
	additionalDirectories?: string[];
};

/**
 * Preset configurations for common isolation use cases.
 */
export const ISOLATION_PRESETS: Record<
	IsolationPreset,
	Partial<IsolationConfig>
> = {
	/**
	 * Strict isolation (default):
	 * - Only load user settings (API keys, model preferences)
	 * - Skip all project/local settings
	 * - Block all MCP servers
	 * - No plugins
	 */
	strict: {
		settingSources: ['user'],
		strictMcpConfig: true,
	},

	/**
	 * Minimal isolation:
	 * - Only load user settings
	 * - Allow project MCP servers (for tools that need external services)
	 * - No plugins
	 */
	minimal: {
		settingSources: ['user'],
		strictMcpConfig: false,
	},

	/**
	 * Permissive (full access):
	 * - Load user and project settings
	 * - Allow project MCP servers
	 * - Allow project plugins
	 */
	permissive: {
		settingSources: ['user', 'project'],
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
