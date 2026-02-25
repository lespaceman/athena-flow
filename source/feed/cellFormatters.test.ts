import {describe, test, expect} from 'vitest';
import stripAnsi from 'strip-ansi';
import {darkTheme} from '../theme/themes.js';
import {formatGutter, opCategoryColor, fit} from './cellFormatters.js';

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
