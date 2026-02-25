import {describe, test, expect} from 'vitest';
import stripAnsi from 'strip-ansi';
import {darkTheme} from '../theme/themes.js';
import {formatGutter, opCategoryColor, fit, formatTime, formatEvent, formatActor, formatTool, formatSuffix, buildDetailsPrefix, layoutTargetAndOutcome} from './cellFormatters.js';

const theme = darkTheme;

describe('fit', () => {
	test('pads short text to width', () => {
		expect(fit('hi', 5)).toBe('hi   ');
	});
	test('truncates long text with ellipsis', () => {
		expect(fit('hello world', 8)).toBe('hello...');
	});
	test('returns empty for width 0', () => {
		expect(fit('hi', 0)).toBe('');
	});
});

describe('opCategoryColor', () => {
	test('tool.fail returns error color', () => {
		expect(opCategoryColor('tool.fail', theme)).toBe(theme.status.error);
	});
	test('tool.ok returns textMuted', () => {
		expect(opCategoryColor('tool.ok', theme)).toBe(theme.textMuted);
	});
	test('perm.* returns accentSecondary', () => {
		expect(opCategoryColor('perm.req', theme)).toBe(theme.accentSecondary);
	});
	test('agent.msg returns info', () => {
		expect(opCategoryColor('agent.msg', theme)).toBe(theme.status.info);
	});
	test('unknown returns undefined', () => {
		expect(opCategoryColor('unknown', theme)).toBeUndefined();
	});
});

describe('formatGutter', () => {
	test('focused returns ▎', () => {
		const r = formatGutter({focused: true, matched: false, categoryBreak: false, minuteBreak: false, isUserBorder: false, ascii: false, theme});
		expect(stripAnsi(r)).toBe('▎');
	});

	test('matched returns ▌', () => {
		const r = formatGutter({focused: false, matched: true, categoryBreak: false, minuteBreak: false, isUserBorder: false, ascii: false, theme});
		expect(stripAnsi(r)).toBe('▌');
	});

	test('user border returns ▎', () => {
		const r = formatGutter({focused: false, matched: false, categoryBreak: false, minuteBreak: false, isUserBorder: true, ascii: false, theme});
		expect(stripAnsi(r)).toBe('▎');
	});

	test('minute break (no category) returns ─', () => {
		const r = formatGutter({focused: false, matched: false, categoryBreak: false, minuteBreak: true, isUserBorder: false, ascii: false, theme});
		expect(stripAnsi(r)).toBe('─');
	});

	test('category break returns ·', () => {
		const r = formatGutter({focused: false, matched: false, categoryBreak: true, minuteBreak: false, isUserBorder: false, ascii: false, theme});
		expect(stripAnsi(r)).toBe('·');
	});

	test('default returns space', () => {
		const r = formatGutter({focused: false, matched: false, categoryBreak: false, minuteBreak: false, isUserBorder: false, ascii: false, theme});
		expect(stripAnsi(r)).toBe(' ');
	});

	test('ascii mode: focused returns |', () => {
		const r = formatGutter({focused: true, matched: false, categoryBreak: false, minuteBreak: false, isUserBorder: false, ascii: true, theme});
		expect(stripAnsi(r)).toBe('|');
	});

	test('priority: matched > userBorder > minuteBreak > categoryBreak', () => {
		const r = formatGutter({focused: false, matched: true, categoryBreak: true, minuteBreak: true, isUserBorder: true, ascii: false, theme});
		expect(stripAnsi(r)).toBe('▌'); // matched wins
	});
});

describe('formatTime', () => {
	test('formats timestamp as HH:MM padded to contentWidth', () => {
		const ts = new Date('2025-06-15T14:30:00').getTime();
		const r = formatTime(ts, 5, theme);
		expect(stripAnsi(r)).toHaveLength(5);
		expect(stripAnsi(r)).toMatch(/\d{2}:\d{2}/);
	});

	test('fills exactly contentWidth chars', () => {
		const r = formatTime(Date.now(), 5, theme);
		expect(stripAnsi(r)).toHaveLength(5);
	});
});

describe('formatEvent', () => {
	test('pads short opTag to contentWidth', () => {
		const r = formatEvent('Agent', 12, theme);
		expect(stripAnsi(r)).toHaveLength(12);
	});

	test('truncates long opTag to contentWidth', () => {
		const r = formatEvent('Tool Response Long', 12, theme);
		expect(stripAnsi(r)).toHaveLength(12);
	});

	test('applies opCategoryColor for tool.fail', () => {
		const r = formatEvent('Tool Fail', 12, theme, 'tool.fail');
		// Verify it produces a string of correct width (color applied via chalk.hex)
		expect(stripAnsi(r)).toHaveLength(12);
		expect(stripAnsi(r)).toContain('Tool Fail');
	});
});

describe('formatActor', () => {
	test('non-duplicate shows actor name padded to width', () => {
		const r = formatActor('AGENT', false, 10, theme, 'agent:root');
		expect(stripAnsi(r)).toHaveLength(10);
		expect(stripAnsi(r)).toContain('AGENT');
	});

	test('duplicate shows centered dot', () => {
		const r = formatActor('AGENT', true, 10, theme, 'agent:root');
		expect(stripAnsi(r).trim()).toBe('·');
		expect(stripAnsi(r)).toHaveLength(10);
	});

	test('long actor name truncated with ellipsis', () => {
		const r = formatActor('VERY-LONG-ACTOR', false, 10, theme, 'agent:root');
		expect(stripAnsi(r)).toHaveLength(10);
		expect(stripAnsi(r)).toContain('...');
	});

	test('zero width returns empty', () => {
		expect(formatActor('AGENT', false, 0, theme, 'agent:root')).toBe('');
	});
});

describe('formatTool', () => {
	test('fits tool name to width', () => {
		const r = formatTool('Read', 12, theme);
		expect(stripAnsi(r)).toHaveLength(12);
	});

	test('truncates long tool name', () => {
		const r = formatTool('browser_navigate', 8, theme);
		expect(stripAnsi(r)).toHaveLength(8);
	});

	test('empty tool returns padded empty', () => {
		const r = formatTool('', 12, theme);
		expect(stripAnsi(r)).toHaveLength(12);
	});
});

describe('formatSuffix', () => {
	test('expandable collapsed shows ▸ ', () => {
		expect(stripAnsi(formatSuffix(true, false, false, theme))).toBe('▸ ');
	});

	test('expandable expanded shows ▾ ', () => {
		expect(stripAnsi(formatSuffix(true, true, false, theme))).toBe('▾ ');
	});

	test('not expandable shows two spaces', () => {
		expect(stripAnsi(formatSuffix(false, false, false, theme))).toBe('  ');
	});

	test('ascii mode collapsed shows > ', () => {
		expect(stripAnsi(formatSuffix(true, false, true, theme))).toBe('> ');
	});

	test('ascii mode expanded shows v ', () => {
		expect(stripAnsi(formatSuffix(true, true, true, theme))).toBe('v ');
	});
});

describe('buildDetailsPrefix', () => {
	test('full mode returns empty prefix', () => {
		const r = buildDetailsPrefix('full', 'Read', 'AGENT', theme);
		expect(r).toEqual({text: '', length: 0});
	});

	test('compact mode prepends tool only', () => {
		const r = buildDetailsPrefix('compact', 'Read', undefined, theme);
		expect(r.length).toBeGreaterThan(0);
		expect(stripAnsi(r.text)).toContain('Read');
	});

	test('narrow mode prepends actor then tool', () => {
		const r = buildDetailsPrefix('narrow', 'Read', 'AGENT', theme);
		const plain = stripAnsi(r.text);
		expect(plain.indexOf('AGENT')).toBeLessThan(plain.indexOf('Read'));
	});

	test('prefix length matches stripped text length', () => {
		const r = buildDetailsPrefix('narrow', 'Read', 'AGENT', theme);
		expect(r.length).toBe(stripAnsi(r.text).length);
	});

	test('compact with no tool returns empty', () => {
		const r = buildDetailsPrefix('compact', undefined, undefined, theme);
		expect(r).toEqual({text: '', length: 0});
	});
});

describe('layoutTargetAndOutcome', () => {
	test('no outcome returns fitted target', () => {
		const r = layoutTargetAndOutcome('src/app.tsx', undefined, 30);
		expect(r).toHaveLength(30);
	});

	test('right-aligns outcome when space permits', () => {
		const r = layoutTargetAndOutcome('src/app.tsx', '120 lines', 40);
		expect(r.endsWith('120 lines')).toBe(true);
		expect(r).toHaveLength(40);
	});

	test('inline fallback when width is tight', () => {
		const r = layoutTargetAndOutcome('src/app.tsx', '120 lines', 20);
		expect(r).toHaveLength(20);
	});

	test('zero width returns empty', () => {
		expect(layoutTargetAndOutcome('src/app.tsx', '120 lines', 0)).toBe('');
	});
});
