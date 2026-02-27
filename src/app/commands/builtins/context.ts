import {type UICommand} from '../types';
import {generateId} from '../../../harnesses/claude/protocol/index';
import {formatTokens} from '../../../shared/utils/formatters';

export const contextCommand: UICommand = {
	name: 'context',
	description: 'Shows token breakdown and current context size',
	category: 'ui',
	aliases: ['ctx'],
	execute(ctx) {
		const {tokens} = ctx.sessionStats;
		const lines: string[] = [];

		lines.push('Context & Token Breakdown');
		lines.push('─────────────────────────');
		lines.push(`  Input (non-cached):  ${formatTokens(tokens.input)}`);
		lines.push(`  Cache read:          ${formatTokens(tokens.cacheRead)}`);
		lines.push(`  Cache write:         ${formatTokens(tokens.cacheWrite)}`);
		lines.push(`  Output:              ${formatTokens(tokens.output)}`);
		lines.push('');
		lines.push(`  Current context:     ${formatTokens(tokens.contextSize)}`);
		lines.push(`  Total consumed:      ${formatTokens(tokens.total)}`);

		ctx.addMessage({
			id: generateId(),
			role: 'assistant',
			content: lines.join('\n'),
			timestamp: new Date(),
		});
	},
};
