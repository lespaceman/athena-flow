import {describe, it, expect} from 'vitest';
import chalk from 'chalk';
import {buildFrameLines, type FrameContext} from './buildFrameLines.js';
import {type TimelineEntry} from '../feed/timeline.js';

const baseCtx: FrameContext = {
	innerWidth: 80,
	focusMode: 'input',
	inputMode: 'normal',
	searchQuery: '',
	searchMatches: [],
	searchMatchPos: 0,
	expandedEntry: null,
	isClaudeRunning: false,
	inputValue: '',
	cursorOffset: 0,
	dialogActive: false,
	dialogType: '',
};

describe('buildFrameLines hints', () => {
	it('shows glyph hints when input is empty in INPUT mode', () => {
		const saved = chalk.level;
		chalk.level = 3;
		try {
			const result = buildFrameLines(baseCtx);
			expect(result.footerHelp).not.toBeNull();
			expect(result.footerHelp).toContain('Send');
		} finally {
			chalk.level = saved;
		}
	});

	it('returns null footerHelp when input has text (auto-hide)', () => {
		const result = buildFrameLines({...baseCtx, inputValue: 'hello'});
		expect(result.footerHelp).toBeNull();
	});

	it('shows hints when input has text but hintsForced is true', () => {
		const saved = chalk.level;
		chalk.level = 3;
		try {
			const result = buildFrameLines({
				...baseCtx,
				inputValue: 'hello',
				hintsForced: true,
			});
			expect(result.footerHelp).not.toBeNull();
		} finally {
			chalk.level = saved;
		}
	});

	it('shows feed hints in feed mode', () => {
		const saved = chalk.level;
		chalk.level = 3;
		try {
			const result = buildFrameLines({...baseCtx, focusMode: 'feed'});
			expect(result.footerHelp).not.toBeNull();
			expect(result.footerHelp).toContain('Expand');
			expect(result.footerHelp).toContain('Search');
		} finally {
			chalk.level = saved;
		}
	});

	it('shows todo hints in todo mode', () => {
		const saved = chalk.level;
		chalk.level = 3;
		try {
			const result = buildFrameLines({...baseCtx, focusMode: 'todo'});
			expect(result.footerHelp).not.toBeNull();
			expect(result.footerHelp).toContain('Toggle');
			expect(result.footerHelp).toContain('Jump');
		} finally {
			chalk.level = saved;
		}
	});

	it('includes search info in feed hints when searching', () => {
		const saved = chalk.level;
		chalk.level = 3;
		try {
			const result = buildFrameLines({
				...baseCtx,
				focusMode: 'feed',
				searchQuery: 'test',
				searchMatches: [1, 2, 3],
				searchMatchPos: 0,
			});
			expect(result.footerHelp).toContain('1/3');
		} finally {
			chalk.level = saved;
		}
	});

	it('shows details hints when expandedEntry is set', () => {
		const saved = chalk.level;
		chalk.level = 3;
		try {
			const result = buildFrameLines({
				...baseCtx,
				focusMode: 'feed',
				expandedEntry: {id: 'test'} as unknown as TimelineEntry,
			});
			expect(result.footerHelp).not.toBeNull();
			expect(result.footerHelp).toContain('Scroll');
			expect(result.footerHelp).toContain('Page');
			expect(result.footerHelp).toContain('Back');
		} finally {
			chalk.level = saved;
		}
	});

	it('returns inputLines array with prefix and badge', () => {
		const result = buildFrameLines(baseCtx);
		expect(result.inputLines).toBeInstanceOf(Array);
		expect(result.inputLines.length).toBeGreaterThanOrEqual(1);
		expect(result.inputLines[0]).toContain('input>');
		expect(result.inputLines[0]).toContain('[IDLE]');
	});
});
