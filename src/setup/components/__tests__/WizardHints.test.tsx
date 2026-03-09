import React from 'react';
import {render} from 'ink-testing-library';
import {describe, it, expect} from 'vitest';
import WizardHints from '../WizardHints';
import {ThemeProvider, darkTheme} from '../../../ui/theme/index';

function renderWithTheme(ui: React.ReactElement) {
	return render(<ThemeProvider value={darkTheme}>{ui}</ThemeProvider>);
}

describe('WizardHints', () => {
	it('shows move/select/skip for selecting state on step 0', () => {
		const {lastFrame} = renderWithTheme(
			<WizardHints stepState="selecting" stepIndex={0} />,
		);
		const frame = lastFrame()!;
		expect(frame).toContain('move');
		expect(frame).toContain('select');
		expect(frame).toContain('skip');
		expect(frame).not.toContain('back');
	});

	it('shows back hint when stepIndex > 0', () => {
		const {lastFrame} = renderWithTheme(
			<WizardHints stepState="selecting" stepIndex={1} />,
		);
		expect(lastFrame()!).toContain('back');
	});

	it('shows retry/back for error state', () => {
		const {lastFrame} = renderWithTheme(
			<WizardHints stepState="error" stepIndex={1} />,
		);
		const frame = lastFrame()!;
		expect(frame).toContain('retry');
		expect(frame).toContain('back');
	});

	it('shows nothing for verifying and success states', () => {
		const {lastFrame: vFrame} = renderWithTheme(
			<WizardHints stepState="verifying" stepIndex={0} />,
		);
		expect(vFrame()!.trim()).toBe('');

		const {lastFrame: sFrame} = renderWithTheme(
			<WizardHints stepState="success" stepIndex={0} />,
		);
		expect(sFrame()!.trim()).toBe('');
	});
});
