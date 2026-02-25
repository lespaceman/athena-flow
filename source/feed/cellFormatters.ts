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

export function formatTime(
	ts: number,
	contentWidth: number,
	theme: Theme,
): string {
	const clock = formatClock(ts);
	return chalk.hex(theme.textMuted)(fitImpl(clock, contentWidth));
}

export function formatEvent(
	opLabel: string,
	contentWidth: number,
	theme: Theme,
	opTag?: string,
): string {
	const fitted = fitImpl(opLabel, contentWidth);
	const color = opTag ? opCategoryColor(opTag, theme) : undefined;
	return color ? chalk.hex(color)(fitted) : chalk.hex(theme.text)(fitted);
}

export function formatActor(
	actor: string,
	duplicate: boolean,
	contentWidth: number,
	theme: Theme,
	actorId: string,
): string {
	if (contentWidth <= 0) return '';
	if (duplicate) {
		const pad = Math.floor((contentWidth - 1) / 2);
		const text = ' '.repeat(pad) + '\u00B7' + ' '.repeat(contentWidth - pad - 1);
		return chalk.dim.hex(theme.textMuted)(text);
	}
	const fitted = fitImpl(actor, contentWidth);
	if (actorId === 'system') return chalk.dim.hex(theme.textMuted)(fitted);
	if (actorId === 'user') return chalk.hex(theme.userMessage.text)(fitted);
	return chalk.hex(theme.text)(fitted);
}

export function formatTool(
	toolColumn: string,
	contentWidth: number,
	theme: Theme,
): string {
	if (contentWidth <= 0) return '';
	return chalk.hex(theme.text)(fitImpl(toolColumn, contentWidth));
}

export function formatSuffix(
	expandable: boolean,
	expanded: boolean,
	ascii: boolean,
	theme: Theme,
): string {
	if (!expandable) return '  ';
	const g = getGlyphs(ascii);
	if (expanded) {
		return chalk.hex(theme.status.success)(g['feed.expandExpanded']) + ' ';
	}
	return chalk.hex(theme.accent)(g['feed.expandCollapsed']) + ' ';
}

export function buildDetailsPrefix(
	mode: 'full' | 'compact' | 'narrow',
	toolColumn: string | undefined,
	actorStr: string | undefined,
	theme: Theme,
): {text: string; length: number} {
	if (mode === 'full') return {text: '', length: 0};

	let prefix = '';

	// Narrow: actor comes first
	if (mode === 'narrow' && actorStr) {
		prefix += chalk.hex(theme.textMuted)(fitImpl(actorStr, 10)) + ' ';
	}

	// Compact & narrow: tool as bright prefix
	if (toolColumn) {
		prefix += chalk.hex(theme.text)(toolColumn) + '  ';
	}

	if (!prefix) return {text: '', length: 0};
	return {text: prefix, length: stripAnsi(prefix).length};
}

export function layoutTargetAndOutcome(
	target: string,
	outcomeStr: string | undefined,
	width: number,
): string {
	if (width <= 0) return '';
	if (!outcomeStr) {
		return fitImpl(target, width);
	}

	const outcomeLen = outcomeStr.length;
	const targetBudget = width - outcomeLen - 2; // 2 = minimum gap

	// Not enough room to separate — inline fallback
	if (targetBudget < 10) {
		return fitImpl(`${target}  ${outcomeStr}`, width);
	}

	// Right-align outcome
	const fittedTarget = fitImpl(target, targetBudget);
	const padNeeded = width - fittedTarget.length - outcomeLen;
	const padding = padNeeded > 0 ? ' '.repeat(padNeeded) : '  ';
	return fittedTarget + padding + outcomeStr;
}
