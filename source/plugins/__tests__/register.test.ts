import {describe, it, expect, vi, beforeEach} from 'vitest';
import {registerPlugins} from '../register.js';
import {clear, get} from '../../commands/registry.js';

// Virtual file system for tests
const files: Record<string, string> = {};

vi.mock('node:fs', () => ({
	default: {
		existsSync: (p: string) => p in files,
		readFileSync: (p: string) => {
			if (!(p in files)) throw new Error(`ENOENT: ${p}`);
			return files[p];
		},
		readdirSync: (dir: string) => {
			const prefix = dir.endsWith('/') ? dir : dir + '/';
			const names = new Set<string>();
			for (const key of Object.keys(files)) {
				if (key.startsWith(prefix)) {
					const rest = key.slice(prefix.length);
					const firstSegment = rest.split('/')[0]!;
					names.add(firstSegment);
				}
			}
			return [...names].map(name => ({
				name,
				isDirectory: () => {
					const full = prefix + name + '/';
					return Object.keys(files).some(k => k.startsWith(full));
				},
			}));
		},
		writeFileSync: vi.fn(),
	},
}));

const manifest = JSON.stringify({
	name: 'test-plugin',
	description: 'A test plugin',
	version: '1.0.0',
});

function addPlugin(
	dir: string,
	opts?: {mcpServers?: Record<string, unknown>; skillName?: string},
) {
	files[dir] = '';
	files[`${dir}/.claude-plugin/plugin.json`] = manifest;
	files[`${dir}/skills`] = '';

	if (opts?.mcpServers) {
		files[`${dir}/.mcp.json`] = JSON.stringify({mcpServers: opts.mcpServers});
	}

	if (opts?.skillName) {
		files[`${dir}/skills/${opts.skillName}/SKILL.md`] =
			`---\nname: ${opts.skillName}\ndescription: Test\nuser-invocable: true\n---\nBody`;
	}
}

beforeEach(() => {
	for (const key of Object.keys(files)) {
		delete files[key];
	}
	clear();
	vi.clearAllMocks();
});

describe('registerPlugins', () => {
	it('returns undefined when no plugins have MCP configs', () => {
		addPlugin('/plugins/a', {skillName: 'cmd-a'});

		const result = registerPlugins(['/plugins/a']);

		expect(result).toBeUndefined();
	});

	it('returns a merged MCP config path when plugins have .mcp.json', () => {
		addPlugin('/plugins/a', {
			mcpServers: {server1: {command: 'node', args: ['s1.js']}},
			skillName: 'cmd-a',
		});

		const result = registerPlugins(['/plugins/a']);

		expect(result).toBeDefined();
		expect(typeof result).toBe('string');
	});

	it('merges mcpServers from multiple plugins', async () => {
		const fs = await import('node:fs');

		addPlugin('/plugins/a', {
			mcpServers: {serverA: {command: 'node', args: ['a.js']}},
			skillName: 'cmd-a',
		});
		addPlugin('/plugins/b', {
			mcpServers: {serverB: {command: 'node', args: ['b.js']}},
			skillName: 'cmd-b',
		});

		registerPlugins(['/plugins/a', '/plugins/b']);

		const writeCall = vi.mocked(fs.default.writeFileSync).mock.calls[0];
		expect(writeCall).toBeDefined();
		const written = JSON.parse(writeCall![1] as string);
		expect(written.mcpServers).toHaveProperty('serverA');
		expect(written.mcpServers).toHaveProperty('serverB');
	});

	it('skips plugins without .mcp.json when merging', async () => {
		const fs = await import('node:fs');

		addPlugin('/plugins/a', {
			mcpServers: {serverA: {command: 'node', args: ['a.js']}},
			skillName: 'cmd-a',
		});
		addPlugin('/plugins/b', {skillName: 'cmd-b'});

		registerPlugins(['/plugins/a', '/plugins/b']);

		const writeCall = vi.mocked(fs.default.writeFileSync).mock.calls[0];
		expect(writeCall).toBeDefined();
		const written = JSON.parse(writeCall![1] as string);
		expect(written.mcpServers).toHaveProperty('serverA');
		expect(written.mcpServers).not.toHaveProperty('serverB');
	});

	it('still registers commands alongside MCP config merging', () => {
		addPlugin('/plugins/a', {
			mcpServers: {serverA: {command: 'node', args: ['a.js']}},
			skillName: 'cmd-a',
		});

		registerPlugins(['/plugins/a']);

		// Commands should still be registered
		expect(get('cmd-a')).toBeDefined();
	});
});
