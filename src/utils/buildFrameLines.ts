import chalk from 'chalk';
import {type TimelineEntry} from '../feed/timeline.js';
import {hintGlyphs} from '../glyphs/index.js';
import {fit, fitAnsi, renderInputLines} from './format.js';

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
	hintsForced?: boolean | null;
	ascii?: boolean;
	/** Status of the most recent completed run, or null if no run has finished yet. */
	lastRunStatus?: 'completed' | 'failed' | 'aborted' | null;
	/** When true, compute footer only and skip expensive input line rendering. */
	skipInputLines?: boolean;
};

export type FrameLines = {
	footerHelp: string | null;
	inputLines: string[];
};

function buildHintPairs(pairs: Array<[string, string]>): string {
	return pairs
		.map(([glyph, label]) => `${chalk.bold(glyph)} ${chalk.dim(label)}`)
		.join('   ');
}

export function buildFrameLines(ctx: FrameContext): FrameLines {
	const {innerWidth} = ctx;

	// Footer — auto-hide when typing
	const footerHelp: string | null = (() => {
		if (ctx.inputValue.length > 0 && ctx.hintsForced !== true) {
			return null;
		}

		const h = hintGlyphs(!!ctx.ascii);

		if (ctx.focusMode === 'todo') {
			return buildHintPairs([
				[h.arrowsUpDown, 'Select'],
				[h.space, 'Toggle'],
				[h.enter, 'Jump'],
				['a', 'Add'],
				[h.escape, 'Back'],
			]);
		}

		if (ctx.focusMode === 'input') {
			return buildHintPairs([
				[h.enter, 'Send'],
				[h.escape, ctx.isClaudeRunning ? 'Interrupt' : 'Back'],
				[h.tab, 'Focus'],
				['⌃P/N', 'History'],
				[h.toggle, 'Hints'],
			]);
		}

		if (ctx.expandedEntry) {
			return buildHintPairs([
				[h.arrowsUpDown, 'Scroll'],
				[h.page, 'Page'],
				[`${h.enter}/${h.escape}`, 'Back'],
			]);
		}

		// Feed mode (default)
		let searchPart = '';
		if (ctx.searchQuery && ctx.searchMatches.length > 0) {
			searchPart = ` | search ${ctx.searchMatchPos + 1}/${ctx.searchMatches.length}`;
		} else if (ctx.searchQuery) {
			searchPart = ' | search 0/0';
		}

		return (
			buildHintPairs([
				[h.arrows, 'Navigate'],
				[h.enter, 'Expand'],
				['/', 'Search'],
				[':', 'Cmd'],
				['End', 'Tail'],
			]) + searchPart
		);
	})();

	// Input lines (multi-line)
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
	let inputPlaceholder: string;
	if (ctx.inputMode === 'cmd') {
		inputPlaceholder = ':command';
	} else if (ctx.inputMode === 'search') {
		inputPlaceholder = '/search';
	} else if (ctx.lastRunStatus === 'completed') {
		inputPlaceholder = 'Run complete \u2014 type a follow-up or :retry';
	} else if (
		ctx.lastRunStatus === 'failed' ||
		ctx.lastRunStatus === 'aborted'
	) {
		inputPlaceholder = 'Run failed \u2014 type a follow-up or :retry';
	} else {
		inputPlaceholder = 'Type a prompt or :command';
	}

	const contentLines = ctx.dialogActive
		? [
				fit(
					ctx.dialogType === 'question'
						? 'Answer question in dialog...'
						: 'Respond to permission dialog...',
					inputContentWidth,
				),
			]
		: renderInputLines(
				ctx.inputValue,
				ctx.cursorOffset,
				inputContentWidth,
				ctx.focusMode === 'input',
				inputPlaceholder,
			);
	if (ctx.skipInputLines) {
		return {footerHelp, inputLines: []};
	}

	// First line gets prefix + badge, subsequent lines get padding
	const inputLines = contentLines.map((content, i) => {
		if (i === 0) {
			return fitAnsi(`${inputPrefix}${content}${badgeText}`, innerWidth);
		}
		// Continuation lines: pad prefix area, no badge
		const pad = ' '.repeat(rawPrefix.length);
		return fitAnsi(`${pad}${content}`, innerWidth);
	});

	return {footerHelp, inputLines};
}
