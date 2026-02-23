import {describe, it, expect} from 'vitest';
import {
	compactText,
	fit,
	formatClock,
	formatCount,
	formatSessionLabel,
	formatRunLabel,
	actorLabel,
	summarizeValue,
	summarizeToolInput,
	formatInputBuffer,
} from './format.js';

describe('compactText', () => {
	it('returns clean text when under max', () => {
		expect(compactText('hello', 10)).toBe('hello');
	});

	it('collapses whitespace while preserving non-ASCII', () => {
		expect(compactText('a  b  c', 20)).toBe('a b c');
		expect(compactText('a  b\t\nc', 20)).toBe('a b c');
	});

	it('truncates with ellipsis', () => {
		expect(compactText('hello world', 8)).toBe('hello...');
	});

	it('returns empty for max <= 0', () => {
		expect(compactText('hello', 0)).toBe('');
		expect(compactText('hello', -1)).toBe('');
	});

	it('slices without ellipsis when max <= 3', () => {
		expect(compactText('hello', 3)).toBe('hel');
		expect(compactText('hello', 2)).toBe('he');
	});

	it('preserves non-ASCII content', () => {
		expect(compactText('café', 10)).toBe('café');
	});
});

describe('fit', () => {
	it('pads short text to width', () => {
		expect(fit('hi', 5)).toBe('hi   ');
	});

	it('truncates with ellipsis when too long', () => {
		expect(fit('hello world', 8)).toBe('hello...');
	});

	it('returns empty for width <= 0', () => {
		expect(fit('hello', 0)).toBe('');
	});

	it('slices without ellipsis when width <= 3', () => {
		expect(fit('hello', 3)).toBe('hel');
	});

	it('exact fit does not truncate', () => {
		expect(fit('abcde', 5)).toBe('abcde');
	});

	it('preserves Unicode characters instead of replacing with ?', () => {
		expect(fit('café', 10)).toBe('café      ');
		expect(fit('▸ expand', 10)).toBe('▸ expand  ');
	});

	it('handles wide characters (emoji) by visual width', () => {
		// 🚀 is 2 columns wide, so "🚀 go" = 5 visual cols
		expect(fit('🚀 go', 8)).toBe('🚀 go   ');
	});
});

describe('formatClock', () => {
	it('formats timestamp as HH:MM', () => {
		// Use a fixed UTC time and construct with local offset
		const d = new Date(2026, 0, 15, 9, 5, 3);
		expect(formatClock(d.getTime())).toBe('09:05');
	});

	it('formats midnight', () => {
		const d = new Date(2026, 0, 1, 0, 0, 0);
		expect(formatClock(d.getTime())).toBe('00:00');
	});
});

describe('formatCount', () => {
	it('returns -- for null', () => {
		expect(formatCount(null)).toBe('--');
	});

	it('formats numbers with locale', () => {
		expect(formatCount(0)).toBe('0');
		expect(formatCount(1234)).toBe('1,234');
	});
});

describe('formatSessionLabel', () => {
	it('returns S- for undefined', () => {
		expect(formatSessionLabel(undefined)).toBe('S-');
	});

	it('returns S- for empty string', () => {
		expect(formatSessionLabel('')).toBe('S-');
	});

	it('returns last 4 alphanumeric chars', () => {
		expect(formatSessionLabel('abc-1234-xyz9')).toBe('Sxyz9');
	});

	it('returns S- when no alphanumeric chars', () => {
		expect(formatSessionLabel('---')).toBe('S-');
	});
});

describe('formatRunLabel', () => {
	it('returns R- for undefined', () => {
		expect(formatRunLabel(undefined)).toBe('R-');
	});

	it('returns direct match for R+digits', () => {
		expect(formatRunLabel('R1')).toBe('R1');
		expect(formatRunLabel('r42')).toBe('R42');
	});

	it('returns last 4 alphanumeric for other IDs', () => {
		expect(formatRunLabel('run-abc-1234')).toBe('R1234');
	});

	it('returns R- for empty string', () => {
		expect(formatRunLabel('')).toBe('R-');
	});
});

describe('actorLabel', () => {
	it('maps known actors', () => {
		expect(actorLabel('user')).toBe('USER');
		expect(actorLabel('agent:root')).toBe('AGENT');
		expect(actorLabel('system')).toBe('SYSTEM');
	});

	it('formats subagent with SA- prefix', () => {
		expect(actorLabel('subagent:abc')).toBe('SA-abc');
	});

	it('truncates long subagent names', () => {
		expect(actorLabel('subagent:very-long-name-here')).toBe('SA-very-l...');
	});

	it('uppercases and truncates unknown actors', () => {
		expect(actorLabel('custom')).toBe('CUSTOM');
	});
});

describe('summarizeValue', () => {
	it('wraps strings in quotes and truncates', () => {
		expect(summarizeValue('hello')).toBe('"hello"');
	});

	it('returns numbers as string', () => {
		expect(summarizeValue(42)).toBe('42');
	});

	it('returns booleans as string', () => {
		expect(summarizeValue(true)).toBe('true');
	});

	it('returns null/undefined as string', () => {
		expect(summarizeValue(null)).toBe('null');
		expect(summarizeValue(undefined)).toBe('undefined');
	});

	it('summarizes arrays with length', () => {
		expect(summarizeValue([1, 2, 3])).toBe('[3]');
	});

	it('summarizes objects as {...}', () => {
		expect(summarizeValue({a: 1})).toBe('{...}');
	});
});

describe('summarizeToolInput', () => {
	it('shows all entries when 2 or fewer', () => {
		expect(summarizeToolInput({a: 1, b: 2})).toBe('a=1 b=2');
	});

	it('appends +N for entries beyond 2', () => {
		expect(summarizeToolInput({a: 1, b: 2, c: 3, d: 4})).toBe('a=1 b=2 +2');
	});

	it('appends +1 for exactly 3 entries', () => {
		expect(summarizeToolInput({a: 1, b: 2, c: 3})).toBe('a=1 b=2 +1');
	});

	it('returns empty string for empty input', () => {
		expect(summarizeToolInput({})).toBe('');
	});

	it('handles single key', () => {
		expect(summarizeToolInput({cmd: 'ls'})).toBe('cmd="ls"');
	});
});

describe('formatInputBuffer', () => {
	it('returns empty for width <= 0', () => {
		expect(formatInputBuffer('hi', 0, 0, true, 'type...')).toBe('');
	});

	it('shows placeholder when empty without cursor', () => {
		expect(formatInputBuffer('', 0, 20, false, 'type...')).toBe(
			'type...             ',
		);
	});

	it('shows cursor + placeholder when empty with cursor', () => {
		// '|type...' is 8 chars, fit pads to 20
		expect(formatInputBuffer('', 0, 20, true, 'type...')).toBe(
			'|type...            ',
		);
	});

	it('shows value without cursor', () => {
		expect(formatInputBuffer('hello', 5, 20, false, '')).toBe(
			'hello               ',
		);
	});

	it('inserts cursor pipe at offset', () => {
		expect(formatInputBuffer('hello', 3, 20, true, '')).toBe(
			'hel|lo              ',
		);
	});

	it('scrolls for long text with cursor', () => {
		const long = 'a'.repeat(50);
		const result = formatInputBuffer(long, 25, 20, true, '');
		expect(result.length).toBe(20);
		expect(result).toContain('|');
	});
});
