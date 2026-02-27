/**
 * Plugin loader.
 *
 * Reads a plugin directory, discovers SKILL.md files, parses frontmatter,
 * and converts user-invocable skills into PromptCommands.
 */

import fs from 'node:fs';
import path from 'node:path';
import {type PluginManifest} from './types';
import {parseFrontmatter} from './frontmatter';
import {type PromptCommand} from '../../app/commands/types';

/**
 * Load a plugin from a directory and return PromptCommands for its
 * user-invocable skills.
 *
 * Throws if the directory or plugin.json is missing.
 * Returns an empty array if there is no skills/ directory.
 */
export function loadPlugin(pluginDir: string): PromptCommand[] {
	if (!fs.existsSync(pluginDir)) {
		throw new Error(`Plugin directory not found: ${pluginDir}`);
	}

	const manifestPath = path.join(pluginDir, '.claude-plugin', 'plugin.json');
	if (!fs.existsSync(manifestPath)) {
		throw new Error(`Plugin manifest not found: ${manifestPath}`);
	}

	// Validate manifest is readable JSON
	JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as PluginManifest;

	const skillsDir = path.join(pluginDir, 'skills');
	if (!fs.existsSync(skillsDir)) {
		return [];
	}

	// Discover plugin MCP config
	const mcpConfigPath = path.join(pluginDir, '.mcp.json');
	const hasMcpConfig = fs.existsSync(mcpConfigPath);

	const entries = fs.readdirSync(skillsDir, {withFileTypes: true});
	const commands: PromptCommand[] = [];

	for (const entry of entries) {
		if (!entry.isDirectory()) continue;

		const skillPath = path.join(skillsDir, entry.name, 'SKILL.md');
		if (!fs.existsSync(skillPath)) continue;

		const content = fs.readFileSync(skillPath, 'utf-8');
		const parsed = parseFrontmatter(content);

		if (!parsed.frontmatter['user-invocable']) continue;

		commands.push(
			skillToCommand(
				parsed.frontmatter,
				parsed.body,
				hasMcpConfig ? mcpConfigPath : undefined,
			),
		);
	}

	return commands;
}

function skillToCommand(
	frontmatter: {
		name: string;
		description: string;
		'argument-hint'?: string;
	},
	body: string,
	mcpConfigPath?: string,
): PromptCommand {
	const args = frontmatter['argument-hint']
		? [
				{
					name: 'args',
					description: frontmatter['argument-hint'],
					required: false,
				},
			]
		: undefined;

	return {
		name: frontmatter.name,
		description: frontmatter.description,
		category: 'prompt',
		session: 'new',
		isolation: mcpConfigPath ? {mcpConfig: mcpConfigPath} : undefined,
		args,
		buildPrompt(argMap: Record<string, string>): string {
			const userArgs = argMap['args'] || '(none provided)';
			return body.replaceAll('$ARGUMENTS', userArgs);
		},
	};
}
