import {type UICommand} from '../types.js';

const setup: UICommand = {
	name: 'setup',
	description: 'Re-run the setup wizard',
	category: 'ui',
	execute: ctx => {
		ctx.showSetup();
	},
};

export default setup;
