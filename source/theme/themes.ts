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
		neutral: '#6c7086',
	},
	accent: '#89b4fa',
	accentSecondary: '#cba6f7',
	contextBar: {
		low: '#a6e3a1',
		medium: '#fab387',
		high: '#f38ba8',
	},
	userMessage: {
		text: '#bac2de',
		background: '#313244',
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
		neutral: '#6c6f85',
	},
	accent: '#5c5cff',
	accentSecondary: '#8839ef',
	contextBar: {
		low: '#40a02b',
		medium: '#df8e1d',
		high: '#d20f39',
	},
	userMessage: {
		text: '#4c4f69',
		background: '#ccd0da',
	},
};

const THEMES: Record<ThemeName, Theme> = {dark: darkTheme, light: lightTheme};

export function resolveTheme(name: string | undefined): Theme {
	if (name && name in THEMES) {
		return THEMES[name as ThemeName];
	}
	return darkTheme;
}
