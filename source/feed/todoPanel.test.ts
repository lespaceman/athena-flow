import {describe, it, expect} from 'vitest';
import {toTodoStatus, symbolForTodoStatus, glyphForTodoStatus, todoCaret, todoDivider, todoScrollUp, todoScrollDown} from './todoPanel.js';

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

describe('glyphForTodoStatus', () => {
	it('returns Unicode glyphs by default', () => {
		expect(glyphForTodoStatus('doing')).toBe('⟳');
		expect(glyphForTodoStatus('open')).toBe('○');
		expect(glyphForTodoStatus('done')).toBe('✓');
		expect(glyphForTodoStatus('blocked')).toBe('○');
	});

	it('returns ASCII glyphs when ascii=true', () => {
		expect(glyphForTodoStatus('doing', true)).toBe('~');
		expect(glyphForTodoStatus('open', true)).toBe('-');
		expect(glyphForTodoStatus('done', true)).toBe('x');
		expect(glyphForTodoStatus('blocked', true)).toBe('-');
	});
});

describe('todoCaret', () => {
	it('returns Unicode caret by default', () => {
		expect(todoCaret(false)).toBe('▶');
	});

	it('returns ASCII caret when ascii=true', () => {
		expect(todoCaret(true)).toBe('>');
	});
});

describe('todoDivider', () => {
	it('returns Unicode divider of given width', () => {
		expect(todoDivider(40, false)).toBe('─'.repeat(40));
	});

	it('returns ASCII divider when ascii=true', () => {
		expect(todoDivider(40, true)).toBe('-'.repeat(40));
	});
});

describe('todoScrollUp', () => {
	it('returns ▲ by default and ^ for ASCII', () => {
		expect(todoScrollUp(false)).toBe('▲');
		expect(todoScrollUp(true)).toBe('^');
	});
});

describe('todoScrollDown', () => {
	it('returns ▼ by default and v for ASCII', () => {
		expect(todoScrollDown(false)).toBe('▼');
		expect(todoScrollDown(true)).toBe('v');
	});
});
