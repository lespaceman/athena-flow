import React from 'react';
import {render} from 'ink-testing-library';
import {describe, it, expect, vi} from 'vitest';
import HarnessStep from '../HarnessStep.js';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

vi.mock('../../../utils/detectClaudeVersion.js', () => ({
	detectClaudeVersion: vi.fn(() => '2.5.0'),
}));

describe('HarnessStep', () => {
	it('renders numbered harness options', () => {
		const {lastFrame} = render(<HarnessStep onComplete={() => {}} onError={() => {}} />);
		const frame = lastFrame()!;
		expect(frame).toContain('1. Claude Code');
		expect(frame).toContain('2. OpenAI Codex');
		expect(frame).toContain('3. OpenCode');
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

	it('selects OpenAI Codex from the numbered list', async () => {
		let result = '';
		const {stdin} = render(
			<HarnessStep
				onComplete={v => {
					result = v;
				}}
				onError={() => {}}
			/>,
		);
		stdin.write('\u001B[B'); // Move to OpenAI Codex
		await delay(30);
		stdin.write('\r');
		expect(result).toBe('openai-codex');
	});
});
