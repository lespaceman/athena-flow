#!/usr/bin/env node
import React from 'react';
import {render} from 'ink';
import meow from 'meow';
import App from './app.js';

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

render(<App projectDir={cli.flags.projectDir} />);
