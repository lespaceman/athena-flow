#!/usr/bin/env node
import React from 'react';
import {render} from 'ink';
import meow from 'meow';
import {createRequire} from 'node:module';
import App from './app.js';
import {processRegistry} from './utils/processRegistry.js';
import {type IsolationPreset} from './types/isolation.js';

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
		--isolation     Isolation preset for spawned Claude process:
		                  strict (default) - User settings only, no project hooks/MCP
		                  minimal - User settings, allow project MCP servers
		                  permissive - Full project access
		--debug         Show hook events and server status

	Examples
	  $ athena-cli --project-dir=/my/project
	  $ athena-cli --isolation=minimal
	  $ athena-cli --debug
`,
	{
		importMeta: import.meta,
		flags: {
			projectDir: {
				type: 'string',
				default: process.cwd(),
			},
			isolation: {
				type: 'string',
				default: 'strict',
			},
			debug: {
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

const instanceId = process.pid;
render(
	<App
		projectDir={cli.flags.projectDir}
		instanceId={instanceId}
		isolation={isolationPreset}
		debug={cli.flags.debug}
		version={version}
	/>,
);
