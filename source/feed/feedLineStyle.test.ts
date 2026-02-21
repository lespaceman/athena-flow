import {describe, it, expect} from 'vitest';
import chalk from 'chalk';
import {styleFeedLine} from './feedLineStyle.js';
import {darkTheme} from '../theme/themes.js';

// Force chalk color output in tests
chalk.level = 3;

describe('styleFeedLine', () => {
	const baseLine =
		'08:55 tool.call  AGENT    Read source/app.tsx             ?';

	it('applies default text color for agent:root', () => {
		const result = styleFeedLine(baseLine, {
			focused: false,
			matched: false,
			actorId: 'agent:root',
			isError: false,
			theme: darkTheme,
		});
		expect(result).not.toBe(baseLine); // has ANSI codes
		expect(result).toContain('tool.call'); // content preserved
	});

	it('applies muted color for system actor', () => {
		const result = styleFeedLine(baseLine, {
			focused: false,
			matched: false,
			actorId: 'system',
			isError: false,
			theme: darkTheme,
		});
		// textMuted #6c7086 → RGB 108;112;134
		expect(result).toContain('38;2;108;112;134');
	});

	it('applies accentSecondary for subagent actor', () => {
		const result = styleFeedLine(baseLine, {
			focused: false,
			matched: false,
			actorId: 'subagent:abc123',
			isError: false,
			theme: darkTheme,
		});
		// accentSecondary #cba6f7 → RGB 203;166;247
		expect(result).toContain('38;2;203;166;247');
	});

	it('applies error color overriding actor', () => {
		const result = styleFeedLine(baseLine, {
			focused: false,
			matched: false,
			actorId: 'agent:root',
			isError: true,
			theme: darkTheme,
		});
		// status.error #f38ba8 → RGB 243;139;168
		expect(result).toContain('38;2;243;139;168');
	});

	it('applies inverse for focused row', () => {
		const result = styleFeedLine(baseLine, {
			focused: true,
			matched: false,
			actorId: 'agent:root',
			isError: false,
			theme: darkTheme,
		});
		// ANSI inverse escape code
		expect(result).toContain('\x1b[7m');
	});

	it('prepends accent ▌ for search matches', () => {
		const result = styleFeedLine(baseLine, {
			focused: false,
			matched: true,
			actorId: 'agent:root',
			isError: false,
			theme: darkTheme,
		});
		expect(result).toContain('▌');
	});

	it('focused takes priority over matched (no ▌)', () => {
		const result = styleFeedLine(baseLine, {
			focused: true,
			matched: true,
			actorId: 'agent:root',
			isError: false,
			theme: darkTheme,
		});
		expect(result).not.toContain('▌');
	});
});
