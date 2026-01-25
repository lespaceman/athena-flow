#!/usr/bin/env node
import React from 'react';
import {render} from 'ink';
import meow from 'meow';
import App from './app.js';
import {processRegistry} from './utils/processRegistry.js';

// Register cleanup handlers early to catch all exit scenarios
processRegistry.registerCleanupHandlers();

const cli = meow(
	`
	Usage
	  $ athena-cli

	Options
		--project-dir  Project directory for hook socket (default: cwd)

	Examples
	  $ athena-cli --project-dir=/my/project
`,
	{
		importMeta: import.meta,
		flags: {
			projectDir: {
				type: 'string',
				default: process.cwd(),
			},
		},
	},
);

const instanceId = process.pid;
render(<App projectDir={cli.flags.projectDir} instanceId={instanceId} />);
