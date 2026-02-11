import {createContext, useContext} from 'react';
import {type Theme} from './types.js';
import {darkTheme} from './themes.js';

const ThemeContext = createContext<Theme>(darkTheme);

export const ThemeProvider = ThemeContext.Provider;

export function useTheme(): Theme {
	return useContext(ThemeContext);
}
