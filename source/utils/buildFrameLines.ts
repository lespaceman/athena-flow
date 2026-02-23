import chalk from 'chalk';
import {type TimelineEntry} from '../feed/timeline.js';
import {fit, fitAnsi, formatInputBuffer} from './format.js';

export type FrameContext = {
	innerWidth: number;
	focusMode: string;
	inputMode: string;
	searchQuery: string;
	searchMatches: number[];
	searchMatchPos: number;
	expandedEntry: TimelineEntry | null;
	isClaudeRunning: boolean;
	inputValue: string;
	cursorOffset: number;
	dialogActive: boolean;
	dialogType: string;
	accentColor?: string;
};

export type FrameLines = {
	footerHelp: string;
	inputLine: string;
};

export function buildFrameLines(ctx: FrameContext): FrameLines {
	const {innerWidth} = ctx;

	// Footer
	const footerHelp = (() => {
		if (ctx.focusMode === 'todo')
			return 'TODO: up/down select  Space toggle done  Enter jump  a add  Esc back';
		if (ctx.focusMode === 'input')
			return 'INPUT: Enter send  Esc back  Tab focus  Ctrl+P/N history';
		if (ctx.expandedEntry)
			return 'DETAILS: Up/Down or j/k scroll  PgUp/PgDn jump  Enter/Esc back';
		const searchPart =
			ctx.searchQuery && ctx.searchMatches.length > 0
				? ` | search ${ctx.searchMatchPos + 1}/${ctx.searchMatches.length}`
				: ctx.searchQuery
					? ' | search 0/0'
					: '';
		return `FEED: Ctrl+Up/Down move  Enter expand  / search  : cmd  End tail${searchPart}`;
	})();

	// Input line
	const runBadge = ctx.isClaudeRunning ? '[RUN]' : '[IDLE]';
	const modeBadges = [
		runBadge,
		...(ctx.inputMode === 'cmd' ? ['[CMD]'] : []),
		...(ctx.inputMode === 'search' ? ['[SEARCH]'] : []),
	];
	const badgeText = modeBadges.join('');
	const rawPrefix = 'input> ';
	const inputPrefix = ctx.accentColor
		? chalk.hex(ctx.accentColor)(rawPrefix)
		: rawPrefix;
	const inputContentWidth = Math.max(
		1,
		innerWidth - rawPrefix.length - badgeText.length,
	);
	const inputPlaceholder =
		ctx.inputMode === 'cmd'
			? ':command'
			: ctx.inputMode === 'search'
				? '/search'
				: 'Type a prompt or :command';
	const inputBuffer = ctx.dialogActive
		? fit(
				ctx.dialogType === 'question'
					? 'Answer question in dialog...'
					: 'Respond to permission dialog...',
				inputContentWidth,
			)
		: formatInputBuffer(
				ctx.inputValue,
				ctx.cursorOffset,
				inputContentWidth,
				ctx.focusMode === 'input',
				inputPlaceholder,
			);
	const inputLine = fitAnsi(
		`${inputPrefix}${inputBuffer}${badgeText}`,
		innerWidth,
	);

	return {footerHelp, inputLine};
}
