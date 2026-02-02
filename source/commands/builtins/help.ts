import {type UICommand} from '../types.js';
import * as registry from '../registry.js';

export const helpCommand: UICommand = {
	name: 'help',
	description: 'Lists all available commands',
	category: 'ui',
	aliases: ['h', '?'],
	execute(ctx) {
		const commands = registry.getAll();
		const lines = commands.map(cmd => {
			const aliases = cmd.aliases?.length
				? ` (${cmd.aliases.map(a => `/${a}`).join(', ')})`
				: '';
			return `  /${cmd.name}${aliases} - ${cmd.description}`;
		});

		ctx.addMessage({
			id: `help-${Date.now()}`,
			role: 'assistant',
			content: `Available commands:\n${lines.join('\n')}`,
		});
	},
};
