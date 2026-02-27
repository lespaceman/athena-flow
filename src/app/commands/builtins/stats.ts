import {type UICommand} from '../types';
import {generateId} from '../../../types/hooks/index';
import {formatStatsSnapshot} from '../../../utils/formatters';

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
