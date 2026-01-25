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
		--name         Your name
		--project-dir  Project directory for hook socket (default: cwd)

	Examples
	  $ athena-cli --name=Jane
	  Hello, Jane
`,
	{
		importMeta: import.meta,
		flags: {
			name: {
				type: 'string',
			},
			projectDir: {
				type: 'string',
				default: process.cwd(),
			},
		},
	},
);

render(<App name={cli.flags.name} projectDir={cli.flags.projectDir} />);
