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
};

export type FrameLines = {
	footerHelp: string | null;
	inputLines: string[];
};

function buildHintPairs(pairs: Array<[string, string]>, sep: string): string {
	return chalk.dim(
		pairs.map(([glyph, label]) => `${glyph} ${label}`).join(` ${sep} `),
	);
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
			return buildHintPairs(
				[
					[h.arrowsUpDown, 'Select'],
					[h.space, 'Toggle'],
					[h.enter, 'Jump'],
					['a', 'Add'],
					[h.escape, 'Back'],
				],
				h.separator,
			);
		}

		if (ctx.focusMode === 'input') {
			return buildHintPairs(
				[
					[h.enter, 'Send'],
					[h.escape, 'Back'],
					[h.tab, 'Focus'],
					['⌃P/N', 'History'],
					[h.toggle, 'Hints'],
				],
				h.separator,
			);
		}

		if (ctx.expandedEntry) {
			return buildHintPairs(
				[
					[h.arrowsUpDown, 'Scroll'],
					[h.page, 'Page'],
					[`${h.enter}/${h.escape}`, 'Back'],
				],
				h.separator,
			);
		}

		// Feed mode (default)
		let searchPart = '';
		if (ctx.searchQuery && ctx.searchMatches.length > 0) {
			searchPart = ` | search ${ctx.searchMatchPos + 1}/${ctx.searchMatches.length}`;
		} else if (ctx.searchQuery) {
			searchPart = ' | search 0/0';
		}

		return (
			buildHintPairs(
				[
					[h.arrows, 'Navigate'],
					[h.enter, 'Expand'],
					['/', 'Search'],
					[':', 'Cmd'],
					['End', 'Tail'],
				],
				h.separator,
			) + searchPart
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
