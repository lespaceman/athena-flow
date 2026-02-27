/**
 * Plugin registration orchestrator.
 *
 * Loads each plugin directory, registers the resulting commands,
 * and merges MCP server configs from all plugins into a single file.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {register} from '../../commands/registry';
import {loadPlugin} from './loader';
import type {WorkflowConfig} from '../../core/workflows/types';

export type PluginRegistrationResult = {
	mcpConfig?: string;
	workflows: WorkflowConfig[];
};

/**
 * Load plugins from the given directories, register their commands,
 * and return merged MCP config + discovered workflows.
 */
export function registerPlugins(
	pluginDirs: string[],
): PluginRegistrationResult {
	const mergedServers: Record<string, unknown> = {};
	const workflows: WorkflowConfig[] = [];

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

		// Discover workflow config
		const workflowPath = path.join(dir, 'workflow.json');
		if (fs.existsSync(workflowPath)) {
			const workflow = JSON.parse(
				fs.readFileSync(workflowPath, 'utf-8'),
			) as WorkflowConfig;
			workflows.push(workflow);
		}
	}

	let mcpConfig: string | undefined;
	if (Object.keys(mergedServers).length > 0) {
		mcpConfig = path.join(os.tmpdir(), `athena-mcp-${process.pid}.json`);
		fs.writeFileSync(mcpConfig, JSON.stringify({mcpServers: mergedServers}));
	}

	return {mcpConfig, workflows};
}
