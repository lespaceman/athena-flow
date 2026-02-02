import {type HookCommand} from '../types.js';

export const autoApproveCommand: HookCommand = {
	name: 'auto-approve',
	description: 'Auto-passthrough PreToolUse events',
	category: 'hook',
	args: [
		{
			name: 'tool',
			description: 'Tool name to auto-approve (or * for all)',
			required: false,
		},
	],
	execute(ctx) {
		const tool = ctx.args['tool'] ?? '*';

		ctx.hookServer.addRule({
			toolName: tool,
			action: 'approve',
			addedBy: '/auto-approve',
		});
	},
};
