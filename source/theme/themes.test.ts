import {describe, it, expect} from 'vitest';
import {
	darkTheme,
	lightTheme,
	highContrastTheme,
	resolveTheme,
} from './themes.js';

describe('themes', () => {
	it('darkTheme has all required tokens with Catppuccin Mocha palette', () => {
		expect(darkTheme.name).toBe('dark');
		expect(darkTheme.accent).toBe('#89b4fa');
		expect(darkTheme.status.success).toBe('#a6e3a1');
		expect(darkTheme.status.error).toBe('#f38ba8');
		expect(darkTheme.status.warning).toBe('#f9e2af');
		expect(darkTheme.status.info).toBe('#89dceb');
		expect(darkTheme.status.working).toBe('#f5a623');
		expect(darkTheme.status.neutral).toBe('#6c7086');
		expect(darkTheme.accentSecondary).toBe('#cba6f7');
		expect(darkTheme.contextBar.medium).toBe('#fab387');
		expect(darkTheme.userMessage.text).toBe('#bac2de');
		expect(darkTheme.userMessage.background).toBe('#313244');
	});

	it('lightTheme has distinct Catppuccin Latte palette', () => {
		expect(lightTheme.name).toBe('light');
		expect(lightTheme.accent).toBe('#5c5cff');
		expect(lightTheme.status.success).toBe('#40a02b');
		expect(lightTheme.status.error).toBe('#d20f39');
		expect(lightTheme.status.warning).toBe('#df8e1d');
		expect(lightTheme.status.info).toBe('#1e66f5');
		expect(lightTheme.status.working).toBe('#c45d00');
		expect(lightTheme.accentSecondary).toBe('#8839ef');
	});

	it('highContrastTheme has WCAG AA compliant palette', () => {
		expect(highContrastTheme.name).toBe('high-contrast');
		expect(highContrastTheme.status.success).toBe('#50fa7b');
		expect(highContrastTheme.status.error).toBe('#ff5555');
		expect(highContrastTheme.status.warning).toBe('#f1fa8c');
		expect(highContrastTheme.status.working).toBe('#ffb86c');
		expect(highContrastTheme.border).toBe('#ffffff');
	});

	it('resolveTheme returns high-contrast when requested', () => {
		expect(resolveTheme('high-contrast').name).toBe('high-contrast');
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
