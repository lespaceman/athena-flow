import {type UICommand} from '../types';
import {generateId} from '../../../harnesses/claude/protocol/index';
import {formatStatsSnapshot} from '../../../shared/utils/formatters';

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
