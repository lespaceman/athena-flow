/**
 * Plugin registration orchestrator.
 *
 * Loads each plugin directory, registers the resulting commands,
 * and merges MCP server configs from all plugins into a single file.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {register} from '../commands/registry.js';
import {loadPlugin} from './loader.js';

/**
 * Load plugins from the given directories, register their commands,
 * and return a merged MCP config path if any plugins define MCP servers.
 */
export function registerPlugins(pluginDirs: string[]): string | undefined {
	const mergedServers: Record<string, unknown> = {};

	for (const dir of pluginDirs) {
		const commands = loadPlugin(dir);
		for (const command of commands) {
			register(command);
		}

		// Collect MCP configs
		const mcpPath = path.join(dir, '.mcp.json');
		if (fs.existsSync(mcpPath)) {
			const config = JSON.parse(fs.readFileSync(mcpPath, 'utf-8')) as {
				mcpServers?: Record<string, unknown>;
			};

			for (const serverName of Object.keys(config.mcpServers ?? {})) {
				if (serverName in mergedServers) {
					throw new Error(
						`MCP server name collision: "${serverName}" is defined by multiple plugins. ` +
							'Each MCP server must have a unique name across all plugins.',
					);
				}
			}

			Object.assign(mergedServers, config.mcpServers ?? {});
		}
	}

	if (Object.keys(mergedServers).length === 0) return undefined;

	const merged = path.join(os.tmpdir(), `athena-mcp-${process.pid}.json`);
	fs.writeFileSync(merged, JSON.stringify({mcpServers: mergedServers}));
	return merged;
}
