import {type UICommand} from '../types.js';

export const statusCommand: UICommand = {
	name: 'status',
	description: 'Shows server/process/session state and active rules',
	category: 'ui',
	execute(ctx) {
		ctx.addMessage({
			id: `status-${Date.now()}`,
			role: 'assistant',
			content: 'Status: use /status from the app context for full details.',
		});
	},
};
