import {describe, it, expect} from 'vitest';
import chalk from 'chalk';
import {styleFeedLine} from './feedLineStyle.js';
import {darkTheme} from '../theme/themes.js';

// Force chalk color output in tests
chalk.level = 3;

describe('styleFeedLine', () => {
	const baseLine =
		' 08:55 Tool Call     AGENT      Read source/app.tsx                    ?';

	it('applies default text color for agent:root', () => {
		const result = styleFeedLine(baseLine, {
			focused: false,
			matched: false,
			actorId: 'agent:root',
			isError: false,
			theme: darkTheme,
		});
		expect(result).not.toBe(baseLine); // has ANSI codes
		expect(result).toContain('Tool Call'); // content preserved
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

	it('applies default text color for subagent actor (same as agent)', () => {
		const result = styleFeedLine(baseLine, {
			focused: false,
			matched: false,
			actorId: 'subagent:abc123',
			isError: false,
			theme: darkTheme,
		});
		// text #cdd6f4 → RGB 205;214;244
		expect(result).toContain('38;2;205;214;244');
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

	it('applies accent border glyph for focused row (no inverse)', () => {
		const result = styleFeedLine(baseLine, {
			focused: true,
			matched: false,
			actorId: 'agent:root',
			isError: false,
			theme: darkTheme,
		});
		// No inverse
		expect(result).not.toContain('\x1b[7m');
		// Has focus border glyph ▎
		expect(result).toContain('▎');
		// accent #89b4fa → RGB 137;180;250
		expect(result).toContain('38;2;137;180;250');
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
		const line =
			' 08:55 Tool Call     AGENT      Read source/app.tsx                  ▸';
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
		const line =
			' 08:55 Tool Call     AGENT      Read source/app.tsx                  ▾';
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
		const line =
			' 08:55 Tool Call     AGENT      Read source/app.tsx                  >';
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
		const line =
			' 08:55 Tool Call     AGENT      Read source/app.tsx                  v';
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

	it('dims tool.ok and tool.call with textMuted, keeps tool.fail as error', () => {
		// textMuted #6c7086 → RGB 108;112;134
		const toolOk = styleFeedLine(baseLine, {
			focused: false,
			matched: false,
			actorId: 'agent:root',
			isError: false,
			theme: darkTheme,
			opTag: 'tool.ok',
		});
		expect(toolOk).toContain('38;2;108;112;134');

		const toolCall = styleFeedLine(baseLine, {
			focused: false,
			matched: false,
			actorId: 'agent:root',
			isError: false,
			theme: darkTheme,
			opTag: 'tool.call',
		});
		expect(toolCall).toContain('38;2;108;112;134');

		// status.error #f38ba8 → RGB 243;139;168
		const toolFail = styleFeedLine(baseLine, {
			focused: false,
			matched: false,
			actorId: 'agent:root',
			isError: false,
			theme: darkTheme,
			opTag: 'tool.fail',
		});
		expect(toolFail).toContain('38;2;243;139;168');
	});

	it('does not color OP when focused (inverse takes precedence)', () => {
		const result = styleFeedLine(baseLine, {
			focused: true,
			matched: false,
			actorId: 'agent:root',
			isError: false,
			theme: darkTheme,
			opTag: 'tool.call',
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
			opTag: 'tool.call',
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
			opTag: undefined,
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

	it('focused takes priority over matched (shows ▎ not ▌)', () => {
		const result = styleFeedLine(baseLine, {
			focused: true,
			matched: true,
			actorId: 'agent:root',
			isError: false,
			theme: darkTheme,
		});
		// Search match glyph ▌ should NOT appear
		expect(result).not.toContain('▌');
		// Focus border ▎ should appear
		expect(result).toContain('▎');
	});

	it('applies user border accent for prompt op', () => {
		const line =
			' HH:MM User Prompt USER       Tell me about X                      ';
		const styled = styleFeedLine(line, {
			focused: false,
			matched: false,
			actorId: 'user',
			isError: false,
			theme: darkTheme,
			opTag: 'prompt',
		});
		expect(styled).toContain('▎');
	});

	it('dims entire row for tool.ok events (QW1)', () => {
		const result = styleFeedLine(baseLine, {
			focused: false,
			matched: false,
			actorId: 'agent:root',
			isError: false,
			theme: darkTheme,
			opTag: 'tool.ok',
		});
		// The TIME segment (chars 1-7) should use textMuted (#6c7086 → 108;112;134)
		// not the default text color (#cdd6f4 → 205;214;244)
		const timeSegment = result.slice(0, 30);
		expect(timeSegment).toContain('38;2;108;112;134');
		expect(timeSegment).not.toContain('38;2;205;214;244');
	});

	it('dims entire row for lifecycle events (S9)', () => {
		const result = styleFeedLine(baseLine, {
			focused: false,
			matched: false,
			actorId: 'agent:root',
			isError: false,
			theme: darkTheme,
			opTag: 'stop.request',
		});
		const timeSegment = result.slice(0, 30);
		expect(timeSegment).toContain('38;2;108;112;134');
	});

	it('dims entire row for session events (S9)', () => {
		const result = styleFeedLine(baseLine, {
			focused: false,
			matched: false,
			actorId: 'agent:root',
			isError: false,
			theme: darkTheme,
			opTag: 'sess.start',
		});
		const timeSegment = result.slice(0, 30);
		expect(timeSegment).toContain('38;2;108;112;134');
	});

	it('applies focus border (not user border) when focused on prompt', () => {
		const line =
			' HH:MM User Prompt USER       Tell me about X                      ';
		const styled = styleFeedLine(line, {
			focused: true,
			matched: false,
			actorId: 'user',
			isError: false,
			theme: darkTheme,
			opTag: 'prompt',
		});
		// Focus border ▎ is present with accent color, not user border color
		expect(styled).toContain('▎');
		// accent #89b4fa → RGB 137;180;250
		expect(styled).toContain('38;2;137;180;250');
	});
});
