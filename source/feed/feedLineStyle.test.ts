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

	it('colors ▸ suffix with accent color', () => {
		const line = '08:55 tool.call  AGENT    Read source/app.tsx              ▸';
		const result = styleFeedLine(line, {
			focused: false,
			matched: false,
			actorId: 'agent:root',
			isError: false,
			theme: darkTheme,
		});
		// accent #89b4fa → RGB 137;180;250
		expect(result).toContain('38;2;137;180;250');
		expect(result).toContain('▸');
	});

	it('colors ▾ suffix with success color', () => {
		const line = '08:55 tool.call  AGENT    Read source/app.tsx              ▾';
		const result = styleFeedLine(line, {
			focused: false,
			matched: false,
			actorId: 'agent:root',
			isError: false,
			theme: darkTheme,
		});
		// status.success #a6e3a1 → RGB 166;227;161
		expect(result).toContain('38;2;166;227;161');
		expect(result).toContain('▾');
	});

	it('colors ASCII > suffix with accent color', () => {
		const line = '08:55 tool.call  AGENT    Read source/app.tsx             >';
		const result = styleFeedLine(line, {
			focused: false,
			matched: false,
			actorId: 'agent:root',
			isError: false,
			theme: darkTheme,
		});
		// accent #89b4fa → RGB 137;180;250
		expect(result).toContain('38;2;137;180;250');
		expect(result).toContain('>');
	});

	it('colors ASCII v suffix with success color', () => {
		const line = '08:55 tool.call  AGENT    Read source/app.tsx             v';
		const result = styleFeedLine(line, {
			focused: false,
			matched: false,
			actorId: 'agent:root',
			isError: false,
			theme: darkTheme,
		});
		// status.success #a6e3a1 → RGB 166;227;161
		expect(result).toContain('38;2;166;227;161');
		expect(result).toContain('v');
	});

	it('applies dim for system actor for terminal contrast', () => {
		const result = styleFeedLine(baseLine, {
			focused: false,
			matched: false,
			actorId: 'system',
			isError: false,
			theme: darkTheme,
		});
		// Should contain dim escape code \x1b[2m
		expect(result).toContain('\x1b[2m');
	});

	it('colors OP segment with category color for tool.call', () => {
		const result = styleFeedLine(baseLine, {
			focused: false,
			matched: false,
			actorId: 'agent:root',
			isError: false,
			theme: darkTheme,
			op: 'tool.call',
		});
		const withoutOp = styleFeedLine(baseLine, {
			focused: false,
			matched: false,
			actorId: 'agent:root',
			isError: false,
			theme: darkTheme,
		});
		expect(result).not.toBe(withoutOp);
	});

	it('does not color OP when focused (inverse takes precedence)', () => {
		const result = styleFeedLine(baseLine, {
			focused: true,
			matched: false,
			actorId: 'agent:root',
			isError: false,
			theme: darkTheme,
			op: 'tool.call',
		});
		const withoutOp = styleFeedLine(baseLine, {
			focused: true,
			matched: false,
			actorId: 'agent:root',
			isError: false,
			theme: darkTheme,
		});
		expect(result).toBe(withoutOp);
	});

	it('does not color OP when isError (error red takes precedence)', () => {
		const result = styleFeedLine(baseLine, {
			focused: false,
			matched: false,
			actorId: 'agent:root',
			isError: true,
			theme: darkTheme,
			op: 'tool.call',
		});
		const withoutOp = styleFeedLine(baseLine, {
			focused: false,
			matched: false,
			actorId: 'agent:root',
			isError: true,
			theme: darkTheme,
		});
		expect(result).toBe(withoutOp);
	});

	it('skips OP coloring when op is undefined', () => {
		const withUndefined = styleFeedLine(baseLine, {
			focused: false,
			matched: false,
			actorId: 'agent:root',
			isError: false,
			theme: darkTheme,
			op: undefined,
		});
		const withoutOp = styleFeedLine(baseLine, {
			focused: false,
			matched: false,
			actorId: 'agent:root',
			isError: false,
			theme: darkTheme,
		});
		expect(withUndefined).toBe(withoutOp);
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
