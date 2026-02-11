import {type Theme, type ThemeName} from './types.js';

export const darkTheme: Theme = {
	name: 'dark',
	border: 'cyan',
	text: 'white',
	textMuted: 'gray',
	textInverse: 'black',
	status: {
		success: 'green',
		error: 'red',
		warning: 'yellow',
		info: 'cyan',
		neutral: 'gray',
	},
	accent: 'cyan',
	accentSecondary: 'magenta',
	contextBar: {
		low: 'green',
		medium: '#FF8C00',
		high: 'red',
	},
	userMessage: {
		text: '#b0b0b0',
		background: '#2d3748',
	},
};

export const lightTheme: Theme = {
	name: 'light',
	border: 'blue',
	text: 'black',
	textMuted: 'gray',
	textInverse: 'white',
	status: {
		success: 'green',
		error: 'red',
		warning: '#B8860B',
		info: 'blue',
		neutral: 'gray',
	},
	accent: 'blue',
	accentSecondary: '#8B008B',
	contextBar: {
		low: 'green',
		medium: '#B8860B',
		high: 'red',
	},
	userMessage: {
		text: '#4a5568',
		background: '#edf2f7',
	},
};

const THEMES: Record<ThemeName, Theme> = {dark: darkTheme, light: lightTheme};

export function resolveTheme(name: string | undefined): Theme {
	if (name && name in THEMES) {
		return THEMES[name as ThemeName];
	}
	return darkTheme;
}
