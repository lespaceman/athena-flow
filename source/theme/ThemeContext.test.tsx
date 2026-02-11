import React from 'react';
import {describe, it, expect} from 'vitest';
import {render} from 'ink-testing-library';
import {Text} from 'ink';
import {ThemeProvider, useTheme} from './index.js';
import {darkTheme, lightTheme} from './themes.js';

/** Renders the theme name so we can assert on it. */
function ThemeProbe() {
	const theme = useTheme();
	return <Text>{`theme:${theme.name} accent:${theme.accent}`}</Text>;
}

describe('ThemeContext', () => {
	it('provides darkTheme by default (no provider)', () => {
		const {lastFrame} = render(<ThemeProbe />);
		expect(lastFrame()).toContain('theme:dark');
		expect(lastFrame()).toContain('accent:cyan');
	});

	it('provides darkTheme when wrapped with dark ThemeProvider', () => {
		const {lastFrame} = render(
			<ThemeProvider value={darkTheme}>
				<ThemeProbe />
			</ThemeProvider>,
		);
		expect(lastFrame()).toContain('theme:dark');
		expect(lastFrame()).toContain('accent:cyan');
	});

	it('provides lightTheme when wrapped with light ThemeProvider', () => {
		const {lastFrame} = render(
			<ThemeProvider value={lightTheme}>
				<ThemeProbe />
			</ThemeProvider>,
		);
		expect(lastFrame()).toContain('theme:light');
		expect(lastFrame()).toContain(`accent:${lightTheme.accent}`);
	});
});
