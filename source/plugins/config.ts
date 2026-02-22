/**
 * Plugin config reader.
 *
 * Reads global config from `~/.config/athena/config.json` and
 * per-project config from `{projectDir}/.athena/config.json`.
 * Missing files are not errors — returns empty config.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {isMarketplaceRef, resolveMarketplacePlugin} from './marketplace.js';

export type AthenaConfig = {
	plugins: string[];
	/** Additional directories to grant Claude access to (passed as --add-dir flags) */
	additionalDirectories: string[];
	/** Model to use (alias like "sonnet"/"opus" or full model ID) */
	model?: string;
	/** Color theme: 'dark' or 'light' */
	theme?: string;
	/** Workflow name from standalone registry */
	workflow?: string;
	/** Whether the setup wizard has been completed */
	setupComplete?: boolean;
	/** Which AI coding harness is being used */
	harness?: 'claude-code' | 'codex';
};

const EMPTY_CONFIG: AthenaConfig = {plugins: [], additionalDirectories: []};

/**
 * Read per-project plugin config from `{projectDir}/.athena/config.json`.
 * Relative paths are resolved against projectDir.
 * Returns `{ plugins: [] }` if the file does not exist.
 */
export function readConfig(projectDir: string): AthenaConfig {
	const configPath = path.join(projectDir, '.athena', 'config.json');
	return readConfigFile(configPath, projectDir);
}

/**
 * Read global plugin config from `~/.config/athena/config.json`.
 * Relative paths are resolved against the user's home directory.
 * Returns `{ plugins: [] }` if the file does not exist.
 */
export function readGlobalConfig(): AthenaConfig {
	const homeDir = os.homedir();
	const configPath = path.join(homeDir, '.config', 'athena', 'config.json');
	return readConfigFile(configPath, homeDir);
}

function readConfigFile(configPath: string, baseDir: string): AthenaConfig {
	if (!fs.existsSync(configPath)) {
		return EMPTY_CONFIG;
	}

	const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
		plugins?: string[];
		additionalDirectories?: string[];
		model?: string;
		theme?: string;
		workflow?: string;
		setupComplete?: boolean;
		harness?: string;
	};

	const plugins = (raw.plugins ?? [])
		.map((p): string | null => {
			if (isMarketplaceRef(p)) {
				try {
					return resolveMarketplacePlugin(p);
				} catch (error) {
					console.error(
						`Warning: skipping plugin "${p}": ${(error as Error).message}`,
					);
					return null;
				}
			}
			return path.isAbsolute(p) ? p : path.resolve(baseDir, p);
		})
		.filter((p): p is string => p !== null);

	// Resolve relative paths for additional directories
	const additionalDirectories = (raw.additionalDirectories ?? []).map(dir =>
		path.isAbsolute(dir) ? dir : path.resolve(baseDir, dir),
	);

	return {
		plugins,
		additionalDirectories,
		model: raw.model,
		theme: raw.theme,
		workflow: raw.workflow,
		setupComplete: raw.setupComplete as boolean | undefined,
		harness:
			raw.harness === 'claude-code' || raw.harness === 'codex'
				? raw.harness
				: undefined,
	};
}

/**
 * Write global config to `~/.config/athena/config.json`.
 * Merges with existing config if present. Creates directories as needed.
 */
export function writeGlobalConfig(updates: Partial<AthenaConfig>): void {
	const homeDir = os.homedir();
	const configDir = path.join(homeDir, '.config', 'athena');
	const configPath = path.join(configDir, 'config.json');

	let existing: Record<string, unknown> = {};
	if (fs.existsSync(configPath)) {
		existing = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as Record<
			string,
			unknown
		>;
	}

	const merged = {...existing, ...updates};
	fs.mkdirSync(configDir, {recursive: true});
	fs.writeFileSync(configPath, JSON.stringify(merged, null, 2) + '\n', 'utf-8');
}
