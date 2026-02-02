import {type HookCommand} from '../types.js';

export const manualCommand: HookCommand = {
	name: 'manual',
	description: 'Returns to default 250ms auto-passthrough',
	category: 'hook',
	execute(ctx) {
		ctx.hookServer.clearRules();
	},
};
