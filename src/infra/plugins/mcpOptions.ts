/**
 * MCP server option discovery.
 *
 * Scans plugin directories for `.mcp.json` files that declare
 * an `options` array on their server entries, allowing the setup
 * wizard to present arg presets to the user.
 */

import fs from 'node:fs';
import path from 'node:path';
import type {McpServerOption} from './config';

export type McpServerWithOptions = {
	serverName: string;
	options: McpServerOption[];
};

/**
 * Scan plugin directories for MCP servers that have a non-empty `options` array.
 * Returns one entry per server, in discovery order.
 */
export function collectMcpServersWithOptions(
	pluginDirs: string[],
): McpServerWithOptions[] {
	const result: McpServerWithOptions[] = [];
	const seen = new Set<string>();

	for (const dir of pluginDirs) {
		const mcpPath = path.join(dir, '.mcp.json');
		if (!fs.existsSync(mcpPath)) {
			continue;
		}

		const config = JSON.parse(fs.readFileSync(mcpPath, 'utf-8')) as {
			mcpServers?: Record<
				string,
				{options?: McpServerOption[]; [key: string]: unknown}
			>;
		};

		for (const [serverName, serverConfig] of Object.entries(
			config.mcpServers ?? {},
		)) {
			if (
				seen.has(serverName) ||
				!Array.isArray(serverConfig.options) ||
				serverConfig.options.length === 0
			) {
				continue;
			}
			seen.add(serverName);
			result.push({serverName, options: serverConfig.options});
		}
	}

	return result;
}
