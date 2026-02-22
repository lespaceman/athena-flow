#!/usr/bin/env node
import React from 'react';
import {render} from 'ink';
import meow from 'meow';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import os from 'node:os';
import path from 'node:path';
import App from './app.js';
import {processRegistry} from './utils/processRegistry.js';
import {type IsolationPreset, type IsolationConfig} from './types/isolation.js';
import {registerBuiltins} from './commands/builtins/index.js';
import {
	registerPlugins,
	readConfig,
	readGlobalConfig,
} from './plugins/index.js';
import {readClaudeSettingsModel} from './utils/resolveModel.js';
import {resolveTheme} from './theme/index.js';
import {getMostRecentSession} from './utils/sessionIndex.js';
import {getMostRecentAthenaSession} from './sessions/registry.js';
import crypto from 'node:crypto';
import type {WorkflowConfig} from './workflows/types.js';
import {resolveWorkflow, installWorkflowPlugins} from './workflows/index.js';

const require = createRequire(import.meta.url);
const {version} = require('../package.json') as {version: string};

// Register cleanup handlers early to catch all exit scenarios
processRegistry.registerCleanupHandlers();

const cli = meow(
	`
	Usage
	  $ athena-cli

	Options
		--project-dir   Project directory for hook socket (default: cwd)
		--plugin        Path to a Claude Code plugin directory (repeatable)
		--isolation     Isolation preset for spawned Claude process:
		                  strict (default) - Full isolation, no MCP servers
		                  minimal - Full isolation, allow project MCP servers
		                  permissive - Full isolation, allow project MCP servers
		--verbose       Show additional rendering detail and streaming display
		--theme         Color theme: dark (default) or light
		--continue      Resume the most recent session (or specify a session ID)
		--sessions      Launch interactive session picker before main UI
		--workflow       Workflow reference displayed in header (e.g. name@rev)

	Note: All isolation modes use --setting-sources "" to completely isolate
	      from Claude Code's settings. athena-cli is fully self-contained.

	Config Files
		Global:  ~/.config/athena/config.json
		Project: {projectDir}/.athena/config.json
		Format:  {
		           "plugins": ["/path/to/plugin"],
		           "additionalDirectories": ["/path/to/allow"]
		         }
		Merge order: global → project → --plugin flags

	Examples
	  $ athena-cli --project-dir=/my/project
	  $ athena-cli --plugin=/path/to/my-plugin
	  $ athena-cli --isolation=minimal
	  $ athena-cli --verbose
	  $ athena-cli --continue
	  $ athena-cli --continue=<sessionId>
	  $ athena-cli --sessions
`,
	{
		importMeta: import.meta,
		flags: {
			projectDir: {
				type: 'string',
				default: process.cwd(),
			},
			plugin: {
				type: 'string',
				isMultiple: true,
			},
			isolation: {
				type: 'string',
				default: 'strict',
			},
			verbose: {
				type: 'boolean',
				default: false,
			},
			theme: {
				type: 'string',
			},
			continue: {
				type: 'string',
			},
			sessions: {
				type: 'boolean',
				default: false,
			},
			workflow: {
				type: 'string',
			},
			ascii: {
				type: 'boolean',
				default: false,
			},
		},
	},
);

// Validate isolation preset
const validIsolationPresets = ['strict', 'minimal', 'permissive'];
let isolationPreset: IsolationPreset = 'strict';
if (validIsolationPresets.includes(cli.flags.isolation)) {
	isolationPreset = cli.flags.isolation as IsolationPreset;
} else if (cli.flags.isolation !== 'strict') {
	console.error(
		`Warning: Invalid isolation preset '${cli.flags.isolation}', using 'strict'`,
	);
}

// Register commands: builtins first, then plugins (global -> project -> CLI flags)
registerBuiltins();
const globalConfig = readGlobalConfig();
const projectConfig = readConfig(cli.flags.projectDir);

// Detect first run or 'setup' subcommand
const isSetupCommand = cli.input[0] === 'setup';
const isFirstRun =
	!globalConfig.setupComplete &&
	!fs.existsSync(path.join(os.homedir(), '.config', 'athena', 'config.json'));
const showSetup = isSetupCommand || isFirstRun;

// Resolve workflow from standalone registry if configured
const workflowName =
	cli.flags.workflow ?? projectConfig.workflow ?? globalConfig.workflow;
let workflowPluginDirs: string[] = [];
let resolvedWorkflow: WorkflowConfig | undefined;

if (workflowName) {
	try {
		resolvedWorkflow = resolveWorkflow(workflowName);
		workflowPluginDirs = installWorkflowPlugins(resolvedWorkflow);
	} catch (error) {
		console.error(`Error: ${(error as Error).message}`);
		process.exit(1);
	}
}

const pluginDirs = [
	...new Set([
		...workflowPluginDirs,
		...globalConfig.plugins,
		...projectConfig.plugins,
		...(cli.flags.plugin ?? []),
	]),
];
const pluginResult =
	pluginDirs.length > 0
		? registerPlugins(pluginDirs)
		: {mcpConfig: undefined, workflows: [] as WorkflowConfig[]};
const pluginMcpConfig = pluginResult.mcpConfig;
const workflows = pluginResult.workflows;

// Select active workflow: resolved from registry takes precedence over plugin-embedded
let activeWorkflow: WorkflowConfig | undefined = resolvedWorkflow;
if (!activeWorkflow && workflows.length === 1) {
	activeWorkflow = workflows[0];
} else if (!activeWorkflow && workflows.length > 1) {
	console.error(
		`Multiple workflows found: ${workflows.map(w => w.name).join(', ')}. Use --workflow=<name> to select one.`,
	);
}

// Merge additionalDirectories from global and project configs
const additionalDirectories = [
	...globalConfig.additionalDirectories,
	...projectConfig.additionalDirectories,
];

// Resolve model: project config > global config > env var > Claude settings
const configModel =
	projectConfig.model || globalConfig.model || activeWorkflow?.model;

// Workflow may require a less restrictive isolation preset
if (activeWorkflow?.isolation) {
	const presetOrder = ['strict', 'minimal', 'permissive'];
	const workflowIdx = presetOrder.indexOf(activeWorkflow.isolation);
	const userIdx = presetOrder.indexOf(isolationPreset);
	if (workflowIdx > userIdx) {
		console.error(
			`Workflow '${activeWorkflow.name}' requires '${activeWorkflow.isolation}' isolation (upgrading from '${isolationPreset}')`,
		);
		isolationPreset = activeWorkflow.isolation as IsolationPreset;
	}
}

// Build isolation config with preset, additional directories, and plugin dirs
const isolationConfig: IsolationConfig = {
	preset: isolationPreset,
	additionalDirectories,
	pluginDirs: pluginDirs.length > 0 ? pluginDirs : undefined,
	debug: cli.flags.verbose, // Pass --debug to Claude when --verbose is set
	model: configModel,
};

const modelName =
	isolationConfig.model ||
	process.env['ANTHROPIC_MODEL'] ||
	readClaudeSettingsModel(cli.flags.projectDir) ||
	null;

// Resolve theme: CLI flag > project config > global config > default
const themeName =
	cli.flags.theme ?? projectConfig.theme ?? globalConfig.theme ?? 'dark';
const theme = resolveTheme(themeName);

// Resolve --continue flag: with value = specific session ID, without value = most recent
// meow parses --continue (no value) as undefined for type: 'string', so check process.argv
const hasContinueFlag = process.argv.includes('--continue');
const showSessionPicker = cli.flags.sessions;

let initialSessionId: string | undefined;
let athenaSessionId: string;

if (cli.flags.continue) {
	// --continue=<sessionId> — use as both adapter and athena session ID
	initialSessionId = cli.flags.continue;
	athenaSessionId = cli.flags.continue;
} else if (hasContinueFlag) {
	// --continue (no value) — resume most recent sessions
	const recentAdapter = getMostRecentSession(cli.flags.projectDir);
	if (recentAdapter) {
		initialSessionId = recentAdapter.sessionId;
	} else {
		console.error('No previous sessions found. Starting new session.');
	}
	const recentAthena = getMostRecentAthenaSession(cli.flags.projectDir);
	athenaSessionId = recentAthena?.id ?? crypto.randomUUID();
} else {
	athenaSessionId = crypto.randomUUID();
}

const instanceId = process.pid;
render(
	<App
		projectDir={cli.flags.projectDir}
		instanceId={instanceId}
		isolation={isolationConfig}
		verbose={cli.flags.verbose}
		version={version}
		pluginMcpConfig={pluginMcpConfig}
		modelName={modelName}
		theme={theme}
		initialSessionId={initialSessionId}
		showSessionPicker={showSessionPicker}
		workflowRef={cli.flags.workflow ?? activeWorkflow?.name}
		workflow={activeWorkflow}
		ascii={cli.flags.ascii}
		showSetup={showSetup}
		athenaSessionId={athenaSessionId}
	/>,
);
