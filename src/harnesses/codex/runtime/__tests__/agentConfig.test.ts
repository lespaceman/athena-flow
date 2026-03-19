import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {
	parseAgentFrontmatter,
	parseAgentMd,
	generateAgentToml,
	discoverAgents,
	resolveCodexAgentConfig,
	cleanupAgentConfig,
} from '../agentConfig';

describe('parseAgentFrontmatter', () => {
	it('parses basic frontmatter and body', () => {
		const content = `---
name: code-reviewer
description: Reviews code for quality
model: sonnet
---

You are a code reviewer.`;

		const result = parseAgentFrontmatter(content);
		expect(result.frontmatter).toEqual({
			name: 'code-reviewer',
			description: 'Reviews code for quality',
			model: 'sonnet',
		});
		expect(result.body).toBe('You are a code reviewer.');
	});

	it('parses comma-separated tools as string', () => {
		const content = `---
name: researcher
description: Researches code
tools: Read, Grep, Glob
---

Research the codebase.`;

		const result = parseAgentFrontmatter(content);
		expect(result.frontmatter['tools']).toBe('Read, Grep, Glob');
	});

	it('parses array-style tools', () => {
		const content = `---
name: researcher
description: Researches code
tools:
  - Read
  - Grep
  - Glob
---

Research the codebase.`;

		const result = parseAgentFrontmatter(content);
		expect(result.frontmatter['tools']).toEqual(['Read', 'Grep', 'Glob']);
	});

	it('parses boolean fields', () => {
		const content = `---
name: safe-agent
description: A safe agent
user-invocable: true
---

Be safe.`;

		const result = parseAgentFrontmatter(content);
		expect(result.frontmatter['user-invocable']).toBe(true);
	});

	it('parses folded scalar description', () => {
		const content = `---
name: complex
description: >
  A complex agent that does
  many interesting things
---

Instructions here.`;

		const result = parseAgentFrontmatter(content);
		expect(result.frontmatter['description']).toBe(
			'A complex agent that does many interesting things',
		);
	});

	it('throws on missing opening delimiter', () => {
		expect(() => parseAgentFrontmatter('name: test\n---\n')).toThrow(
			'must start with --- frontmatter delimiter',
		);
	});

	it('throws on missing closing delimiter', () => {
		expect(() => parseAgentFrontmatter('---\nname: test\n')).toThrow(
			'missing closing --- frontmatter delimiter',
		);
	});
});

describe('parseAgentMd', () => {
	it('extracts ParsedAgent from well-formed .md', () => {
		const content = `---
name: code-reviewer
description: Reviews code for quality and best practices
tools: Read, Glob, Grep
model: sonnet
permissionMode: plan
---

You are a code reviewer. Analyze code for quality.`;

		const result = parseAgentMd('/agents/code-reviewer.md', content);
		expect(result).toEqual({
			name: 'code-reviewer',
			description: 'Reviews code for quality and best practices',
			developerInstructions:
				'You are a code reviewer. Analyze code for quality.',
			model: 'sonnet',
			tools: ['Read', 'Glob', 'Grep'],
			disallowedTools: undefined,
			permissionMode: 'plan',
		});
	});

	it('throws when name is missing', () => {
		const content = `---
description: No name here
---

Body.`;
		expect(() => parseAgentMd('/agents/bad.md', content)).toThrow(
			'missing required "name" field',
		);
	});

	it('throws when description is missing', () => {
		const content = `---
name: no-desc
---

Body.`;
		expect(() => parseAgentMd('/agents/bad.md', content)).toThrow(
			'missing required "description" field',
		);
	});

	it('handles disallowedTools as comma-separated string', () => {
		const content = `---
name: safe-agent
description: A safe agent
disallowedTools: Write, Edit
---

Be safe.`;

		const result = parseAgentMd('/agents/safe.md', content);
		expect(result.disallowedTools).toEqual(['Write', 'Edit']);
	});
});

describe('generateAgentToml', () => {
	it('generates TOML with model and developer instructions', () => {
		const toml = generateAgentToml({
			name: 'reviewer',
			description: 'Reviews code',
			developerInstructions: 'You review code carefully.',
			model: 'sonnet',
		});
		expect(toml).toContain('model = "sonnet"');
		expect(toml).toContain('developer_instructions = """');
		expect(toml).toContain('You review code carefully.');
	});

	it('generates TOML with sandbox_mode for plan permission mode', () => {
		const toml = generateAgentToml({
			name: 'explorer',
			description: 'Explores codebase',
			developerInstructions: 'Read only.',
			permissionMode: 'plan',
		});
		expect(toml).toContain('sandbox_mode = "read-only"');
	});

	it('omits model when inherit or undefined', () => {
		const toml = generateAgentToml({
			name: 'basic',
			description: 'Basic agent',
			developerInstructions: 'Do basic things.',
			model: 'inherit',
		});
		expect(toml).not.toContain('model');
	});

	it('generates minimal TOML with only developer instructions', () => {
		const toml = generateAgentToml({
			name: 'simple',
			description: 'Simple agent',
			developerInstructions: 'Just do your thing.',
		});
		expect(toml).not.toContain('model');
		expect(toml).not.toContain('sandbox_mode');
		expect(toml).toContain('developer_instructions');
	});
});

describe('discoverAgents', () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-test-'));
	});

	afterEach(() => {
		fs.rmSync(tmpDir, {recursive: true, force: true});
	});

	it('discovers valid .md files from agent roots', () => {
		const agentDir = path.join(tmpDir, 'agents');
		fs.mkdirSync(agentDir);
		fs.writeFileSync(
			path.join(agentDir, 'reviewer.md'),
			`---
name: reviewer
description: Reviews code
---

Review carefully.`,
		);

		const result = discoverAgents([agentDir]);
		expect(result.agents).toHaveLength(1);
		expect(result.agents[0]!.agent.name).toBe('reviewer');
		expect(result.errors).toHaveLength(0);
	});

	it('reports errors for malformed .md files', () => {
		const agentDir = path.join(tmpDir, 'agents');
		fs.mkdirSync(agentDir);
		fs.writeFileSync(
			path.join(agentDir, 'broken.md'),
			'Not a valid frontmatter file',
		);

		const result = discoverAgents([agentDir]);
		expect(result.agents).toHaveLength(0);
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]!.message).toContain(
			'must start with --- frontmatter delimiter',
		);
	});

	it('skips non-.md files', () => {
		const agentDir = path.join(tmpDir, 'agents');
		fs.mkdirSync(agentDir);
		fs.writeFileSync(path.join(agentDir, 'readme.txt'), 'Not an agent');

		const result = discoverAgents([agentDir]);
		expect(result.agents).toHaveLength(0);
		expect(result.errors).toHaveLength(0);
	});

	it('handles nonexistent roots gracefully', () => {
		const result = discoverAgents(['/nonexistent/path']);
		expect(result.agents).toHaveLength(0);
		expect(result.errors).toHaveLength(0);
	});

	it('discovers agents from multiple roots', () => {
		const dir1 = path.join(tmpDir, 'plugin1', 'agents');
		const dir2 = path.join(tmpDir, 'plugin2', 'agents');
		fs.mkdirSync(dir1, {recursive: true});
		fs.mkdirSync(dir2, {recursive: true});

		fs.writeFileSync(
			path.join(dir1, 'alpha.md'),
			`---
name: alpha
description: Alpha agent
---

Alpha instructions.`,
		);
		fs.writeFileSync(
			path.join(dir2, 'beta.md'),
			`---
name: beta
description: Beta agent
---

Beta instructions.`,
		);

		const result = discoverAgents([dir1, dir2]);
		expect(result.agents).toHaveLength(2);
		const names = result.agents.map(a => a.agent.name);
		expect(names).toContain('alpha');
		expect(names).toContain('beta');
	});
});

describe('resolveCodexAgentConfig', () => {
	let tmpDir: string;
	let agentDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-resolve-'));
		agentDir = path.join(tmpDir, 'agents');
		fs.mkdirSync(agentDir);
	});

	afterEach(() => {
		fs.rmSync(tmpDir, {recursive: true, force: true});
	});

	it('returns undefined for empty agent roots', () => {
		const result = resolveCodexAgentConfig({
			agentRoots: [],
			sessionId: 'test-session',
		});
		expect(result).toBeUndefined();
	});

	it('generates config edits and temp TOML files', () => {
		fs.writeFileSync(
			path.join(agentDir, 'reviewer.md'),
			`---
name: reviewer
description: Reviews code for quality
model: sonnet
---

You are a careful code reviewer.`,
		);

		const result = resolveCodexAgentConfig({
			agentRoots: [agentDir],
			sessionId: 'test-session',
		});

		expect(result).toBeDefined();
		expect(result!.agentNames).toEqual(['reviewer']);
		expect(result!.errors).toHaveLength(0);

		// Should have feature flag + max_threads + max_depth + 1 agent = 4 edits
		expect(result!.agentConfigEdits).toHaveLength(4);
		expect(result!.agentConfigEdits[0]).toEqual({
			keyPath: 'features.multi_agent',
			value: true,
			mergeStrategy: 'replace',
		});
		expect(result!.agentConfigEdits[3]).toEqual({
			keyPath: 'agents.reviewer',
			value: {
				description: 'Reviews code for quality',
				config_file: expect.stringContaining('reviewer.toml'),
			},
			mergeStrategy: 'upsert',
		});

		// Verify TOML file was created
		const tomlPath = result!.agentConfigEdits[3]!.value as {
			config_file: string;
		};
		expect(fs.existsSync(tomlPath.config_file)).toBe(true);
		const tomlContent = fs.readFileSync(tomlPath.config_file, 'utf-8');
		expect(tomlContent).toContain('model = "sonnet"');
		expect(tomlContent).toContain('You are a careful code reviewer.');

		// Cleanup
		cleanupAgentConfig(result!.tempDir);
	});

	it('detects agent name collisions and reports errors', () => {
		const dir2 = path.join(tmpDir, 'plugin2-agents');
		fs.mkdirSync(dir2);

		fs.writeFileSync(
			path.join(agentDir, 'reviewer.md'),
			`---
name: reviewer
description: Plugin 1 reviewer
---

First reviewer.`,
		);
		fs.writeFileSync(
			path.join(dir2, 'reviewer.md'),
			`---
name: reviewer
description: Plugin 2 reviewer
---

Second reviewer.`,
		);

		const result = resolveCodexAgentConfig({
			agentRoots: [agentDir, dir2],
			sessionId: 'test-collision',
		});

		expect(result).toBeDefined();
		// First occurrence is kept
		expect(result!.agentNames).toEqual(['reviewer']);
		// Collision is reported as error
		expect(result!.errors).toHaveLength(1);
		expect(result!.errors[0]!.message).toContain('collides with');

		cleanupAgentConfig(result!.tempDir);
	});

	it('returns only errors when all agents have malformed frontmatter', () => {
		fs.writeFileSync(path.join(agentDir, 'broken.md'), 'Not valid frontmatter');

		const result = resolveCodexAgentConfig({
			agentRoots: [agentDir],
			sessionId: 'test-errors',
		});

		expect(result).toBeDefined();
		expect(result!.agentNames).toHaveLength(0);
		expect(result!.errors).toHaveLength(1);
		expect(result!.agentConfigEdits).toHaveLength(0);
	});
});

describe('cleanupAgentConfig', () => {
	it('removes temp directory', () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-cleanup-'));
		fs.writeFileSync(path.join(tmpDir, 'test.toml'), 'content');
		expect(fs.existsSync(tmpDir)).toBe(true);

		cleanupAgentConfig(tmpDir);
		expect(fs.existsSync(tmpDir)).toBe(false);
	});

	it('handles empty string gracefully', () => {
		expect(() => cleanupAgentConfig('')).not.toThrow();
	});

	it('handles nonexistent path gracefully', () => {
		expect(() => cleanupAgentConfig('/nonexistent/path')).not.toThrow();
	});
});
