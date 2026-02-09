import {type UICommand} from '../types.js';
import {formatStatsSnapshot} from '../../utils/formatters.js';

export const statsCommand: UICommand = {
	name: 'stats',
	description: 'Shows session statistics',
	category: 'ui',
	aliases: ['s'],
	execute(ctx) {
		ctx.addMessage({
			id: `stats-${Date.now()}`,
			role: 'assistant',
			content: formatStatsSnapshot(ctx.sessionStats),
		});
	},
};
