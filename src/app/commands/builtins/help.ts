import {type UICommand} from '../types';
import {generateId} from '../../../harnesses/claude/protocol/index';
import * as registry from '../registry';

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
			id: generateId(),
			role: 'assistant',
			content: `Available commands:\n${lines.join('\n')}`,
			timestamp: new Date(),
		});
	},
};
