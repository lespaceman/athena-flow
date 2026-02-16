import {type HookCommand} from '../types.js';

export const tasksCommand: HookCommand = {
	name: 'tasks',
	description: 'Print full task list as a snapshot into the event stream',
	category: 'hook',
	aliases: ['todo'],
	execute(ctx) {
		ctx.hookServer.printTaskSnapshot();
	},
};
