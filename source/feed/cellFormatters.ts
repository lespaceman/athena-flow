import chalk from 'chalk';
import {type Theme} from '../theme/types.js';
import {fit as fitImpl, formatClock} from '../utils/format.js';
import {getGlyphs} from '../glyphs/index.js';
import stripAnsi from 'strip-ansi';

// Re-export fit so all formatter consumers import from one place
export {fit} from '../utils/format.js';

export function opCategoryColor(
	op: string,
	theme: Theme,
): string | undefined {
	if (op === 'tool.fail') return theme.status.error;
	if (op === 'tool.ok' || op.startsWith('tool.')) return theme.textMuted;
	if (op.startsWith('perm.')) return theme.accentSecondary;
	if (op === 'agent.msg') return theme.status.info;
	if (
		op.startsWith('run.') ||
		op.startsWith('sess.') ||
		op.startsWith('stop.') ||
		op.startsWith('sub.')
	)
		return theme.textMuted;
	return undefined;
}

export type FormatGutterOpts = {
	focused: boolean;
	matched: boolean;
	categoryBreak: boolean;
	minuteBreak: boolean;
	isUserBorder: boolean;
	ascii: boolean;
	theme: Theme;
};

export function formatGutter(opts: FormatGutterOpts): string {
	const {focused, matched, categoryBreak, minuteBreak, isUserBorder, ascii, theme} = opts;
	const g = getGlyphs(ascii);

	if (focused) {
		return chalk.hex(theme.accent)(g['feed.focusBorder']);
	}
	if (matched) {
		return chalk.hex(theme.accent)(g['feed.searchMatch']);
	}
	if (isUserBorder) {
		const borderColor = theme.userMessage.border ?? theme.accent;
		return chalk.hex(borderColor)(g['feed.userBorder']);
	}
	if (minuteBreak && !categoryBreak) {
		return chalk.dim.hex(theme.textMuted)('─');
	}
	if (categoryBreak) {
		return chalk.dim.hex(theme.textMuted)('·');
	}
	return ' ';
}
