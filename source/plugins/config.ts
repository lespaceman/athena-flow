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

export type AthenaConfig = {
	plugins: string[];
};

const EMPTY_CONFIG: AthenaConfig = {plugins: []};

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
	};

	const plugins = (raw.plugins ?? []).map(p =>
		path.isAbsolute(p) ? p : path.resolve(baseDir, p),
	);

	return {plugins};
}
