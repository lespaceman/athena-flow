import {describe, expect, it} from 'vitest';
import {darkTheme, lightTheme, highContrastTheme} from './themes.js';

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
