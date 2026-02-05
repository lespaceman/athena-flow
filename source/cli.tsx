#!/usr/bin/env node
import React from 'react';
import {render} from 'ink';
import meow from 'meow';
import {createRequire} from 'node:module';
import App from './app.js';
import {processRegistry} from './utils/processRegistry.js';
import {type IsolationPreset, type IsolationConfig} from './types/isolation.js';
import {registerBuiltins} from './commands/builtins/index.js';
import {
	registerPlugins,
	readConfig,
	readGlobalConfig,
} from './plugins/index.js';

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
const pluginDirs = [
	...globalConfig.plugins,
	...projectConfig.plugins,
	...(cli.flags.plugin ?? []),
];
const pluginMcpConfig =
	pluginDirs.length > 0 ? registerPlugins(pluginDirs) : undefined;

// Merge additionalDirectories from global and project configs
const additionalDirectories = [
	...globalConfig.additionalDirectories,
	...projectConfig.additionalDirectories,
];

// Build isolation config with preset and additional directories
const isolationConfig: IsolationConfig = {
	preset: isolationPreset,
	additionalDirectories,
};

const instanceId = process.pid;
render(
	<App
		projectDir={cli.flags.projectDir}
		instanceId={instanceId}
		isolation={isolationConfig}
		verbose={cli.flags.verbose}
		version={version}
		pluginMcpConfig={pluginMcpConfig}
	/>,
);
