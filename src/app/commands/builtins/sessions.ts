import {type UICommand} from '../types';

export const sessionsCommand: UICommand = {
	name: 'sessions',
	description: 'Browse and resume previous sessions',
	category: 'ui',
	execute(ctx) {
		ctx.showSessions();
	},
};
