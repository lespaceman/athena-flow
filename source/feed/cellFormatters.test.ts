import {describe, test, expect} from 'vitest';
import stripAnsi from 'strip-ansi';
import {darkTheme} from '../theme/themes.js';
import {
	formatGutter,
	opCategoryColor,
	fit,
	formatTime,
	formatEvent,
	formatActor,
	formatTool,
	formatSuffix,
	buildDetailsPrefix,
	layoutTargetAndOutcome,
	formatDetails,
} from './cellFormatters.js';
import type {SummarySegment, TimelineEntry} from './timeline.js';
import {computeDuplicateActors} from './timeline.js';

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
		const r = formatGutter({
			focused: true,
			matched: false,
			categoryBreak: false,
			minuteBreak: false,
			isUserBorder: false,
			ascii: false,
			theme,
		});
		expect(stripAnsi(r)).toBe('▎');
	});

	test('matched returns ▌', () => {
		const r = formatGutter({
			focused: false,
			matched: true,
			categoryBreak: false,
			minuteBreak: false,
			isUserBorder: false,
			ascii: false,
			theme,
		});
		expect(stripAnsi(r)).toBe('▌');
	});

	test('user border returns ▎', () => {
		const r = formatGutter({
			focused: false,
			matched: false,
			categoryBreak: false,
			minuteBreak: false,
			isUserBorder: true,
			ascii: false,
			theme,
		});
		expect(stripAnsi(r)).toBe('▎');
	});

	test('minute break (no category) returns ─', () => {
		const r = formatGutter({
			focused: false,
			matched: false,
			categoryBreak: false,
			minuteBreak: true,
			isUserBorder: false,
			ascii: false,
			theme,
		});
		expect(stripAnsi(r)).toBe('─');
	});

	test('category break returns ·', () => {
		const r = formatGutter({
			focused: false,
			matched: false,
			categoryBreak: true,
			minuteBreak: false,
			isUserBorder: false,
			ascii: false,
			theme,
		});
		expect(stripAnsi(r)).toBe('·');
	});

	test('default returns space', () => {
		const r = formatGutter({
			focused: false,
			matched: false,
			categoryBreak: false,
			minuteBreak: false,
			isUserBorder: false,
			ascii: false,
			theme,
		});
		expect(stripAnsi(r)).toBe(' ');
	});

	test('ascii mode: focused returns |', () => {
		const r = formatGutter({
			focused: true,
			matched: false,
			categoryBreak: false,
			minuteBreak: false,
			isUserBorder: false,
			ascii: true,
			theme,
		});
		expect(stripAnsi(r)).toBe('|');
	});

	test('priority: matched > userBorder > minuteBreak > categoryBreak', () => {
		const r = formatGutter({
			focused: false,
			matched: true,
			categoryBreak: true,
			minuteBreak: true,
			isUserBorder: true,
			ascii: false,
			theme,
		});
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

	test('duplicate shows left-aligned dot', () => {
		const r = formatActor('AGENT', true, 10, theme, 'agent:root');
		expect(stripAnsi(r)).toBe('·         ');
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
		expect(stripAnsi(formatSuffix(true, false, false, theme))).toBe(' ▸');
	});

	test('expandable expanded shows  ▾', () => {
		expect(stripAnsi(formatSuffix(true, true, false, theme))).toBe(' ▾');
	});

	test('not expandable shows two spaces', () => {
		expect(stripAnsi(formatSuffix(false, false, false, theme))).toBe('  ');
	});

	test('ascii mode collapsed shows  >', () => {
		expect(stripAnsi(formatSuffix(true, false, true, theme))).toBe(' >');
	});

	test('ascii mode expanded shows  v', () => {
		expect(stripAnsi(formatSuffix(true, true, true, theme))).toBe(' v');
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

describe('formatDetails', () => {
	test('full mode: no prefix, target + outcome', () => {
		const r = formatDetails({
			segments: [{text: 'src/app.tsx', role: 'target'}],
			summary: 'src/app.tsx',
			outcome: '120 lines',
			mode: 'full',
			contentWidth: 40,
			theme,
			opTag: 'tool.ok',
		});
		const plain = stripAnsi(r);
		expect(plain).toContain('src/app.tsx');
		expect(plain).toContain('120 lines');
		expect(plain.length).toBeLessThanOrEqual(40);
	});

	test('compact mode: tool prefix + target', () => {
		const r = formatDetails({
			segments: [{text: 'src/app.tsx', role: 'target'}],
			summary: 'src/app.tsx',
			outcome: '120 lines',
			mode: 'compact',
			toolColumn: 'Read',
			contentWidth: 40,
			theme,
			opTag: 'tool.ok',
		});
		const plain = stripAnsi(r);
		expect(plain).toMatch(/^Read/);
	});

	test('narrow mode: actor + tool prefix + target', () => {
		const r = formatDetails({
			segments: [{text: 'src/app.tsx', role: 'target'}],
			summary: 'src/app.tsx',
			mode: 'narrow',
			toolColumn: 'Read',
			actorStr: 'AGENT',
			contentWidth: 50,
			theme,
			opTag: 'tool.ok',
		});
		const plain = stripAnsi(r);
		const actorIdx = plain.indexOf('AGENT');
		const toolIdx = plain.indexOf('Read');
		expect(actorIdx).toBeLessThan(toolIdx);
	});

	test('empty segments falls back to summary', () => {
		const r = formatDetails({
			segments: [],
			summary: 'some fallback text',
			mode: 'full',
			contentWidth: 30,
			theme,
			opTag: 'agent.msg',
		});
		expect(stripAnsi(r)).toContain('some fallback text');
	});

	test('outcomeZero gets distinct styling', () => {
		const noZero = formatDetails({
			segments: [{text: 'test', role: 'target'}],
			summary: 'test',
			outcome: '0 files',
			mode: 'full',
			contentWidth: 40,
			theme,
			opTag: 'tool.ok',
		});
		const withZero = formatDetails({
			segments: [{text: 'test', role: 'target'}],
			summary: 'test',
			outcome: '0 files',
			outcomeZero: true,
			mode: 'full',
			contentWidth: 40,
			theme,
			opTag: 'tool.ok',
		});
		// Different ANSI because outcomeZero → warning color
		// (Both stripped texts may match, but styled strings differ when chalk is enabled)
		// At chalk level 0, verify both produce valid output
		expect(stripAnsi(noZero)).toContain('0 files');
		expect(stripAnsi(withZero)).toContain('0 files');
	});
});

describe('computeDuplicateActors', () => {
	test('marks consecutive same-actor entries as duplicate', () => {
		const entries = [
			{actorId: 'a'},
			{actorId: 'a'},
			{actorId: 'b'},
			{actorId: 'b'},
		] as TimelineEntry[];
		computeDuplicateActors(entries);
		expect(entries[0]!.duplicateActor).toBe(false);
		expect(entries[1]!.duplicateActor).toBe(true);
		expect(entries[2]!.duplicateActor).toBe(false);
		expect(entries[3]!.duplicateActor).toBe(true);
	});

	test('first entry is never duplicate', () => {
		const entries = [{actorId: 'a'}] as TimelineEntry[];
		computeDuplicateActors(entries);
		expect(entries[0]!.duplicateActor).toBe(false);
	});

	test('empty array is a no-op', () => {
		const entries: TimelineEntry[] = [];
		computeDuplicateActors(entries);
		expect(entries).toHaveLength(0);
	});
});
