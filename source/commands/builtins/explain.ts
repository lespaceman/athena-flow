import {type PromptCommand} from '../types.js';

export const explainCommand: PromptCommand = {
	name: 'explain',
	description: 'Explains a file or function',
	category: 'prompt',
	session: 'new',
	args: [
		{name: 'file', description: 'File or function to explain', required: true},
	],
	buildPrompt(args) {
		const target = args['file'] ?? 'the current file';
		return `Explain ${target}. Describe what it does, how it works, and any important details.`;
	},
};
