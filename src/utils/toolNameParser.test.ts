import {describe, it, expect} from 'vitest';
import {
	parseToolName,
	formatInlineParams,
	formatArgs,
} from './toolNameParser.js';

describe('parseToolName', () => {
	it('parses MCP tool name into server and action', () => {
		const result = parseToolName('mcp__agent-web-interface__navigate');
		expect(result).toEqual({
			displayName: 'navigate',
			isMcp: true,
			mcpServer: 'agent-web-interface',
			mcpAction: 'navigate',
			serverLabel: 'agent-web-interface (MCP)',
		});
	});

	it('handles MCP tool with underscores in action', () => {
		const result = parseToolName('mcp__server__get_element_details');
		expect(result).toEqual({
			displayName: 'get_element_details',
			isMcp: true,
			mcpServer: 'server',
			mcpAction: 'get_element_details',
			serverLabel: 'server (MCP)',
		});
	});

	it('handles MCP tool with hyphenated server name', () => {
		const result = parseToolName('mcp__my-server__do_thing');
		expect(result).toEqual({
			displayName: 'do_thing',
			isMcp: true,
			mcpServer: 'my-server',
			mcpAction: 'do_thing',
			serverLabel: 'my-server (MCP)',
		});
	});

	it('returns built-in tool name as-is with no serverLabel', () => {
		const result = parseToolName('Bash');
		expect(result).toEqual({
			displayName: 'Bash',
			isMcp: false,
		});
		expect(result.serverLabel).toBeUndefined();
	});

	it('returns non-MCP tool name with underscores as-is', () => {
		const result = parseToolName('some_tool');
		expect(result).toEqual({
			displayName: 'some_tool',
			isMcp: false,
		});
		expect(result.serverLabel).toBeUndefined();
	});

	it('does not parse single mcp__ prefix without action', () => {
		const result = parseToolName('mcp__server');
		expect(result).toEqual({
			displayName: 'mcp__server',
			isMcp: false,
		});
		expect(result.serverLabel).toBeUndefined();
	});

	describe('plugin prefix patterns', () => {
		it('extracts friendly server from plugin prefix', () => {
			const result = parseToolName(
				'mcp__plugin_web-testing-toolkit_agent-web-interface__navigate',
			);
			expect(result).toEqual({
				displayName: 'navigate',
				isMcp: true,
				mcpServer: 'plugin_web-testing-toolkit_agent-web-interface',
				mcpAction: 'navigate',
				serverLabel: 'agent-web-interface (MCP)',
			});
		});

		it('extracts friendly server from plugin prefix with complex action', () => {
			const result = parseToolName(
				'mcp__plugin_web-testing-toolkit_agent-web-interface__get_element_details',
			);
			expect(result).toEqual({
				displayName: 'get_element_details',
				isMcp: true,
				mcpServer: 'plugin_web-testing-toolkit_agent-web-interface',
				mcpAction: 'get_element_details',
				serverLabel: 'agent-web-interface (MCP)',
			});
		});

		it('handles plugin prefix with go_back action', () => {
			const result = parseToolName(
				'mcp__plugin_web-testing-toolkit_agent-web-interface__go_back',
			);
			expect(result).toEqual({
				displayName: 'go_back',
				isMcp: true,
				mcpServer: 'plugin_web-testing-toolkit_agent-web-interface',
				mcpAction: 'go_back',
				serverLabel: 'agent-web-interface (MCP)',
			});
		});
	});

	describe('serverLabel behavior', () => {
		it('provides serverLabel for standard MCP tools', () => {
			const result = parseToolName('mcp__agent-web-interface__go_back');
			expect(result.displayName).toBe('go_back');
			expect(result.serverLabel).toBe('agent-web-interface (MCP)');
		});

		it('provides serverLabel for plugin MCP tools', () => {
			const result = parseToolName(
				'mcp__plugin_web-testing-toolkit_agent-web-interface__navigate',
			);
			expect(result.serverLabel).toBe('agent-web-interface (MCP)');
		});

		it('does not provide serverLabel for built-in tools', () => {
			const result = parseToolName('Bash');
			expect(result.serverLabel).toBeUndefined();
		});

		it('does not provide serverLabel for Read tool', () => {
			const result = parseToolName('Read');
			expect(result.serverLabel).toBeUndefined();
		});

		it('does not provide serverLabel for Write tool', () => {
			const result = parseToolName('Write');
			expect(result.serverLabel).toBeUndefined();
		});
	});
});

describe('formatInlineParams', () => {
	it('formats string values with quotes', () => {
		const result = formatInlineParams({url: 'https://example.com'});
		expect(result).toBe('(url: "https://example.com")');
	});

	it('formats numeric values without quotes', () => {
		const result = formatInlineParams({timeout: 5000});
		expect(result).toBe('(timeout: 5000)');
	});

	it('formats boolean values without quotes', () => {
		const result = formatInlineParams({force: true});
		expect(result).toBe('(force: true)');
	});

	it('formats multiple params', () => {
		const result = formatInlineParams({command: 'ls', timeout: 5000});
		expect(result).toBe('(command: "ls", timeout: 5000)');
	});

	it('returns empty string for empty input', () => {
		const result = formatInlineParams({});
		expect(result).toBe('');
	});

	it('truncates when over maxLen', () => {
		const result = formatInlineParams(
			{
				file_path: '/very/long/path/to/some/file.txt',
				content: 'a'.repeat(100),
			},
			60,
		);
		expect(result.length).toBeLessThanOrEqual(60);
		expect(result).toContain('...');
	});

	it('always includes at least the first param', () => {
		const result = formatInlineParams({command: 'ls -la'}, 30);
		expect(result).toContain('command');
	});

	it('produces balanced parentheses when truncating single param', () => {
		const result = formatInlineParams({content: 'a'.repeat(200)}, 40);
		expect(result.startsWith('(')).toBe(true);
		expect(result.endsWith('...)')).toBe(true);
		expect(result.length).toBeLessThanOrEqual(40);
	});

	it('produces balanced parentheses when truncating multiple params', () => {
		const result = formatInlineParams(
			{command: 'ls -la', timeout: 5000, verbose: true},
			40,
		);
		expect(result.startsWith('(')).toBe(true);
		expect(result.endsWith(')')).toBe(true);
	});
});

describe('formatArgs', () => {
	describe('empty/undefined handling', () => {
		it('returns "(none)" for empty object', () => {
			expect(formatArgs({})).toBe('(none)');
		});

		it('returns "(none)" for undefined', () => {
			expect(formatArgs(undefined)).toBe('(none)');
		});
	});

	describe('string values', () => {
		it('formats string values with quotes', () => {
			expect(formatArgs({command: 'ls -la'})).toBe('command: "ls -la"');
		});

		it('formats multiple string values', () => {
			expect(formatArgs({file_path: '/tmp/test.ts', content: 'hello'})).toBe(
				'file_path: "/tmp/test.ts", content: "hello"',
			);
		});

		it('truncates long string values at 40 chars with ellipsis', () => {
			const longValue = 'a'.repeat(50);
			const result = formatArgs({value: longValue});
			expect(result).toBe(`value: "${'a'.repeat(37)}..."`);
		});
	});

	describe('boolean values', () => {
		it('formats boolean true without quotes', () => {
			expect(formatArgs({clear: true})).toBe('clear: true');
		});

		it('formats boolean false without quotes', () => {
			expect(formatArgs({enabled: false})).toBe('enabled: false');
		});
	});

	describe('number values', () => {
		it('formats number values without quotes', () => {
			expect(formatArgs({timeout: 5000})).toBe('timeout: 5000');
		});

		it('formats negative numbers', () => {
			expect(formatArgs({offset: -10})).toBe('offset: -10');
		});

		it('formats decimal numbers', () => {
			expect(formatArgs({ratio: 0.5})).toBe('ratio: 0.5');
		});
	});

	describe('object/array values', () => {
		it('formats object values as [object]', () => {
			expect(formatArgs({config: {key: 'value'}})).toBe('config: [object]');
		});

		it('formats array values as [object]', () => {
			expect(formatArgs({items: [1, 2, 3]})).toBe('items: [object]');
		});

		it('formats null as [object]', () => {
			expect(formatArgs({value: null})).toBe('value: [object]');
		});
	});

	describe('mixed types', () => {
		it('formats mixed types correctly', () => {
			const result = formatArgs({
				command: 'ls',
				timeout: 5000,
				force: true,
			});
			expect(result).toBe('command: "ls", timeout: 5000, force: true');
		});
	});

	describe('total length truncation', () => {
		it('uses default maxLength of 80', () => {
			const result = formatArgs({
				file_path: '/very/long/path/to/file.txt',
				content: 'some content here',
				timeout: 5000,
				force: true,
			});
			expect(result.length).toBeLessThanOrEqual(80);
		});

		it('truncates total output to custom maxLength with ellipsis', () => {
			const result = formatArgs(
				{
					file_path: '/tmp/test.ts',
					content: 'hello world',
				},
				30,
			);
			expect(result.length).toBeLessThanOrEqual(30);
			expect(result.endsWith('...')).toBe(true);
		});

		it('does not truncate if within maxLength', () => {
			const result = formatArgs({command: 'ls'}, 80);
			expect(result).toBe('command: "ls"');
			expect(result.endsWith('...')).toBe(false);
		});
	});
});
