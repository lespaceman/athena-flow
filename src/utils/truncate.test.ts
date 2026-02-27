import {describe, it, expect} from 'vitest';
import stringWidth from 'string-width';
import {truncateLine} from './truncate';

describe('truncateLine', () => {
	it('returns string unchanged if within width', () => {
		expect(truncateLine('hello', 80)).toBe('hello');
	});

	it('truncates plain text with ellipsis when exceeding width', () => {
		const long = 'a'.repeat(100);
		const result = truncateLine(long, 50);
		expect(stringWidth(result)).toBeLessThanOrEqual(50);
		expect(result.endsWith('…')).toBe(true);
	});

	it('handles ANSI escape codes correctly', () => {
		const ansi = '\x1b[31m' + 'a'.repeat(100) + '\x1b[39m';
		const result = truncateLine(ansi, 50);
		expect(stringWidth(result)).toBeLessThanOrEqual(50);
	});

	it('handles empty string', () => {
		expect(truncateLine('', 80)).toBe('');
	});

	it('handles width smaller than ellipsis', () => {
		expect(truncateLine('hello world', 1)).toBe('…');
	});

	it('handles CJK wide characters', () => {
		const cjk = '你好世界测试';
		const result = truncateLine(cjk, 8);
		expect(stringWidth(result)).toBeLessThanOrEqual(8);
	});
});
