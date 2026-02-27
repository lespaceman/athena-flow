import {type UICommand} from '../types';

const setup: UICommand = {
	name: 'setup',
	description: 'Re-run the setup wizard',
	category: 'ui',
	execute: ctx => {
		ctx.showSetup();
	},
};

export default setup;
