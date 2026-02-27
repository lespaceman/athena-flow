import React from 'react';
import {render} from 'ink-testing-library';
import {describe, it, expect, vi} from 'vitest';
import WorkflowStep from '../WorkflowStep';

vi.mock('../../../workflows/index', () => ({
	installWorkflow: vi.fn(() => 'e2e-test-builder'),
	resolveWorkflow: vi.fn(() => ({name: 'e2e-test-builder', plugins: []})),
}));

describe('WorkflowStep', () => {
	it('renders workflow options including skip', () => {
		const {lastFrame} = render(
			<WorkflowStep
				onComplete={() => {}}
				onError={() => {}}
				onSkip={() => {}}
			/>,
		);
		const frame = lastFrame()!;
		expect(frame).toContain('e2e-test-builder');
		expect(frame).toContain('None');
	});

	it('calls onSkip when None is selected', async () => {
		let skipped = false;
		const {stdin} = render(
			<WorkflowStep
				onComplete={() => {}}
				onError={() => {}}
				onSkip={() => {
					skipped = true;
				}}
			/>,
		);
		// Move down past e2e-test-builder, past bug-triage (disabled), to "None"
		await new Promise(r => setTimeout(r, 50));
		stdin.write('\u001B[B'); // down to bug-triage
		await new Promise(r => setTimeout(r, 50));
		stdin.write('\u001B[B'); // down to None
		await new Promise(r => setTimeout(r, 50));
		stdin.write('\r');
		await new Promise(r => setTimeout(r, 50));
		expect(skipped).toBe(true);
	});
});
