import {describe, expect, it, afterEach} from 'vitest';
import chalk from 'chalk';
import {buildFrameLines, type FrameContext} from './buildFrameLines.js';

function makeCtx(overrides: Partial<FrameContext> = {}): FrameContext {
	return {
		innerWidth: 80,
		focusMode: 'feed',
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
		accentColor: '#89b4fa',
		...overrides,
	};
}

describe('buildFrameLines input accent', () => {
	const savedLevel = chalk.level;
	afterEach(() => {
		chalk.level = savedLevel;
	});

	it('applies accent color to input> prefix', () => {
		chalk.level = 3;
		const ctx = makeCtx({accentColor: '#ff0000'});
		const {inputLine} = buildFrameLines(ctx);
		// The prefix "input> " should contain ANSI escape codes (colored)
		expect(inputLine).toContain('\u001B[');
		// And should still contain the text "input>"
		expect(inputLine).toContain('input>');
	});
});
