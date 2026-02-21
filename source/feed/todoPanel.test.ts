import {describe, it, expect} from 'vitest';
import {
	toTodoStatus,
	todoGlyphs,
	SPINNER_FRAMES,
	ASCII_SPINNER_FRAMES,
} from './todoPanel.js';

describe('toTodoStatus', () => {
	it('maps TodoItem statuses to TodoPanelStatus', () => {
		expect(toTodoStatus('pending')).toBe('open');
		expect(toTodoStatus('in_progress')).toBe('doing');
		expect(toTodoStatus('completed')).toBe('done');
		expect(toTodoStatus('failed')).toBe('blocked');
	});
});

describe('todoGlyphs', () => {
	it('returns Unicode glyphs with spinner frame', () => {
		const g = todoGlyphs(false, 0);
		expect(g.statusGlyph('doing')).toBe(SPINNER_FRAMES[0]);
		expect(g.statusGlyph('open')).toBe('○');
		expect(g.statusGlyph('done')).toBe('✓');
		expect(g.statusGlyph('blocked')).toBe('○');
		expect(g.caret).toBe('▶');
		expect(g.dividerChar).toBe('─');
		expect(g.scrollUp).toBe('▲');
		expect(g.scrollDown).toBe('▼');
	});

	it('cycles spinner frames for doing status', () => {
		const g0 = todoGlyphs(false, 0);
		const g3 = todoGlyphs(false, 3);
		expect(g0.statusGlyph('doing')).toBe(SPINNER_FRAMES[0]);
		expect(g3.statusGlyph('doing')).toBe(SPINNER_FRAMES[3]);
		// Wraps around
		const gWrap = todoGlyphs(false, SPINNER_FRAMES.length);
		expect(gWrap.statusGlyph('doing')).toBe(SPINNER_FRAMES[0]);
	});

	it('returns ASCII glyphs with ASCII spinner', () => {
		const g = todoGlyphs(true, 0);
		expect(g.statusGlyph('doing')).toBe(ASCII_SPINNER_FRAMES[0]);
		expect(g.statusGlyph('open')).toBe('-');
		expect(g.statusGlyph('done')).toBe('x');
		expect(g.statusGlyph('blocked')).toBe('-');
		expect(g.caret).toBe('>');
		expect(g.dividerChar).toBe('-');
		expect(g.scrollUp).toBe('^');
		expect(g.scrollDown).toBe('v');
	});
});
