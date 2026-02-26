import {describe, it, expect} from 'vitest';
import {formatElapsed} from './formatElapsed.js';

describe('formatElapsed', () => {
	it('formats seconds under 60', () => {
		expect(formatElapsed(3000)).toBe('3s');
		expect(formatElapsed(42000)).toBe('42s');
	});
	it('formats minutes under 60', () => {
		expect(formatElapsed(128000)).toBe('2m08s');
		expect(formatElapsed(930000)).toBe('15m30s');
	});
	it('formats hours', () => {
		expect(formatElapsed(4920000)).toBe('1h22m');
	});
	it('handles zero', () => {
		expect(formatElapsed(0)).toBe('0s');
	});
});
