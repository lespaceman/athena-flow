import {describe, it, expect} from 'vitest';
import {toTodoStatus, todoGlyphs} from './todoPanel.js';

describe('toTodoStatus', () => {
	it('maps TodoItem statuses to TodoPanelStatus', () => {
		expect(toTodoStatus('pending')).toBe('open');
		expect(toTodoStatus('in_progress')).toBe('doing');
		expect(toTodoStatus('completed')).toBe('done');
		expect(toTodoStatus('failed')).toBe('blocked');
	});
});

describe('todoGlyphs', () => {
	it('returns Unicode glyphs with static doing indicator', () => {
		const g = todoGlyphs(false);
		expect(g.statusGlyph('doing')).toBe('●');
		expect(g.statusGlyph('open')).toBe('○');
		expect(g.statusGlyph('done')).toBe('✓');
		expect(g.statusGlyph('blocked')).toBe('○');
		expect(g.caret).toBe('▶');
		expect(g.dividerChar).toBe('─');
		expect(g.scrollUp).toBe('▲');
		expect(g.scrollDown).toBe('▼');
	});

	it('returns ASCII glyphs with static doing indicator', () => {
		const g = todoGlyphs(true);
		expect(g.statusGlyph('doing')).toBe('*');
		expect(g.statusGlyph('open')).toBe('-');
		expect(g.statusGlyph('done')).toBe('x');
		expect(g.statusGlyph('blocked')).toBe('-');
		expect(g.caret).toBe('>');
		expect(g.dividerChar).toBe('-');
		expect(g.scrollUp).toBe('^');
		expect(g.scrollDown).toBe('v');
	});
});
