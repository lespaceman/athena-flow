import React from 'react';
import {render} from 'ink-testing-library';
import {describe, it, expect} from 'vitest';
import StepStatus from '../StepStatus';

describe('StepStatus', () => {
	it('renders success state with checkmark', () => {
		const {lastFrame} = render(
			<StepStatus status="success" message="Theme set to Dark" />,
		);
		expect(lastFrame()!).toContain('✓');
		expect(lastFrame()!).toContain('Theme set to Dark');
	});

	it('renders error state with cross', () => {
		const {lastFrame} = render(
			<StepStatus status="error" message="Claude Code not found" />,
		);
		expect(lastFrame()!).toContain('✗');
		expect(lastFrame()!).toContain('Claude Code not found');
	});

	it('renders verifying state with spinner text', () => {
		const {lastFrame} = render(
			<StepStatus status="verifying" message="Checking..." />,
		);
		expect(lastFrame()!).toContain('Checking...');
	});
});
