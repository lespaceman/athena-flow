import React from 'react';
import {render} from 'ink-testing-library';
import {describe, it, expect, vi, beforeEach} from 'vitest';
import SetupWizard from '../SetupWizard.js';
import {ThemeProvider} from '../../theme/index.js';
import {darkTheme} from '../../theme/index.js';
import {writeGlobalConfig} from '../../plugins/config.js';

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

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('SetupWizard', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('renders the first step (theme selection)', () => {
		const {lastFrame} = render(
			<ThemeProvider value={darkTheme}>
				<SetupWizard onComplete={() => {}} />
			</ThemeProvider>,
		);
		expect(lastFrame()!).toContain('Dark');
		expect(lastFrame()!).toContain('Light');
		expect(lastFrame()!).toContain('Up/Down move');
	});

	it('completes setup and persists config', async () => {
		const onComplete = vi.fn();
		const {stdin} = render(
			<ThemeProvider value={darkTheme}>
				<SetupWizard onComplete={onComplete} />
			</ThemeProvider>,
		);

		stdin.write('\r'); // Theme: Dark
		await delay(650);
		stdin.write('s'); // Harness: Skip
		await delay(650);
		stdin.write('\u001B[B'); // Workflow: None - configure later
		await delay(30);
		stdin.write('\r');

		await vi.waitFor(() => {
			expect(writeGlobalConfig).toHaveBeenCalledWith({
				setupComplete: true,
				theme: 'dark',
				harness: undefined,
				workflow: undefined,
			});
			expect(onComplete).toHaveBeenCalledTimes(1);
		});
	});

	it('shows save error and retries when user presses r', async () => {
		const writeMock = vi.mocked(writeGlobalConfig);
		writeMock
			.mockImplementationOnce(() => {
				throw new Error('disk full');
			})
			.mockImplementationOnce(() => {});

		const onComplete = vi.fn();
		const {stdin, lastFrame} = render(
			<ThemeProvider value={darkTheme}>
				<SetupWizard onComplete={onComplete} />
			</ThemeProvider>,
		);

		stdin.write('\r'); // Theme: Dark
		await delay(650);
		stdin.write('s'); // Harness: Skip
		await delay(650);
		stdin.write('\u001B[B'); // Workflow: None - configure later
		await delay(30);
		stdin.write('\r');

		await vi.waitFor(() => {
			expect(lastFrame()!).toContain('Failed to write setup config');
		});
		expect(onComplete).not.toHaveBeenCalled();

		stdin.write('r');
		await delay(650);

		await vi.waitFor(
			() => {
				expect(onComplete).toHaveBeenCalledTimes(1);
				expect(writeMock).toHaveBeenCalledTimes(2);
			},
			{timeout: 3000},
		);
	});

	it('supports skip and back keyboard shortcuts', async () => {
		const {stdin, lastFrame} = render(
			<ThemeProvider value={darkTheme}>
				<SetupWizard onComplete={() => {}} />
			</ThemeProvider>,
		);

		stdin.write('s'); // Skip theme step
		await delay(650);
		await vi.waitFor(() => {
			expect(lastFrame()!).toContain('Select harness');
		});

		stdin.write('\u001B'); // Esc back
		await delay(80);
		expect(lastFrame()!).toContain('Choose your display theme');
	});
});
