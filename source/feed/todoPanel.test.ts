import {describe, it, expect} from 'vitest';
import {toTodoStatus, symbolForTodoStatus} from './todoPanel.js';

describe('toTodoStatus', () => {
	it('maps TodoItem statuses to TodoPanelStatus', () => {
		expect(toTodoStatus('pending')).toBe('open');
		expect(toTodoStatus('in_progress')).toBe('doing');
		expect(toTodoStatus('completed')).toBe('done');
		expect(toTodoStatus('failed')).toBe('blocked');
	});
});

describe('symbolForTodoStatus', () => {
	it('returns correct symbol for each status', () => {
		expect(symbolForTodoStatus('open')).toBe('[ ]');
		expect(symbolForTodoStatus('doing')).toBe('[>]');
		expect(symbolForTodoStatus('done')).toBe('[x]');
		expect(symbolForTodoStatus('blocked')).toBe('[!]');
	});
});
