import {describe, it, expect} from 'vitest';
import {toTodoStatus} from './todoPanel.js';

describe('toTodoStatus', () => {
	it('maps failed to failed (not blocked)', () => {
		expect(toTodoStatus('failed')).toBe('failed');
	});

	it('maps in_progress to doing', () => {
		expect(toTodoStatus('in_progress')).toBe('doing');
	});

	it('maps completed to done', () => {
		expect(toTodoStatus('completed')).toBe('done');
	});

	it('maps pending to open', () => {
		expect(toTodoStatus('pending')).toBe('open');
	});
});
