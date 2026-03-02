import {describe, it, expect, vi, beforeEach} from 'vitest';
import {collectMcpServersWithOptions} from '../mcpOptions';

// Virtual file system for tests
const files: Record<string, string> = {};

vi.mock('node:fs', () => ({
	default: {
		existsSync: (p: string) => p in files,
		readFileSync: (p: string) => {
			if (!(p in files)) throw new Error(`ENOENT: ${p}`);
			return files[p];
		},
	},
}));

beforeEach(() => {
	for (const key of Object.keys(files)) {
		delete files[key];
	}
});

describe('collectMcpServersWithOptions', () => {
	it('returns empty array when no plugin dirs have .mcp.json', () => {
		expect(collectMcpServersWithOptions(['/plugins/a'])).toEqual([]);
	});

	it('returns empty array when servers have no options field', () => {
		files['/plugins/a/.mcp.json'] = JSON.stringify({
			mcpServers: {
				'my-server': {command: 'npx', args: ['my-server']},
			},
		});

		expect(collectMcpServersWithOptions(['/plugins/a'])).toEqual([]);
	});

	it('returns empty array when options is an empty array', () => {
		files['/plugins/a/.mcp.json'] = JSON.stringify({
			mcpServers: {
				'my-server': {command: 'npx', args: [], options: []},
			},
		});

		expect(collectMcpServersWithOptions(['/plugins/a'])).toEqual([]);
	});

	it('returns servers with non-empty options', () => {
		files['/plugins/a/.mcp.json'] = JSON.stringify({
			mcpServers: {
				'agent-web-interface': {
					command: 'npx',
					args: ['agent-web-interface'],
					options: [
						{label: 'Visible browser (default)', args: []},
						{label: 'Headless browser', args: ['--headless']},
					],
				},
			},
		});

		const result = collectMcpServersWithOptions(['/plugins/a']);

		expect(result).toHaveLength(1);
		expect(result[0]!.serverName).toBe('agent-web-interface');
		expect(result[0]!.options).toHaveLength(2);
		expect(result[0]!.options[0]!.label).toBe('Visible browser (default)');
		expect(result[0]!.options[1]!.args).toEqual(['--headless']);
	});

	it('skips duplicate server names across plugins', () => {
		files['/plugins/a/.mcp.json'] = JSON.stringify({
			mcpServers: {
				'my-server': {
					command: 'npx',
					args: [],
					options: [{label: 'Option A', args: ['--a']}],
				},
			},
		});
		files['/plugins/b/.mcp.json'] = JSON.stringify({
			mcpServers: {
				'my-server': {
					command: 'npx',
					args: [],
					options: [{label: 'Option B', args: ['--b']}],
				},
			},
		});

		const result = collectMcpServersWithOptions(['/plugins/a', '/plugins/b']);

		expect(result).toHaveLength(1);
		// First one wins
		expect(result[0]!.options[0]!.label).toBe('Option A');
	});

	it('collects from multiple plugins with different servers', () => {
		files['/plugins/a/.mcp.json'] = JSON.stringify({
			mcpServers: {
				serverA: {
					command: 'npx',
					args: [],
					options: [{label: 'A opt', args: ['--a']}],
				},
			},
		});
		files['/plugins/b/.mcp.json'] = JSON.stringify({
			mcpServers: {
				serverB: {
					command: 'npx',
					args: [],
					options: [{label: 'B opt', args: ['--b']}],
				},
			},
		});

		const result = collectMcpServersWithOptions(['/plugins/a', '/plugins/b']);

		expect(result).toHaveLength(2);
		expect(result.map(r => r.serverName)).toEqual(['serverA', 'serverB']);
	});

	it('only includes servers with options, skips those without', () => {
		files['/plugins/a/.mcp.json'] = JSON.stringify({
			mcpServers: {
				'with-options': {
					command: 'npx',
					args: [],
					options: [{label: 'Opt', args: ['--opt']}],
				},
				'without-options': {
					command: 'npx',
					args: ['--plain'],
				},
			},
		});

		const result = collectMcpServersWithOptions(['/plugins/a']);

		expect(result).toHaveLength(1);
		expect(result[0]!.serverName).toBe('with-options');
	});
});
