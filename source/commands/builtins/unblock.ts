import {type HookCommand} from '../types.js';

export const unblockCommand: HookCommand = {
	name: 'unblock',
	description: 'Removes tool from deny list',
	category: 'hook',
	args: [{name: 'tool', description: 'Tool name to unblock', required: true}],
	execute(ctx) {
		const tool = ctx.args['tool'];
		if (!tool) return;

		const rule = ctx.hookServer.rules.find(
			r => r.toolName === tool && r.action === 'deny',
		);
		if (rule) {
			ctx.hookServer.removeRule(rule.id);
		}
	},
};
