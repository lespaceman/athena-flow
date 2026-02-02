import {type PromptCommand} from '../types.js';

export const fixCommand: PromptCommand = {
	name: 'fix',
	description: 'Fixes issue from current conversation',
	category: 'prompt',
	session: 'resume',
	args: [
		{
			name: 'description',
			description: 'Description of the issue to fix',
			required: false,
		},
	],
	buildPrompt(args) {
		const desc = args['description'] ? `: ${args['description']}` : '';
		return `Fix the issue${desc}. Identify the root cause, implement the fix, and verify it works.`;
	},
};
