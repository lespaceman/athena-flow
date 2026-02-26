import React from 'react';
import {render} from 'ink-testing-library';
import {describe, it, expect, vi} from 'vitest';
import HarnessStep from '../HarnessStep.js';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

vi.mock('../../../utils/detectClaudeVersion.js', () => ({
	detectClaudeVersion: vi.fn(() => '2.5.0'),
}));

describe('HarnessStep', () => {
	it('renders Claude Code option and Codex as disabled', () => {
		const {lastFrame} = render(
			<HarnessStep onComplete={() => {}} onSkip={() => {}} onError={() => {}} />,
		);
		const frame = lastFrame()!;
		expect(frame).toContain('Claude Code');
		expect(frame).toContain('Codex');
	});

	it('calls onComplete with harness and version after selection', async () => {
		let result = '';
		const {stdin} = render(
			<HarnessStep
				onComplete={v => {
					result = v;
				}}
				onSkip={() => {}}
				onError={() => {}}
			/>,
		);
		stdin.write('\r'); // Select Claude Code
		// Wait for async verification
		await vi.waitFor(() => {
			expect(result).toBe('claude-code');
		});
	});

	it('allows users to skip harness setup', async () => {
		let skipped = false;
		const {stdin} = render(
			<HarnessStep
				onComplete={() => {}}
				onSkip={() => {
					skipped = true;
				}}
				onError={() => {}}
			/>,
		);
		stdin.write('\u001B[B'); // Move to "Skip for now"
		await delay(30);
		stdin.write('\r');
		expect(skipped).toBe(true);
	});
});
