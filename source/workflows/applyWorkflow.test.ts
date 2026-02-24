import {describe, it, expect} from 'vitest';
import {applyPromptTemplate} from './applyWorkflow.js';

describe('applyPromptTemplate', () => {
	it('replaces {input} with user prompt', () => {
		expect(
			applyPromptTemplate(
				'Use /add-e2e-tests {input}',
				'login flow on xyz.com',
			),
		).toBe('Use /add-e2e-tests login flow on xyz.com');
	});

	it('handles template with no {input} placeholder', () => {
		expect(applyPromptTemplate('static prompt', 'ignored')).toBe(
			'static prompt',
		);
	});

	it('replaces only the first {input} occurrence', () => {
		expect(applyPromptTemplate('{input} and {input}', 'hello')).toBe(
			'hello and {input}',
		);
	});
});
