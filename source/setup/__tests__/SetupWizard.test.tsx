import React from 'react';
import {render} from 'ink-testing-library';
import {describe, it, expect, vi} from 'vitest';
import SetupWizard from '../SetupWizard.js';
import {ThemeProvider} from '../../theme/index.js';
import {darkTheme} from '../../theme/index.js';

vi.mock('../../utils/detectClaudeVersion.js', () => ({
	detectClaudeVersion: vi.fn(() => '2.5.0'),
}));
vi.mock('../../workflows/index.js', () => ({
	installWorkflow: vi.fn(() => 'e2e-test-builder'),
	resolveWorkflow: vi.fn(() => ({name: 'e2e-test-builder', plugins: []})),
}));
vi.mock('../../plugins/config.js', () => ({
	writeGlobalConfig: vi.fn(),
}));

describe('SetupWizard', () => {
	it('renders the first step (theme selection)', () => {
		const {lastFrame} = render(
			<ThemeProvider value={darkTheme}>
				<SetupWizard onComplete={() => {}} />
			</ThemeProvider>,
		);
		expect(lastFrame()!).toContain('Dark');
		expect(lastFrame()!).toContain('Light');
	});
});
