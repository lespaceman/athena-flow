import {type PromptCommand} from '../types.js';

export const commitCommand: PromptCommand = {
	name: 'commit',
	description: 'Stages and commits with generated message',
	category: 'prompt',
	session: 'new',
	args: [
		{
			name: 'message',
			description: 'Optional commit message hint',
			required: false,
		},
	],
	buildPrompt(args) {
		const hint = args['message'] ? ` with message: ${args['message']}` : '';
		return `Stage and commit the current changes${hint}. Review the diff, write a clear commit message, and create the commit.`;
	},
};
