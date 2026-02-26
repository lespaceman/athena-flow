import {type UICommand} from '../types.js';

export const clearCommand: UICommand = {
	name: 'clear',
	description: 'Clears message history',
	category: 'ui',
	aliases: ['cls'],
	execute(ctx) {
		ctx.setMessages([]);
		ctx.clearScreen();
	},
};
