import {type HookCommand} from '../types.js';

export const blockCommand: HookCommand = {
	name: 'block',
	description: 'Blocks a tool from executing',
	category: 'hook',
	args: [{name: 'tool', description: 'Tool name to block', required: true}],
	execute(ctx) {
		const tool = ctx.args['tool'];
		if (!tool) return;

		ctx.hookServer.addRule({
			toolName: tool,
			action: 'deny',
			addedBy: '/block',
		});
	},
};
