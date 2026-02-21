import {describe, it, expect} from 'vitest';
import chalk from 'chalk';
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
		expect(g.statusGlyph('doing')).toBe('■');
		expect(g.statusGlyph('open')).toBe('□');
		expect(g.statusGlyph('done')).toBe('✓');
		expect(g.statusGlyph('blocked')).toBe('□');
		expect(g.caret).toBe('▶');
		expect(g.dividerChar).toBe('─');
		expect(g.scrollUp).toBe('▲');
		expect(g.scrollDown).toBe('▼');
	});

	it('applies chalk.hex colors when colors are provided', () => {
		const prevLevel = chalk.level;
		chalk.level = 3; // force truecolor so ANSI codes are emitted
		try {
			const colors = {doing: '#ffcc00', done: '#00ff00', default: '#888888'};
			const g = todoGlyphs(false, colors);
			// Colored glyphs contain ANSI escape codes wrapping the raw glyph
			expect(g.statusGlyph('doing')).toContain('■');
			expect(g.statusGlyph('doing')).not.toBe('■');
			expect(g.statusGlyph('done')).toContain('✓');
			expect(g.statusGlyph('done')).not.toBe('✓');
			expect(g.statusGlyph('open')).toContain('□');
			expect(g.statusGlyph('open')).not.toBe('□');
			expect(g.statusGlyph('blocked')).toContain('□');
			expect(g.statusGlyph('blocked')).not.toBe('□');
		} finally {
			chalk.level = prevLevel;
		}
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
