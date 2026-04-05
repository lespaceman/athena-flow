import {describe, expect, it} from 'vitest';
import {shouldResolveWorkflow} from '../shouldResolveWorkflow';

describe('shouldResolveWorkflow', () => {
	it('resolves when a workflow is configured and setup is not shown', () => {
		expect(
			shouldResolveWorkflow({
				showSetup: false,
				workflowName: 'e2e-test-builder',
			}),
		).toBe(true);
	});

	it('still resolves when setup is shown', () => {
		expect(
			shouldResolveWorkflow({
				showSetup: true,
				workflowName: 'e2e-test-builder',
			}),
		).toBe(true);
	});

	it('does not resolve when workflow is not configured', () => {
		expect(
			shouldResolveWorkflow({
				showSetup: false,
				workflowName: undefined,
			}),
		).toBe(false);
	});
});
