import {type UICommand} from '../types.js';
import {generateId} from '../../types/hooks/index.js';
import {formatStatsSnapshot} from '../../utils/formatters.js';

export const statsCommand: UICommand = {
	name: 'stats',
	description: 'Shows session statistics',
	category: 'ui',
	aliases: ['s'],
	execute(ctx) {
		ctx.addMessage({
			id: generateId(),
			role: 'assistant',
			content: formatStatsSnapshot(ctx.sessionStats),
			timestamp: new Date(),
		});
	},
};
