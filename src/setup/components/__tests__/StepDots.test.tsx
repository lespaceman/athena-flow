import React from 'react';
import {render} from 'ink-testing-library';
import {describe, it, expect} from 'vitest';
import StepDots from '../StepDots';
import {ThemeProvider, darkTheme} from '../../../ui/theme/index';

function renderWithTheme(ui: React.ReactElement) {
	return render(<ThemeProvider value={darkTheme}>{ui}</ThemeProvider>);
}

describe('StepDots', () => {
	it('shows active dot for current step and pending for rest', () => {
		const {lastFrame} = renderWithTheme(
			<StepDots
				steps={['Theme', 'Harness', 'Workflow', 'MCP Options']}
				currentIndex={0}
				completedSteps={new Set()}
			/>,
		);
		const frame = lastFrame()!;
		expect(frame).toContain('◉');
		expect(frame).toContain('○');
		expect(frame).toContain('Theme');
	});

	it('shows check marks for completed steps', () => {
		const {lastFrame} = renderWithTheme(
			<StepDots
				steps={['Theme', 'Harness', 'Workflow', 'MCP Options']}
				currentIndex={2}
				completedSteps={new Set([0, 1])}
			/>,
		);
		const frame = lastFrame()!;
		expect(frame).toContain('✓');
		expect(frame).toContain('◉');
		expect(frame).toContain('Workflow');
	});

	it('shows all checks when complete', () => {
		const {lastFrame} = renderWithTheme(
			<StepDots
				steps={['Theme', 'Harness', 'Workflow', 'MCP Options']}
				currentIndex={4}
				completedSteps={new Set([0, 1, 2, 3])}
			/>,
		);
		const frame = lastFrame()!;
		const checks = (frame.match(/✓/g) || []).length;
		expect(checks).toBe(4);
		expect(frame).toContain('Complete');
	});
});
