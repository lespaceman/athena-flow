import {type HookCommand} from '../types.js';

export const openCommand: HookCommand = {
	name: 'open',
	description: 'Expand a collapsed tool output',
	category: 'hook',
	aliases: ['o'],
	args: [
		{
			name: 'toolId',
			description: 'Tool use ID to expand (or "last")',
			required: true,
		},
	],
	execute(ctx) {
		const toolId = ctx.args['toolId'];
		if (!toolId) return;
		ctx.hookServer.expandToolOutput(toolId);
	},
};
