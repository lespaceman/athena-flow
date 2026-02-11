import {type IsolationConfig} from '../types/isolation.js';

/**
 * The kind of CLI flag mapping for a given IsolationConfig field.
 *
 * - boolean:      truthy → emit flag only (e.g. --verbose)
 * - value:        emit flag + value as string (numbers converted via String())
 * - array:        emit flag + value once per element (e.g. --allowedTools X --allowedTools Y)
 * - json:         emit flag + JSON.stringify(value)
 * - hybrid:       boolean true → flag only; string → flag + value (e.g. --debug or --debug "api")
 * - jsonOrString: string → flag + value as-is; object → flag + JSON.stringify(value)
 */
export type FlagKind =
	| 'boolean'
	| 'value'
	| 'array'
	| 'json'
	| 'hybrid'
	| 'jsonOrString';

/**
 * Maps one IsolationConfig field to its CLI flag.
 */
export type FlagDef = {
	field: keyof IsolationConfig;
	flag: string;
	kind: FlagKind;
	/** Skip this flag if the suppressedBy field is set on the config */
	suppressedBy?: keyof IsolationConfig;
	/** Mutually exclusive fields (used for conflict validation) */
	conflicts?: Array<keyof IsolationConfig>;
};

/**
 * Declarative registry of all IsolationConfig fields and their CLI flag mappings.
 *
 * continueSession is excluded -- it has special precedence logic
 * (sessionId vs --continue) handled directly in spawnClaude.
 */
export const FLAG_REGISTRY: FlagDef[] = [
	// === MCP Configuration ===
	{field: 'mcpConfig', flag: '--mcp-config', kind: 'value'},
	{
		field: 'strictMcpConfig',
		flag: '--strict-mcp-config',
		kind: 'boolean',
		suppressedBy: 'mcpConfig',
	},

	// === Tool Access ===
	{field: 'allowedTools', flag: '--allowedTools', kind: 'array'},
	{field: 'disallowedTools', flag: '--disallowedTools', kind: 'array'},
	{field: 'tools', flag: '--tools', kind: 'value'},

	// === Permission & Security ===
	{field: 'permissionMode', flag: '--permission-mode', kind: 'value'},
	{
		field: 'dangerouslySkipPermissions',
		flag: '--dangerously-skip-permissions',
		kind: 'boolean',
	},
	{
		field: 'allowDangerouslySkipPermissions',
		flag: '--allow-dangerously-skip-permissions',
		kind: 'boolean',
	},

	// === Directories ===
	{field: 'additionalDirectories', flag: '--add-dir', kind: 'array'},

	// === Model & Agent ===
	{field: 'model', flag: '--model', kind: 'value'},
	{field: 'fallbackModel', flag: '--fallback-model', kind: 'value'},
	{field: 'agent', flag: '--agent', kind: 'value'},
	{field: 'agents', flag: '--agents', kind: 'json'},

	// === System Prompt ===
	{field: 'systemPrompt', flag: '--system-prompt', kind: 'value'},
	{field: 'systemPromptFile', flag: '--system-prompt-file', kind: 'value'},
	{field: 'appendSystemPrompt', flag: '--append-system-prompt', kind: 'value'},
	{
		field: 'appendSystemPromptFile',
		flag: '--append-system-prompt-file',
		kind: 'value',
	},

	// === Session Management ===
	{field: 'forkSession', flag: '--fork-session', kind: 'boolean'},
	{
		field: 'noSessionPersistence',
		flag: '--no-session-persistence',
		kind: 'boolean',
	},

	// === Output & Debugging ===
	{field: 'verbose', flag: '--verbose', kind: 'boolean'},
	{field: 'debug', flag: '--debug', kind: 'hybrid'},

	// === Limits ===
	{field: 'maxTurns', flag: '--max-turns', kind: 'value'},
	{field: 'maxBudgetUsd', flag: '--max-budget-usd', kind: 'value'},

	// === Plugins ===
	{field: 'pluginDirs', flag: '--plugin-dir', kind: 'array'},

	// === Features ===
	{
		field: 'disableSlashCommands',
		flag: '--disable-slash-commands',
		kind: 'boolean',
	},
	{
		field: 'chrome',
		flag: '--chrome',
		kind: 'boolean',
		conflicts: ['noChrome'],
	},
	{
		field: 'noChrome',
		flag: '--no-chrome',
		kind: 'boolean',
		conflicts: ['chrome'],
	},

	// === Structured Output ===
	{field: 'jsonSchema', flag: '--json-schema', kind: 'jsonOrString'},
	{
		field: 'includePartialMessages',
		flag: '--include-partial-messages',
		kind: 'boolean',
	},
];

/**
 * Build CLI argument array from an IsolationConfig by iterating the flag registry.
 *
 * Handles each FlagKind appropriately:
 * - boolean:      truthy → [flag]
 * - value:        defined (including "") → [flag, String(value)]
 * - array:        non-empty → [flag, el1, flag, el2, ...]
 * - json:         defined → [flag, JSON.stringify(value)]
 * - hybrid:       true → [flag]; string → [flag, value]
 * - jsonOrString: string → [flag, value]; object → [flag, JSON.stringify(value)]
 *
 * Respects suppressedBy: if the suppressing field is truthy, the flag is skipped.
 */
export function buildIsolationArgs(config: IsolationConfig): string[] {
	const args: string[] = [];

	for (const def of FLAG_REGISTRY) {
		const value = config[def.field];

		// Skip undefined values
		if (value === undefined) continue;

		// Check suppressedBy: skip if the suppressing field is truthy.
		// Uses truthiness (not !== undefined) to match the existing spawnClaude
		// behavior where `if (isolationConfig.mcpConfig)` skips empty strings.
		if (def.suppressedBy && config[def.suppressedBy]) {
			continue;
		}

		switch (def.kind) {
			case 'boolean': {
				if (value) {
					args.push(def.flag);
				}
				break;
			}

			case 'value': {
				// For value kind, we emit even for empty string (tools: "")
				// but skip for falsy non-zero/non-empty-string (shouldn't happen with proper types)
				args.push(def.flag, String(value));
				break;
			}

			case 'array': {
				const arr = value as string[];
				if (arr.length) {
					for (const item of arr) {
						args.push(def.flag, item);
					}
				}
				break;
			}

			case 'json': {
				args.push(def.flag, JSON.stringify(value));
				break;
			}

			case 'hybrid': {
				if (typeof value === 'string') {
					args.push(def.flag, value);
				} else if (value) {
					args.push(def.flag);
				}
				break;
			}

			case 'jsonOrString': {
				if (typeof value === 'string') {
					args.push(def.flag, value);
				} else {
					args.push(def.flag, JSON.stringify(value));
				}
				break;
			}
		}
	}

	return args;
}

/**
 * Validate that no mutually exclusive fields are both set on the config.
 *
 * Returns human-readable warning strings. Each conflict pair is reported
 * only once (deduplicated).
 */
export function validateConflicts(config: IsolationConfig): string[] {
	const warnings: string[] = [];
	const reported = new Set<string>();

	for (const def of FLAG_REGISTRY) {
		if (!def.conflicts) continue;

		const value = config[def.field];
		if (!value) continue;

		for (const conflictField of def.conflicts) {
			const conflictValue = config[conflictField];
			if (!conflictValue) continue;

			// Build a canonical key so we only report each pair once
			const pairKey = [def.field, conflictField].sort().join(':');
			if (reported.has(pairKey)) continue;
			reported.add(pairKey);

			warnings.push(
				`Conflicting flags: "${def.field}" and "${conflictField}" are mutually exclusive`,
			);
		}
	}

	return warnings;
}
