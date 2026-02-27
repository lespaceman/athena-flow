import {describe, it, expect} from 'vitest';
import {
	ISOLATION_PRESETS,
	resolveIsolationConfig,
} from './isolation';

describe('ISOLATION_PRESETS', () => {
	it('strict preset should allow core read/edit/search tools', () => {
		const preset = ISOLATION_PRESETS.strict;
		expect(preset.allowedTools).toBeDefined();
		expect(preset.allowedTools).toContain('Read');
		expect(preset.allowedTools).toContain('Edit');
		expect(preset.allowedTools).toContain('Glob');
		expect(preset.allowedTools).toContain('Grep');
		expect(preset.allowedTools).toContain('Bash');
		// strict should NOT allow network or MCP tools
		expect(preset.allowedTools).not.toContain('WebSearch');
		expect(preset.allowedTools).not.toContain('WebFetch');
	});

	it('minimal preset should allow core tools plus web, subagents, and MCP wildcard', () => {
		const preset = ISOLATION_PRESETS.minimal;
		expect(preset.allowedTools).toBeDefined();
		// Core tools
		expect(preset.allowedTools).toContain('Read');
		expect(preset.allowedTools).toContain('Edit');
		expect(preset.allowedTools).toContain('Write');
		expect(preset.allowedTools).toContain('Bash');
		// Extended tools
		expect(preset.allowedTools).toContain('WebSearch');
		expect(preset.allowedTools).toContain('WebFetch');
		expect(preset.allowedTools).toContain('Task');
		// MCP wildcard — minimal allows project MCP servers, so must allow MCP tools
		expect(preset.allowedTools).toContain('mcp__*');
	});

	it('permissive preset should allow all tools including MCP wildcard', () => {
		const preset = ISOLATION_PRESETS.permissive;
		expect(preset.allowedTools).toBeDefined();
		expect(preset.allowedTools).toContain('WebSearch');
		expect(preset.allowedTools).toContain('Task');
		expect(preset.allowedTools).toContain('mcp__*');
	});

	it('all presets should include strictMcpConfig', () => {
		expect(ISOLATION_PRESETS.strict.strictMcpConfig).toBe(true);
		expect(ISOLATION_PRESETS.minimal.strictMcpConfig).toBe(false);
		expect(ISOLATION_PRESETS.permissive.strictMcpConfig).toBe(false);
	});
});

describe('resolveIsolationConfig', () => {
	it('should default to strict preset when no config provided', () => {
		const config = resolveIsolationConfig();
		expect(config.allowedTools).toEqual(ISOLATION_PRESETS.strict.allowedTools);
		expect(config.strictMcpConfig).toBe(true);
	});

	it('should expand string preset', () => {
		const config = resolveIsolationConfig('permissive');
		expect(config.allowedTools).toEqual(
			ISOLATION_PRESETS.permissive.allowedTools,
		);
	});

	it('should allow custom config to override preset allowedTools', () => {
		const config = resolveIsolationConfig({
			preset: 'strict',
			allowedTools: ['Read'],
		});
		// Custom allowedTools should override preset's
		expect(config.allowedTools).toEqual(['Read']);
	});

	it('should return custom config as-is when no preset specified', () => {
		const config = resolveIsolationConfig({
			allowedTools: ['Bash'],
			strictMcpConfig: true,
		});
		expect(config.allowedTools).toEqual(['Bash']);
	});
});
