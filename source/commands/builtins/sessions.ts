import {type UICommand} from '../types.js';

export const sessionsCommand: UICommand = {
	name: 'sessions',
	description: 'Browse and resume previous sessions',
	category: 'ui',
	execute(ctx) {
		ctx.showSessions();
	},
};
