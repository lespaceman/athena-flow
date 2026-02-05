import {spawn, type ChildProcess} from 'node:child_process';
import {processRegistry} from './processRegistry.js';
import {type SpawnClaudeOptions} from '../types/process.js';
import {resolveIsolationConfig} from '../types/isolation.js';
import {
	generateHookSettings,
	registerCleanupOnExit,
} from './generateHookSettings.js';

// Re-export type for backwards compatibility
export type {SpawnClaudeOptions};

/**
 * Spawns a Claude Code headless process with the given prompt.
 *
 * Uses `claude -p` for proper headless/programmatic mode with streaming JSON output.
 * Passes ATHENA_INSTANCE_ID env var so hook-forwarder can route to the correct socket.
 *
 * By default, uses strict isolation:
 * - Only loads user settings (API keys, model preferences)
 * - Skips project/local settings
 * - Injects athena's hooks via temp settings file
 * - Blocks project MCP servers
 */
export function spawnClaude(options: SpawnClaudeOptions): ChildProcess {
	const {
		prompt,
		projectDir,
		instanceId,
		sessionId,
		isolation,
		onStdout,
		onStderr,
		onExit,
		onError,
		jqFilter,
		onFilteredStdout,
		onJqStderr,
	} = options;

	// Resolve isolation config (defaults to strict)
	const isolationConfig = resolveIsolationConfig(isolation);

	// Generate temp settings file with athena's hooks
	const {settingsPath, cleanup} = generateHookSettings();
	registerCleanupOnExit(cleanup);

	// Build CLI arguments
	const args = ['-p', prompt, '--output-format', 'stream-json'];

	// Add isolation flags
	args.push('--settings', settingsPath);

	// Full settings isolation: don't load any Claude settings
	// All configuration comes from athena's generated settings file
	// Authentication still works (stored in ~/.claude.json, not settings)
	args.push('--setting-sources', '');

	// === MCP Configuration ===
	// --mcp-config takes precedence over --strict-mcp-config
	if (isolationConfig.mcpConfig) {
		args.push('--mcp-config', isolationConfig.mcpConfig);
	} else if (isolationConfig.strictMcpConfig) {
		args.push('--strict-mcp-config');
	}

	// === Tool Access ===
	// Allowed tools (whitelist)
	if (isolationConfig.allowedTools?.length) {
		for (const tool of isolationConfig.allowedTools) {
			args.push('--allowedTools', tool);
		}
	}

	// Disallowed tools (blacklist)
	if (isolationConfig.disallowedTools?.length) {
		for (const tool of isolationConfig.disallowedTools) {
			args.push('--disallowedTools', tool);
		}
	}

	// Restrict available tools
	if (isolationConfig.tools !== undefined) {
		args.push('--tools', isolationConfig.tools);
	}

	// === Permission & Security ===
	if (isolationConfig.permissionMode) {
		args.push('--permission-mode', isolationConfig.permissionMode);
	}

	if (isolationConfig.dangerouslySkipPermissions) {
		args.push('--dangerously-skip-permissions');
	}

	if (isolationConfig.allowDangerouslySkipPermissions) {
		args.push('--allow-dangerously-skip-permissions');
	}

	// === Directories ===
	if (isolationConfig.additionalDirectories?.length) {
		for (const dir of isolationConfig.additionalDirectories) {
			args.push('--add-dir', dir);
		}
	}

	// === Model & Agent ===
	if (isolationConfig.model) {
		args.push('--model', isolationConfig.model);
	}

	if (isolationConfig.fallbackModel) {
		args.push('--fallback-model', isolationConfig.fallbackModel);
	}

	if (isolationConfig.agent) {
		args.push('--agent', isolationConfig.agent);
	}

	if (isolationConfig.agents) {
		args.push('--agents', JSON.stringify(isolationConfig.agents));
	}

	// === System Prompt ===
	if (isolationConfig.systemPrompt) {
		args.push('--system-prompt', isolationConfig.systemPrompt);
	}

	if (isolationConfig.systemPromptFile) {
		args.push('--system-prompt-file', isolationConfig.systemPromptFile);
	}

	if (isolationConfig.appendSystemPrompt) {
		args.push('--append-system-prompt', isolationConfig.appendSystemPrompt);
	}

	if (isolationConfig.appendSystemPromptFile) {
		args.push(
			'--append-system-prompt-file',
			isolationConfig.appendSystemPromptFile,
		);
	}

	// === Session Management ===
	if (sessionId) {
		args.push('--resume', sessionId);
	} else if (isolationConfig.continueSession) {
		args.push('--continue');
	}

	if (isolationConfig.forkSession) {
		args.push('--fork-session');
	}

	if (isolationConfig.noSessionPersistence) {
		args.push('--no-session-persistence');
	}

	// === Output & Debugging ===
	if (isolationConfig.verbose) {
		args.push('--verbose');
	}

	if (isolationConfig.debug) {
		if (typeof isolationConfig.debug === 'string') {
			args.push('--debug', isolationConfig.debug);
		} else {
			args.push('--debug');
		}
	}

	// === Limits ===
	if (isolationConfig.maxTurns !== undefined) {
		args.push('--max-turns', String(isolationConfig.maxTurns));
	}

	if (isolationConfig.maxBudgetUsd !== undefined) {
		args.push('--max-budget-usd', String(isolationConfig.maxBudgetUsd));
	}

	// === Plugins ===
	if (isolationConfig.pluginDirs?.length) {
		for (const dir of isolationConfig.pluginDirs) {
			args.push('--plugin-dir', dir);
		}
	}

	// === Features ===
	if (isolationConfig.disableSlashCommands) {
		args.push('--disable-slash-commands');
	}

	if (isolationConfig.chrome) {
		args.push('--chrome');
	}

	if (isolationConfig.noChrome) {
		args.push('--no-chrome');
	}

	// === Structured Output ===
	if (isolationConfig.jsonSchema) {
		const schema =
			typeof isolationConfig.jsonSchema === 'string'
				? isolationConfig.jsonSchema
				: JSON.stringify(isolationConfig.jsonSchema);
		args.push('--json-schema', schema);
	}

	if (isolationConfig.includePartialMessages) {
		args.push('--include-partial-messages');
	}

	// Debug logging
	if (process.env['ATHENA_DEBUG']) {
		console.error('[athena-debug] Spawning claude with args:', args);
	}

	const child = spawn('claude', args, {
		cwd: projectDir,
		stdio: ['ignore', 'pipe', 'pipe'],
		env: {
			...process.env,
			ATHENA_INSTANCE_ID: String(instanceId),
		},
	});

	// Register for cleanup on app exit
	processRegistry.register(child);

	if (onStdout && child.stdout) {
		child.stdout.on('data', (data: Buffer) => {
			onStdout(data.toString());
		});
	}

	if (onStderr && child.stderr) {
		child.stderr.on('data', (data: Buffer) => {
			onStderr(data.toString());
		});
	}

	// Spawn jq sidecar to filter stdout when jqFilter is set
	if (jqFilter && child.stdout) {
		const jqChild = spawn('jq', ['--unbuffered', '-rj', jqFilter], {
			stdio: ['pipe', 'pipe', 'pipe'],
		});

		processRegistry.register(jqChild);

		// Forward Claude's stdout to jq's stdin (manual write to avoid pipe() conflict)
		child.stdout.on('data', (data: Buffer) => {
			try {
				jqChild.stdin?.write(data);
			} catch {
				// jq may have exited; suppress write errors
			}
		});
		child.stdout.on('end', () => {
			try {
				jqChild.stdin?.end();
			} catch {
				// Suppress errors if jq stdin is already closed
			}
		});

		// Wire jq stdout to filtered callback
		if (onFilteredStdout && jqChild.stdout) {
			jqChild.stdout.on('data', (data: Buffer) => {
				onFilteredStdout(data.toString());
			});
		}

		// Wire jq stderr to error callback
		if (onJqStderr && jqChild.stderr) {
			jqChild.stderr.on('data', (data: Buffer) => {
				onJqStderr(data.toString());
			});
		}

		// Suppress EPIPE errors on jq stdin
		jqChild.stdin?.on('error', () => {
			// jq may exit before Claude finishes writing
		});

		// Handle jq spawn failure
		jqChild.on('error', (error: Error) => {
			if (onJqStderr) {
				onJqStderr(`[jq error] ${error.message}`);
			}
		});
	}

	// Clean up temp settings file when process exits
	child.on('exit', (code: number | null) => {
		cleanup();
		if (onExit) {
			onExit(code);
		}
	});

	// Always attach error handler to prevent unhandled error events
	// Node.js EventEmitter throws if 'error' event has no listener
	child.on('error', (error: Error) => {
		cleanup();
		if (onError) {
			onError(error);
		}
		// If no handler provided, error is silently ignored
		// (process will exit via 'exit' event)
	});

	return child;
}
