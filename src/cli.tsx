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
import crypto from 'node:crypto';
import {getSessionMeta, getMostRecentAthenaSession} from './sessions/index.js';
import type {WorkflowConfig} from './workflows/types.js';
import {resolveWorkflow, installWorkflowPlugins} from './workflows/index.js';
import {shouldShowSetup} from './setup/shouldShowSetup.js';
import {shouldResolveWorkflow} from './setup/shouldResolveWorkflow.js';

const require = createRequire(import.meta.url);
const {version} = require('../package.json') as {version: string};

// Register cleanup handlers early to catch all exit scenarios
processRegistry.registerCleanupHandlers();

const cli = meow(
	`
	Usage
	  $ athena-flow

	Options
		--project-dir   Project directory for hook socket (default: cwd)
		--plugin        Path to a Claude Code plugin directory (repeatable)
		--isolation     Isolation preset for spawned Claude process:
		                  strict (default) - Full isolation, no MCP servers
		                  minimal - Full isolation, allow project MCP servers
		                  permissive - Full isolation, allow project MCP servers
		--verbose       Show additional rendering detail and streaming display
		--theme         Color theme: dark (default), light, or high-contrast
		--continue      Resume the most recent session (or specify a session ID)
		--sessions      Launch interactive session picker before main UI
		--workflow       Workflow reference displayed in header (e.g. name@rev)

	Note: All isolation modes use --setting-sources "" to completely isolate
	      from Claude Code's settings. athena-flow is fully self-contained.

	Config Files
		Global:  ~/.config/athena/config.json
		Project: {projectDir}/.athena/config.json
		Format:  {
		           "plugins": ["/path/to/plugin"],
		           "additionalDirectories": ["/path/to/allow"]
		         }
		Merge order: global → project → --plugin flags

	Examples
	  $ athena-flow --project-dir=/my/project
	  $ athena-flow --plugin=/path/to/my-plugin
	  $ athena-flow --isolation=minimal
	  $ athena-flow --verbose
	  $ athena-flow --continue
	  $ athena-flow --continue=<sessionId>
	  $ athena-flow --sessions
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
const showSetup = shouldShowSetup({
	cliInput: cli.input,
	setupComplete: globalConfig.setupComplete,
	globalConfigExists: fs.existsSync(
		path.join(os.homedir(), '.config', 'athena', 'config.json'),
	),
});

// Resolve workflow from standalone registry if configured
const workflowName =
	cli.flags.workflow ?? projectConfig.workflow ?? globalConfig.workflow;
let workflowPluginDirs: string[] = [];
let resolvedWorkflow: WorkflowConfig | undefined;

// Setup must remain recoverable even if existing workflow config is invalid.
const workflowToResolve = shouldResolveWorkflow({showSetup, workflowName})
	? workflowName
	: undefined;

if (workflowToResolve) {
	try {
		resolvedWorkflow = resolveWorkflow(workflowToResolve);
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

// Resolve --continue flag: Athena session registry is the sole identity authority.
// meow parses --continue (no value) as undefined for type: 'string', so check process.argv
const hasContinueFlag = process.argv.includes('--continue');
const showSessionPicker = cli.flags.sessions;

let initialSessionId: string | undefined;
let athenaSessionId: string;

if (cli.flags.continue) {
	// --continue=<id> — treat as Athena session ID first
	const meta = getSessionMeta(cli.flags.continue);
	if (meta) {
		athenaSessionId = meta.id;
		initialSessionId = meta.adapterSessionIds.at(-1);
	} else {
		console.error(
			`Unknown session ID: ${cli.flags.continue}\n` +
				`Use 'athena-flow --list' to see available sessions.`,
		);
		process.exit(1);
	}
} else if (hasContinueFlag) {
	// --continue (bare) — resume most recent Athena session
	const recent = getMostRecentAthenaSession(cli.flags.projectDir);
	if (recent) {
		athenaSessionId = recent.id;
		initialSessionId = recent.adapterSessionIds.at(-1);
	} else {
		console.error('No previous sessions found. Starting new session.');
		athenaSessionId = crypto.randomUUID();
	}
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
		athenaSessionId={athenaSessionId}
		showSessionPicker={showSessionPicker}
		workflowRef={cli.flags.workflow ?? activeWorkflow?.name}
		workflow={activeWorkflow}
		ascii={cli.flags.ascii}
		showSetup={showSetup}
	/>,
);
