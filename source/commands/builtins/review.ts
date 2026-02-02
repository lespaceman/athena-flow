import {type PromptCommand} from '../types.js';

export const reviewCommand: PromptCommand = {
	name: 'review',
	description: 'Reviews code changes',
	category: 'prompt',
	session: 'new',
	args: [
		{
			name: 'scope',
			description: 'Scope of review (e.g. staged, branch)',
			required: false,
		},
	],
	buildPrompt(args) {
		const scope = args['scope'] ?? 'staged changes';
		return `Review the ${scope}. Look for bugs, style issues, and suggest improvements.`;
	},
};
