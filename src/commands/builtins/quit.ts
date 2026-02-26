import {type UICommand} from '../types.js';

export const quitCommand: UICommand = {
	name: 'quit',
	description: 'Exits athena-cli',
	category: 'ui',
	aliases: ['q', 'exit'],
	execute(ctx) {
		ctx.exit();
	},
};
