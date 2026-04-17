import {describe, it, expect} from 'vitest';
import {
	WorkflowAmbiguityError,
	WorkflowNotFoundError,
	WorkflowVersionNotFoundError,
} from '../workflowSourceErrors';

describe('WorkflowAmbiguityError', () => {
	it('lists every candidate source in the message', () => {
		const err = new WorkflowAmbiguityError('e2e-test-builder', [
			{
				sourceLabel: 'marketplace owner/a',
				disambiguator: 'e2e-test-builder@owner/a',
			},
			{
				sourceLabel: 'local marketplace /tmp/m',
				disambiguator: '/tmp/m/workflows/e2e-test-builder/workflow.json',
			},
		]);
		expect(err.message).toContain('e2e-test-builder');
		expect(err.message).toContain('owner/a');
		expect(err.message).toContain('/tmp/m');
		expect(err.workflowName).toBe('e2e-test-builder');
		expect(err.candidates).toHaveLength(2);
	});

	it('is an Error subclass', () => {
		const err = new WorkflowAmbiguityError('x', []);
		expect(err).toBeInstanceOf(Error);
		expect(err.name).toBe('WorkflowAmbiguityError');
	});
});

describe('WorkflowNotFoundError', () => {
	it('mentions searched sources', () => {
		const err = new WorkflowNotFoundError('missing', ['owner/a', 'owner/b']);
		expect(err.message).toContain('missing');
		expect(err.message).toContain('owner/a');
		expect(err.message).toContain('owner/b');
		expect(err.workflowName).toBe('missing');
	});
});

describe('WorkflowVersionNotFoundError', () => {
	it('re-exports the existing class unchanged', () => {
		const err = new WorkflowVersionNotFoundError(
			'x',
			'1.0.0',
			'0.9.0',
			'marketplace owner/a',
		);
		expect(err).toBeInstanceOf(Error);
		expect(err.requestedVersion).toBe('1.0.0');
	});
});
