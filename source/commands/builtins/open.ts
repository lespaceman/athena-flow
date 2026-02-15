import {type HookCommand} from '../types.js';
import {generateId} from '../../types/hooks/index.js';

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
		if (!toolId) {
			ctx.addMessage({
				id: generateId(),
				role: 'assistant',
				content: 'Usage: :open <toolId> — specify a tool use ID or "last"',
				timestamp: new Date(),
			});
			return;
		}
		ctx.hookServer.expandToolOutput(toolId);
	},
};
