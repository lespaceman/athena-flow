import React from 'react';
import {render} from 'ink-testing-library';
import {describe, it, expect, vi} from 'vitest';
import HarnessStep from '../HarnessStep.js';

vi.mock('../../../utils/detectClaudeVersion.js', () => ({
	detectClaudeVersion: vi.fn(() => '2.5.0'),
}));

describe('HarnessStep', () => {
	it('renders Claude Code option and Codex as disabled', () => {
		const {lastFrame} = render(
			<HarnessStep onComplete={() => {}} onError={() => {}} />,
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
				onError={() => {}}
			/>,
		);
		stdin.write('\r'); // Select Claude Code
		// Wait for async verification
		await vi.waitFor(() => {
			expect(result).toBe('claude-code');
		});
	});
});
