import chalk from 'chalk';
import {type Theme} from '../theme/types.js';

export type FeedLineStyleOptions = {
	focused: boolean;
	matched: boolean;
	actorId: string;
	isError: boolean;
	theme: Theme;
};

function actorStyle(actorId: string, theme: Theme) {
	if (actorId === 'system') return chalk.hex(theme.textMuted);
	if (actorId === 'user') return chalk.hex(theme.userMessage.text);
	if (actorId.startsWith('subagent:')) return chalk.hex(theme.accentSecondary);
	return chalk.hex(theme.text);
}

export function styleFeedLine(
	line: string,
	opts: FeedLineStyleOptions,
): string {
	const {focused, matched, actorId, isError, theme} = opts;

	// Error overrides actor color
	const base = isError
		? chalk.hex(theme.status.error)
		: actorStyle(actorId, theme);

	let styled = base(line);

	// Focused: inverse accent on entire line
	if (focused) {
		styled = chalk.hex(theme.accent).inverse(line);
	}

	// Search match: prepend accent ▌ (replacing first char)
	if (matched && !focused) {
		styled = chalk.hex(theme.accent)('▌') + styled.slice(1);
	}

	return styled;
}
