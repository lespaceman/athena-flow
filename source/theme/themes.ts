import {type Theme, type ThemeName} from './types.js';

export const darkTheme: Theme = {
	name: 'dark',
	border: '#89b4fa',
	text: '#cdd6f4',
	textMuted: '#6c7086',
	textInverse: '#1e1e2e',
	status: {
		success: '#a6e3a1',
		error: '#f38ba8',
		warning: '#f9e2af',
		info: '#89dceb',
		working: '#f5a623',
		neutral: '#6c7086',
	},
	accent: '#89b4fa',
	accentSecondary: '#cba6f7',
	contextBar: {
		low: '#a6e3a1',
		medium: '#fab387',
		high: '#f38ba8',
	},
	dialog: {
		borderPermission: '#f9e2af',
		borderQuestion: '#89dceb',
	},
	inputPrompt: '#89b4fa',
	userMessage: {
		text: '#bac2de',
		background: '#313244',
		border: '#89b4fa',
	},
};

export const lightTheme: Theme = {
	name: 'light',
	border: '#5c5cff',
	text: '#4c4f69',
	textMuted: '#6c6f85',
	textInverse: '#eff1f5',
	status: {
		success: '#40a02b',
		error: '#d20f39',
		warning: '#df8e1d',
		info: '#1e66f5',
		working: '#c45d00',
		neutral: '#6c6f85',
	},
	accent: '#5c5cff',
	accentSecondary: '#8839ef',
	contextBar: {
		low: '#40a02b',
		medium: '#df8e1d',
		high: '#d20f39',
	},
	dialog: {
		borderPermission: '#df8e1d',
		borderQuestion: '#1e66f5',
	},
	inputPrompt: '#5c5cff',
	userMessage: {
		text: '#4c4f69',
		background: '#ccd0da',
		border: '#5c5cff',
	},
};

/**
 * High-contrast theme — WCAG AA compliant (4.5:1+ contrast ratios on #1a1a2e bg).
 * Pairs with shape-based status glyphs so status is never conveyed by color alone.
 */
export const highContrastTheme: Theme = {
	name: 'high-contrast',
	border: '#ffffff',
	text: '#f0f0f0',
	textMuted: '#a0a4b8',
	textInverse: '#1a1a2e',
	status: {
		success: '#50fa7b', // ~8.5:1 on #1a1a2e
		error: '#ff5555', // ~5.2:1
		warning: '#f1fa8c', // ~13:1
		info: '#8be9fd', // ~9.5:1
		working: '#ffb86c', // ~8.8:1
		neutral: '#a0a4b8', // ~5.5:1
	},
	accent: '#bd93f9',
	accentSecondary: '#ff79c6',
	contextBar: {
		low: '#50fa7b',
		medium: '#ffb86c',
		high: '#ff5555',
	},
	dialog: {
		borderPermission: '#f1fa8c',
		borderQuestion: '#8be9fd',
	},
	inputPrompt: '#bd93f9',
	userMessage: {
		text: '#f0f0f0',
		background: '#2a2a4a',
		border: '#bd93f9',
	},
};

const THEMES: Record<ThemeName, Theme> = {
	dark: darkTheme,
	light: lightTheme,
	'high-contrast': highContrastTheme,
};

export function resolveTheme(name: string | undefined): Theme {
	if (name && name in THEMES) {
		return THEMES[name as ThemeName];
	}
	return darkTheme;
}
