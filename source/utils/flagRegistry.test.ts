import {describe, it, expect} from 'vitest';
import {
	buildIsolationArgs,
	validateConflicts,
	FLAG_REGISTRY,
	type FlagDef,
} from './flagRegistry.js';
import {
	type IsolationConfig,
	resolveIsolationConfig,
} from '../types/isolation.js';

describe('FLAG_REGISTRY', () => {
	it('should contain exactly 29 flag definitions', () => {
		expect(FLAG_REGISTRY).toHaveLength(29);
	});

	it('should have unique field+flag combinations', () => {
		const keys = FLAG_REGISTRY.map(
			(def: FlagDef) => `${def.field}:${def.flag}`,
		);
		expect(new Set(keys).size).toBe(keys.length);
	});

	it('should not include continueSession (handled separately in spawnClaude)', () => {
		const fields = FLAG_REGISTRY.map((def: FlagDef) => def.field);
		expect(fields).not.toContain('continueSession');
	});
});

describe('buildIsolationArgs', () => {
	it('should return empty args for empty config', () => {
		expect(buildIsolationArgs({})).toEqual([]);
	});

	it('should return empty args for config with only undefined values', () => {
		const config: IsolationConfig = {
			model: undefined,
			verbose: undefined,
		};
		expect(buildIsolationArgs(config)).toEqual([]);
	});

	// === FlagKind: boolean ===
	describe('boolean kind', () => {
		it('should emit flag when value is true', () => {
			const args = buildIsolationArgs({verbose: true});
			expect(args).toEqual(['--verbose']);
		});

		it('should skip flag when value is false', () => {
			const args = buildIsolationArgs({verbose: false});
			expect(args).toEqual([]);
		});

		it('should skip flag when value is undefined', () => {
			const args = buildIsolationArgs({});
			expect(args).not.toContain('--verbose');
		});

		it('should handle multiple boolean flags', () => {
			const args = buildIsolationArgs({
				dangerouslySkipPermissions: true,
				forkSession: true,
				noSessionPersistence: true,
				disableSlashCommands: true,
				includePartialMessages: true,
			});
			expect(args).toContain('--dangerously-skip-permissions');
			expect(args).toContain('--fork-session');
			expect(args).toContain('--no-session-persistence');
			expect(args).toContain('--disable-slash-commands');
			expect(args).toContain('--include-partial-messages');
		});
	});

	// === FlagKind: value ===
	describe('value kind', () => {
		it('should emit flag with string value', () => {
			const args = buildIsolationArgs({model: 'sonnet'});
			expect(args).toEqual(['--model', 'sonnet']);
		});

		it('should emit flag with empty string value', () => {
			const args = buildIsolationArgs({tools: ''});
			expect(args).toEqual(['--tools', '']);
		});

		it('should convert numeric values to string', () => {
			const args = buildIsolationArgs({maxTurns: 10});
			expect(args).toEqual(['--max-turns', '10']);
		});

		it('should convert maxBudgetUsd numeric value to string', () => {
			const args = buildIsolationArgs({maxBudgetUsd: 5.5});
			expect(args).toEqual(['--max-budget-usd', '5.5']);
		});

		it('should handle zero as a valid numeric value', () => {
			const args = buildIsolationArgs({maxTurns: 0});
			expect(args).toEqual(['--max-turns', '0']);
		});

		it('should skip value flags when undefined', () => {
			const args = buildIsolationArgs({model: undefined});
			expect(args).toEqual([]);
		});
	});

	// === FlagKind: array ===
	describe('array kind', () => {
		it('should emit one flag per array element', () => {
			const args = buildIsolationArgs({
				allowedTools: ['Bash', 'Read', 'Write'],
			});
			expect(args).toEqual([
				'--allowedTools',
				'Bash',
				'--allowedTools',
				'Read',
				'--allowedTools',
				'Write',
			]);
		});

		it('should skip empty arrays', () => {
			const args = buildIsolationArgs({allowedTools: []});
			expect(args).toEqual([]);
		});

		it('should handle multiple array flags', () => {
			const args = buildIsolationArgs({
				disallowedTools: ['Bash'],
				additionalDirectories: ['/tmp', '/home'],
				pluginDirs: ['/plugins/a'],
			});
			expect(args).toEqual([
				'--disallowedTools',
				'Bash',
				'--add-dir',
				'/tmp',
				'--add-dir',
				'/home',
				'--plugin-dir',
				'/plugins/a',
			]);
		});

		it('should emit allowedTools from resolved strict preset', () => {
			const config = resolveIsolationConfig('strict');
			const args = buildIsolationArgs(config);
			// strict preset has 6 allowed tools
			expect(args.filter(a => a === '--allowedTools')).toHaveLength(6);
			expect(args).toContain('Read');
			expect(args).toContain('Edit');
			expect(args).toContain('Bash');
		});
	});

	// === FlagKind: json ===
	describe('json kind', () => {
		it('should JSON.stringify the value', () => {
			const agents = {
				reviewer: {
					description: 'Code reviewer',
					prompt: 'Review the code',
				},
			};
			const args = buildIsolationArgs({agents});
			expect(args).toEqual(['--agents', JSON.stringify(agents)]);
		});

		it('should skip when value is undefined', () => {
			const args = buildIsolationArgs({agents: undefined});
			expect(args).toEqual([]);
		});
	});

	// === FlagKind: hybrid ===
	describe('hybrid kind (debug)', () => {
		it('should emit flag only when value is true (boolean)', () => {
			const args = buildIsolationArgs({debug: true});
			expect(args).toEqual(['--debug']);
		});

		it('should emit flag with value when value is string', () => {
			const args = buildIsolationArgs({debug: 'api,hooks'});
			expect(args).toEqual(['--debug', 'api,hooks']);
		});

		it('should skip when value is false', () => {
			const args = buildIsolationArgs({debug: false});
			expect(args).toEqual([]);
		});

		it('should skip when value is undefined', () => {
			const args = buildIsolationArgs({debug: undefined});
			expect(args).toEqual([]);
		});
	});

	// === FlagKind: jsonOrString ===
	describe('jsonOrString kind (jsonSchema)', () => {
		it('should pass string value as-is', () => {
			const args = buildIsolationArgs({jsonSchema: '{"type":"object"}'});
			expect(args).toEqual(['--json-schema', '{"type":"object"}']);
		});

		it('should JSON.stringify object value', () => {
			const schema = {type: 'object', properties: {name: {type: 'string'}}};
			const args = buildIsolationArgs({jsonSchema: schema});
			expect(args).toEqual(['--json-schema', JSON.stringify(schema)]);
		});

		it('should skip when value is undefined', () => {
			const args = buildIsolationArgs({jsonSchema: undefined});
			expect(args).toEqual([]);
		});
	});

	// === suppressedBy ===
	describe('suppressedBy logic', () => {
		it('should suppress strictMcpConfig when mcpConfig is set', () => {
			const args = buildIsolationArgs({
				mcpConfig: '/path/to/mcp.json',
				strictMcpConfig: true,
			});
			expect(args).toContain('--mcp-config');
			expect(args).toContain('/path/to/mcp.json');
			expect(args).not.toContain('--strict-mcp-config');
		});

		it('should emit strictMcpConfig when mcpConfig is not set', () => {
			const args = buildIsolationArgs({strictMcpConfig: true});
			expect(args).toEqual(['--strict-mcp-config']);
		});

		it('should not emit strictMcpConfig when mcpConfig is set even if strictMcpConfig is true', () => {
			const args = buildIsolationArgs({
				mcpConfig: 'config.json',
				strictMcpConfig: true,
			});
			// strictMcpConfig should be suppressed
			expect(args).toEqual(['--mcp-config', 'config.json']);
		});
	});

	// === Comprehensive config ===
	describe('comprehensive config', () => {
		it('should produce correct args for a fully populated config', () => {
			const config: IsolationConfig = {
				mcpConfig: '/mcp.json',
				strictMcpConfig: true, // suppressed by mcpConfig
				allowedTools: ['Bash', 'Read'],
				disallowedTools: ['Write'],
				tools: 'default',
				permissionMode: 'plan',
				dangerouslySkipPermissions: true,
				allowDangerouslySkipPermissions: true,
				additionalDirectories: ['/tmp'],
				model: 'opus',
				fallbackModel: 'sonnet',
				agent: 'my-agent',
				agents: {helper: {description: 'A helper', prompt: 'Help'}},
				systemPrompt: 'You are helpful',
				systemPromptFile: '/prompt.txt',
				appendSystemPrompt: 'Extra instructions',
				appendSystemPromptFile: '/append.txt',
				forkSession: true,
				noSessionPersistence: true,
				verbose: true,
				debug: 'api',
				maxTurns: 5,
				maxBudgetUsd: 2.0,
				pluginDirs: ['/plugins'],
				disableSlashCommands: true,
				chrome: true,
				noChrome: false, // false should be skipped
				jsonSchema: {type: 'object'},
				includePartialMessages: true,
			};

			const args = buildIsolationArgs(config);

			// mcpConfig present, strictMcpConfig suppressed
			expect(args).toContain('--mcp-config');
			expect(args).not.toContain('--strict-mcp-config');

			// Value flags
			expect(args).toContain('--tools');
			expect(args).toContain('--permission-mode');
			expect(args).toContain('--model');
			expect(args).toContain('--fallback-model');
			expect(args).toContain('--agent');
			expect(args).toContain('--system-prompt');
			expect(args).toContain('--system-prompt-file');
			expect(args).toContain('--append-system-prompt');
			expect(args).toContain('--append-system-prompt-file');

			// Boolean flags
			expect(args).toContain('--dangerously-skip-permissions');
			expect(args).toContain('--allow-dangerously-skip-permissions');
			expect(args).toContain('--fork-session');
			expect(args).toContain('--no-session-persistence');
			expect(args).toContain('--verbose');
			expect(args).toContain('--disable-slash-commands');
			expect(args).toContain('--chrome');
			expect(args).toContain('--include-partial-messages');

			// noChrome is false, should NOT be in args
			expect(args).not.toContain('--no-chrome');

			// Array flags
			expect(args.filter(a => a === '--allowedTools')).toHaveLength(2);
			expect(args.filter(a => a === '--disallowedTools')).toHaveLength(1);
			expect(args.filter(a => a === '--add-dir')).toHaveLength(1);
			expect(args.filter(a => a === '--plugin-dir')).toHaveLength(1);

			// JSON flags
			expect(args).toContain('--agents');
			expect(args).toContain(
				JSON.stringify({helper: {description: 'A helper', prompt: 'Help'}}),
			);

			// Hybrid debug with string
			expect(args).toContain('--debug');
			expect(args).toContain('api');

			// Numeric conversions
			expect(args).toContain('--max-turns');
			expect(args).toContain('5');
			expect(args).toContain('--max-budget-usd');
			expect(args).toContain('2');

			// jsonOrString with object
			expect(args).toContain('--json-schema');
			expect(args).toContain(JSON.stringify({type: 'object'}));
		});
	});

	// === Registry ordering ===
	describe('flag ordering', () => {
		it('should emit flags in registry order', () => {
			const args = buildIsolationArgs({
				model: 'opus',
				verbose: true,
				mcpConfig: '/mcp.json',
			});

			const mcpIdx = args.indexOf('--mcp-config');
			const modelIdx = args.indexOf('--model');
			const verboseIdx = args.indexOf('--verbose');

			// mcpConfig comes before model in the registry
			expect(mcpIdx).toBeLessThan(modelIdx);
			// model comes before verbose in the registry
			expect(modelIdx).toBeLessThan(verboseIdx);
		});
	});
});

describe('validateConflicts', () => {
	it('should return empty array when no conflicts', () => {
		const warnings = validateConflicts({model: 'opus', verbose: true});
		expect(warnings).toEqual([]);
	});

	it('should return empty array for empty config', () => {
		expect(validateConflicts({})).toEqual([]);
	});

	it('should detect chrome + noChrome conflict', () => {
		const warnings = validateConflicts({chrome: true, noChrome: true});
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toContain('chrome');
		expect(warnings[0]).toContain('noChrome');
	});

	it('should deduplicate conflict pairs (reported only once)', () => {
		// chrome conflicts with noChrome AND noChrome conflicts with chrome
		// but should only produce one warning
		const warnings = validateConflicts({chrome: true, noChrome: true});
		expect(warnings).toHaveLength(1);
	});

	it('should not report conflict when only one side is set', () => {
		expect(validateConflicts({chrome: true})).toEqual([]);
		expect(validateConflicts({noChrome: true})).toEqual([]);
	});

	it('should not report conflict when conflicting field is false', () => {
		expect(validateConflicts({chrome: true, noChrome: false})).toEqual([]);
	});
});
