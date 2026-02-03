import {describe, it, expect} from 'vitest';
import {parseToolName, formatInlineParams} from './toolNameParser.js';

describe('parseToolName', () => {
	it('parses MCP tool name into server and action', () => {
		const result = parseToolName('mcp__agent-web-interface__navigate');
		expect(result).toEqual({
			displayName: 'agent-web-interface - navigate (MCP)',
			isMcp: true,
			mcpServer: 'agent-web-interface',
			mcpAction: 'navigate',
		});
	});

	it('handles MCP tool with underscores in action', () => {
		const result = parseToolName('mcp__server__get_element_details');
		expect(result).toEqual({
			displayName: 'server - get_element_details (MCP)',
			isMcp: true,
			mcpServer: 'server',
			mcpAction: 'get_element_details',
		});
	});

	it('handles MCP tool with hyphenated server name', () => {
		const result = parseToolName('mcp__my-server__do_thing');
		expect(result).toEqual({
			displayName: 'my-server - do_thing (MCP)',
			isMcp: true,
			mcpServer: 'my-server',
			mcpAction: 'do_thing',
		});
	});

	it('returns built-in tool name as-is', () => {
		const result = parseToolName('Bash');
		expect(result).toEqual({
			displayName: 'Bash',
			isMcp: false,
		});
	});

	it('returns non-MCP tool name with underscores as-is', () => {
		const result = parseToolName('some_tool');
		expect(result).toEqual({
			displayName: 'some_tool',
			isMcp: false,
		});
	});

	it('does not parse single mcp__ prefix without action', () => {
		const result = parseToolName('mcp__server');
		expect(result).toEqual({
			displayName: 'mcp__server',
			isMcp: false,
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
