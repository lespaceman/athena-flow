import {describe, it, expect} from 'vitest';
import {
	darkTheme,
	lightTheme,
	highContrastTheme,
	resolveTheme,
} from './themes.js';

describe('themes', () => {
	it('darkTheme has all required tokens with GitHub Dark palette', () => {
		expect(darkTheme.name).toBe('dark');
		expect(darkTheme.accent).toBe('#58a6ff');
		expect(darkTheme.status.success).toBe('#3fb950');
		expect(darkTheme.status.error).toBe('#f85149');
		expect(darkTheme.status.warning).toBe('#d29922');
		expect(darkTheme.status.info).toBe('#79c0ff');
		expect(darkTheme.status.working).toBe('#e3b341');
		expect(darkTheme.status.neutral).toBe('#484f58');
		expect(darkTheme.accentSecondary).toBe('#a371f7');
		expect(darkTheme.contextBar.medium).toBe('#d29922');
		expect(darkTheme.userMessage.text).toBe('#c9d1d9');
		expect(darkTheme.userMessage.background).toBe('#161b22');
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

describe('theme visual polish fields', () => {
	it('has dialog border colors', () => {
		expect(darkTheme.dialog).toEqual({
			borderPermission: expect.any(String),
			borderQuestion: expect.any(String),
		});
		expect(lightTheme.dialog).toEqual({
			borderPermission: expect.any(String),
			borderQuestion: expect.any(String),
		});
		expect(highContrastTheme.dialog).toEqual({
			borderPermission: expect.any(String),
			borderQuestion: expect.any(String),
		});
	});

	it('has inputPrompt accent color', () => {
		expect(darkTheme.inputPrompt).toEqual(expect.any(String));
		expect(lightTheme.inputPrompt).toEqual(expect.any(String));
		expect(highContrastTheme.inputPrompt).toEqual(expect.any(String));
	});

	it('has userMessage border color', () => {
		expect(darkTheme.userMessage.border).toEqual(expect.any(String));
		expect(lightTheme.userMessage.border).toEqual(expect.any(String));
		expect(highContrastTheme.userMessage.border).toEqual(expect.any(String));
	});
});
