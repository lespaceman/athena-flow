import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/**
 * Agent config bridge: Claude plugin agents/*.md → Codex agent roles.
 *
 * Claude defines agents as markdown files with YAML frontmatter.
 * Codex requires `[agents.<name>]` in config.toml pointing to separate
 * TOML config files. This module bridges the two formats.
 */

export type ParsedAgent = {
	name: string;
	description: string;
	developerInstructions: string;
	model?: string;
	tools?: string[];
	disallowedTools?: string[];
	permissionMode?: string;
};

export type AgentConfigEdit = {
	keyPath: string;
	value: unknown;
	mergeStrategy: 'replace' | 'upsert';
};

export type CodexAgentConfigResult = {
	agentConfigEdits: AgentConfigEdit[];
	tempDir: string;
	agentNames: string[];
	errors: AgentConfigError[];
};

export type AgentConfigError = {
	path: string;
	message: string;
};

/**
 * Map Claude model aliases to Codex model equivalents.
 * Codex model names vary by deployment — we pass through as-is
 * since the Codex binary resolves model aliases internally.
 */
function mapModelForCodex(model?: string): string | undefined {
	if (!model || model === 'inherit') {
		return undefined;
	}
	return model;
}

/**
 * Map Claude permissionMode → Codex sandbox_mode.
 */
function mapSandboxMode(permissionMode?: string): string | undefined {
	switch (permissionMode) {
		case 'plan':
			return 'read-only';
		case 'bypassPermissions':
		case 'dontAsk':
			return undefined;
		default:
			return undefined;
	}
}

/**
 * Parse a YAML frontmatter block from an agent .md file.
 * Reuses the same simple YAML subset as the skill frontmatter parser.
 */
export function parseAgentFrontmatter(content: string): {
	frontmatter: Record<string, string | boolean | string[]>;
	body: string;
} {
	const lines = content.split('\n');

	if (lines[0]?.trim() !== '---') {
		throw new Error('Agent .md must start with --- frontmatter delimiter');
	}

	const closingIndex = lines.indexOf('---', 1);
	if (closingIndex === -1) {
		throw new Error('Agent .md missing closing --- frontmatter delimiter');
	}

	const yamlLines = lines.slice(1, closingIndex);
	const body = lines
		.slice(closingIndex + 1)
		.join('\n')
		.trim();
	const frontmatter: Record<string, string | boolean | string[]> = {};
	let i = 0;

	while (i < yamlLines.length) {
		const line = yamlLines[i]!;

		if (line.trim() === '') {
			i++;
			continue;
		}

		const colonIdx = line.indexOf(':');
		if (colonIdx === -1) {
			i++;
			continue;
		}

		const key = line.slice(0, colonIdx).trim();
		const rawValue = line.slice(colonIdx + 1).trim();

		if (rawValue === '>') {
			const parts: string[] = [];
			i++;
			while (i < yamlLines.length && yamlLines[i]!.startsWith('  ')) {
				parts.push(yamlLines[i]!.trim());
				i++;
			}
			frontmatter[key] = parts.join(' ');
			continue;
		}

		if (rawValue === '') {
			const items: string[] = [];
			i++;
			while (i < yamlLines.length && /^\s+-\s/.test(yamlLines[i]!)) {
				items.push(yamlLines[i]!.replace(/^\s+-\s/, '').trim());
				i++;
			}
			if (items.length > 0) {
				frontmatter[key] = items;
			} else {
				frontmatter[key] = '';
			}
			continue;
		}

		if (rawValue === 'true') {
			frontmatter[key] = true;
			i++;
			continue;
		}
		if (rawValue === 'false') {
			frontmatter[key] = false;
			i++;
			continue;
		}

		frontmatter[key] = rawValue;
		i++;
	}

	return {frontmatter, body};
}

/**
 * Parse a Claude agent .md file into a structured ParsedAgent.
 */
export function parseAgentMd(filePath: string, content: string): ParsedAgent {
	const {frontmatter, body} = parseAgentFrontmatter(content);

	const name =
		typeof frontmatter['name'] === 'string' ? frontmatter['name'] : undefined;
	if (!name) {
		throw new Error(
			`Agent file ${filePath} missing required "name" field in frontmatter`,
		);
	}

	const description =
		typeof frontmatter['description'] === 'string'
			? frontmatter['description']
			: undefined;
	if (!description) {
		throw new Error(
			`Agent file ${filePath} missing required "description" field in frontmatter`,
		);
	}

	const rawTools = frontmatter['tools'];
	const tools = Array.isArray(rawTools)
		? rawTools
		: typeof rawTools === 'string'
			? rawTools
					.split(',')
					.map(t => t.trim())
					.filter(Boolean)
			: undefined;

	const rawDisallowed = frontmatter['disallowedTools'];
	const disallowedTools = Array.isArray(rawDisallowed)
		? rawDisallowed
		: typeof rawDisallowed === 'string'
			? rawDisallowed
					.split(',')
					.map(t => t.trim())
					.filter(Boolean)
			: undefined;

	return {
		name,
		description,
		developerInstructions: body,
		model:
			typeof frontmatter['model'] === 'string'
				? frontmatter['model']
				: undefined,
		tools,
		disallowedTools,
		permissionMode:
			typeof frontmatter['permissionMode'] === 'string'
				? frontmatter['permissionMode']
				: undefined,
	};
}

/**
 * Escape a TOML string value (double-quoted).
 */
function tomlString(value: string): string {
	return `"""
${value}
"""`;
}

/**
 * Generate a Codex agent config TOML file from a ParsedAgent.
 */
export function generateAgentToml(agent: ParsedAgent): string {
	const lines: string[] = [];

	const model = mapModelForCodex(agent.model);
	if (model) {
		lines.push(`model = "${model}"`);
	}

	const sandboxMode = mapSandboxMode(agent.permissionMode);
	if (sandboxMode) {
		lines.push(`sandbox_mode = "${sandboxMode}"`);
	}

	if (agent.developerInstructions) {
		lines.push(
			`developer_instructions = ${tomlString(agent.developerInstructions)}`,
		);
	}

	return lines.join('\n');
}

/**
 * Scan agent roots for agent .md files and return all discovered agents.
 */
export function discoverAgents(agentRoots: string[]): {
	agents: Array<{filePath: string; agent: ParsedAgent}>;
	errors: AgentConfigError[];
} {
	const agents: Array<{filePath: string; agent: ParsedAgent}> = [];
	const errors: AgentConfigError[] = [];

	for (const root of agentRoots) {
		let entries: fs.Dirent[];
		try {
			entries = fs.readdirSync(root, {withFileTypes: true});
		} catch {
			continue;
		}

		for (const entry of entries) {
			if (!entry.isFile() || !entry.name.endsWith('.md')) {
				continue;
			}

			const filePath = path.join(root, entry.name);
			try {
				const content = fs.readFileSync(filePath, 'utf-8');
				const agent = parseAgentMd(filePath, content);
				agents.push({filePath, agent});
			} catch (err) {
				errors.push({
					path: filePath,
					message: err instanceof Error ? err.message : String(err),
				});
			}
		}
	}

	return {agents, errors};
}

/**
 * Detect agent name collisions across plugins.
 */
function detectCollisions(
	agents: Array<{filePath: string; agent: ParsedAgent}>,
): AgentConfigError[] {
	const seen = new Map<string, string>();
	const collisions: AgentConfigError[] = [];

	for (const {filePath, agent} of agents) {
		const existing = seen.get(agent.name);
		if (existing) {
			collisions.push({
				path: filePath,
				message: `Agent name "${agent.name}" collides with ${existing}`,
			});
		} else {
			seen.set(agent.name, filePath);
		}
	}

	return collisions;
}

/**
 * Resolve agent config from plugin agent roots into Codex-compatible
 * config/batchWrite edits and temp TOML files.
 *
 * Returns undefined if no agents are found.
 */
export function resolveCodexAgentConfig(input: {
	agentRoots: string[];
	sessionId: string;
}): CodexAgentConfigResult | undefined {
	const {agentRoots, sessionId} = input;
	if (agentRoots.length === 0) {
		return undefined;
	}

	const {agents, errors} = discoverAgents(agentRoots);
	const collisionErrors = detectCollisions(agents);
	const allErrors = [...errors, ...collisionErrors];

	// Filter out collision duplicates (keep first occurrence)
	const collisionNames = new Set(
		collisionErrors.map(e => {
			const match = e.message.match(/Agent name "([^"]+)"/);
			return match?.[1] ?? '';
		}),
	);
	const uniqueAgents = agents.filter(({agent}, index) => {
		if (!collisionNames.has(agent.name)) {
			return true;
		}
		// Keep the first occurrence of a colliding name
		return agents.findIndex(a => a.agent.name === agent.name) === index;
	});

	if (uniqueAgents.length === 0) {
		if (allErrors.length === 0) {
			return undefined;
		}
		return {
			agentConfigEdits: [],
			tempDir: '',
			agentNames: [],
			errors: allErrors,
		};
	}

	// Create temp directory for agent TOML files
	const tempDir = path.join(os.tmpdir(), `athena-agents-${sessionId}`);
	fs.mkdirSync(tempDir, {recursive: true});

	const edits: AgentConfigEdit[] = [
		{
			keyPath: 'features.multi_agent',
			value: true,
			mergeStrategy: 'replace',
		},
		{
			keyPath: 'agents.max_threads',
			value: 6,
			mergeStrategy: 'replace',
		},
		{
			keyPath: 'agents.max_depth',
			value: 1,
			mergeStrategy: 'replace',
		},
	];

	const agentNames: string[] = [];

	for (const {agent} of uniqueAgents) {
		const toml = generateAgentToml(agent);
		const tomlPath = path.join(tempDir, `${agent.name}.toml`);
		fs.writeFileSync(tomlPath, toml, 'utf-8');

		edits.push({
			keyPath: `agents.${agent.name}`,
			value: {
				description: agent.description,
				config_file: tomlPath,
			},
			mergeStrategy: 'upsert',
		});

		agentNames.push(agent.name);
	}

	return {
		agentConfigEdits: edits,
		tempDir,
		agentNames,
		errors: allErrors,
	};
}

/**
 * Clean up temp TOML files and remove agent config entries.
 */
export function cleanupAgentConfig(tempDir: string): void {
	if (!tempDir) {
		return;
	}
	try {
		fs.rmSync(tempDir, {recursive: true, force: true});
	} catch {
		// Best-effort cleanup
	}
}
