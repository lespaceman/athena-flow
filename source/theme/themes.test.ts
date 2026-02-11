import {describe, it, expect} from 'vitest';
import {darkTheme, lightTheme, resolveTheme} from './themes.js';

describe('themes', () => {
	it('darkTheme has all required tokens', () => {
		expect(darkTheme.name).toBe('dark');
		expect(darkTheme.accent).toBe('cyan');
		expect(darkTheme.status.success).toBe('green');
		expect(darkTheme.status.error).toBe('red');
		expect(darkTheme.status.warning).toBe('yellow');
		expect(darkTheme.status.info).toBe('cyan');
		expect(darkTheme.status.neutral).toBe('gray');
		expect(darkTheme.accentSecondary).toBe('magenta');
		expect(darkTheme.contextBar.medium).toBe('#FF8C00');
		expect(darkTheme.userMessage.text).toBe('#b0b0b0');
		expect(darkTheme.userMessage.background).toBe('#2d3748');
	});

	it('lightTheme avoids cyan and yellow (unreadable on light backgrounds)', () => {
		expect(lightTheme.name).toBe('light');
		expect(lightTheme.accent).not.toBe('cyan');
		expect(lightTheme.status.warning).not.toBe('yellow');
		expect(lightTheme.status.info).not.toBe('cyan');
	});

	it('resolveTheme returns dark by default', () => {
		expect(resolveTheme(undefined).name).toBe('dark');
		expect(resolveTheme('dark').name).toBe('dark');
	});

	it('resolveTheme returns light when requested', () => {
		expect(resolveTheme('light').name).toBe('light');
	});

	it('resolveTheme falls back to dark for invalid values', () => {
		expect(resolveTheme('neon').name).toBe('dark');
	});
});
