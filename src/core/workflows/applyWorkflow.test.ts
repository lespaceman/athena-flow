import {describe, it, expect} from 'vitest';
import {applyPromptTemplate} from './applyWorkflow';

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

	it('replaces all {input} occurrences', () => {
		expect(applyPromptTemplate('{input} and {input}', 'hello')).toBe(
			'hello and hello',
		);
	});

	it('substitutes {sessionId} and {trackerPath} when context provided', () => {
		expect(
			applyPromptTemplate(
				'Run {input} at {trackerPath} for {sessionId}',
				'task',
				{
					sessionId: 's1',
					trackerPath: '.athena/s1/tracker.md',
				},
			),
		).toBe('Run task at .athena/s1/tracker.md for s1');
	});
});
