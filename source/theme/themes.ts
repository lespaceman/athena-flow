import {type Theme, type ThemeName} from './types.js';

export const darkTheme: Theme = {
	name: 'dark',
	border: '#58a6ff',
	text: '#e6edf3',
	textMuted: '#484f58',
	textInverse: '#0d1117',
	status: {
		success: '#3fb950',
		error: '#f85149',
		warning: '#d29922',
		info: '#79c0ff',
		working: '#e3b341',
		neutral: '#484f58',
	},
	accent: '#58a6ff',
	accentSecondary: '#a371f7',
	contextBar: {
		low: '#3fb950',
		medium: '#d29922',
		high: '#f85149',
	},
	dialog: {
		borderPermission: '#d29922',
		borderQuestion: '#79c0ff',
	},
	inputPrompt: '#58a6ff',
	userMessage: {
		text: '#c9d1d9',
		background: '#161b22',
		border: '#58a6ff',
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
