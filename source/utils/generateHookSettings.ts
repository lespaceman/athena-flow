/**
 * Hook Settings Generator
 *
 * Generates a temporary Claude Code settings file that configures
 * athena-hook-forwarder as the hook handler for all hook events.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

/**
 * Hook events that require a matcher (tool-related events).
 */
const TOOL_HOOK_EVENTS = [
	'PreToolUse',
	'PostToolUse',
	'PostToolUseFailure',
	'PermissionRequest',
] as const;

/**
 * Hook events that don't require a matcher.
 */
const NON_TOOL_HOOK_EVENTS = [
	'Notification',
	'Stop',
	'SessionStart',
	'SessionEnd',
	'SubagentStart',
	'SubagentStop',
	'UserPromptSubmit',
	'PreCompact',
	'Setup',
] as const;

/**
 * Claude Code hook command configuration.
 */
type HookCommand = {
	type: 'command';
	command: string;
	/** Timeout in seconds (Claude Code default is 60) */
	timeout?: number;
};

/**
 * Hook entry with matcher (for tool events).
 */
type MatchedHookEntry = {
	matcher: string;
	hooks: HookCommand[];
};

/**
 * Hook entry without matcher (for non-tool events).
 */
type UnmatchedHookEntry = {
	hooks: HookCommand[];
};

/**
 * Claude Code settings structure (partial - only hooks).
 */
type ClaudeSettings = {
	hooks: Record<string, (MatchedHookEntry | UnmatchedHookEntry)[]>;
};

/**
 * Result from generating hook settings.
 */
export type GeneratedHookSettings = {
	/** Path to the generated temporary settings file */
	settingsPath: string;
	/** Cleanup function to remove the temp file */
	cleanup: () => void;
};

/**
 * Finds the athena-hook-forwarder executable path.
 *
 * When running from the installed package, uses the bin name directly.
 * When running from development, resolves to dist/hook-forwarder.js.
 */
function getHookForwarderPath(): string {
	// In development, __dirname is source/utils, need to go up to find dist
	// In production, the bin is in PATH as athena-hook-forwarder
	// For now, we'll use the direct path to the dist file
	const distPath = path.resolve(
		path.dirname(new URL(import.meta.url).pathname),
		'../../dist/hook-forwarder.js',
	);

	// Check if we're running from dist (production)
	if (fs.existsSync(distPath)) {
		return `node ${distPath}`;
	}

	// Fallback to global bin name (when installed via npm -g)
	return 'athena-hook-forwarder';
}

/**
 * Generates a temporary Claude Code settings file with athena hooks.
 *
 * @param tempDir - Optional temp directory (defaults to os.tmpdir())
 * @returns Generated settings with path and cleanup function
 */
export function generateHookSettings(tempDir?: string): GeneratedHookSettings {
	const hookForwarderPath = getHookForwarderPath();

	// Debug logging
	if (process.env['ATHENA_DEBUG']) {
		console.error('[athena-debug] Hook forwarder path:', hookForwarderPath);
	}

	const hookCommand: HookCommand = {
		type: 'command',
		command: hookForwarderPath,
		timeout: 1,
	};

	const preToolUseHookCommand: HookCommand = {
		type: 'command',
		command: hookForwarderPath,
		timeout: 300, // Extended timeout for permission dialog
	};

	// Build hooks configuration for all event types
	const hooks: ClaudeSettings['hooks'] = {};

	// Tool events require a matcher
	for (const event of TOOL_HOOK_EVENTS) {
		hooks[event] = [
			{
				matcher: '*',
				hooks: [event === 'PreToolUse' ? preToolUseHookCommand : hookCommand],
			},
		];
	}

	// Non-tool events don't need a matcher
	for (const event of NON_TOOL_HOOK_EVENTS) {
		hooks[event] = [
			{
				hooks: [hookCommand],
			},
		];
	}

	const settings: ClaudeSettings = {hooks};

	// Generate a unique temp file path
	const dir = tempDir ?? os.tmpdir();
	const filename = `athena-hooks-${process.pid}-${Date.now()}.json`;
	const settingsPath = path.join(dir, filename);

	// Write the settings file
	fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');

	// Debug logging
	if (process.env['ATHENA_DEBUG']) {
		console.error('[athena-debug] Generated settings file:', settingsPath);
		console.error(
			'[athena-debug] Settings content:',
			JSON.stringify(settings, null, 2),
		);
	}

	// Return path and cleanup function
	return {
		settingsPath,
		cleanup: () => {
			try {
				if (fs.existsSync(settingsPath)) {
					fs.unlinkSync(settingsPath);
				}
			} catch {
				// Ignore cleanup errors
			}
		},
	};
}

/**
 * Registers a cleanup function to run on process exit.
 * Ensures temp files are cleaned up even on unexpected termination.
 */
export function registerCleanupOnExit(cleanup: () => void): void {
	const cleanupOnce = (() => {
		let cleaned = false;
		return () => {
			if (!cleaned) {
				cleaned = true;
				cleanup();
			}
		};
	})();

	process.once('exit', cleanupOnce);
	process.once('SIGINT', cleanupOnce);
	process.once('SIGTERM', cleanupOnce);
	process.once('uncaughtException', cleanupOnce);
}
