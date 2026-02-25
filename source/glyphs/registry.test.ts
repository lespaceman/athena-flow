import {describe, expect, it} from 'vitest';
import stringWidth from 'string-width';
import {GLYPH_REGISTRY, type GlyphKey} from './registry.js';
import {getGlyphs, feedGlyphs, todoGlyphSet, frameGlyphs} from './index.js';

describe('GLYPH_REGISTRY', () => {
	const entries = Object.entries(GLYPH_REGISTRY) as [
		GlyphKey,
		{unicode: string; ascii: string},
	][];

	it('every glyph has non-empty unicode and ascii variants', () => {
		for (const [key, pair] of entries) {
			expect(pair.unicode, `${key}.unicode`).not.toBe('');
			expect(pair.ascii, `${key}.ascii`).not.toBe('');
		}
	});

	it('unicode glyphs have display width 1 (except multi-char allowed)', () => {
		// Hint glyphs are label-like (multi-char in both unicode and ascii)
		const multiCharAllowed = new Set<GlyphKey>([
			'tool.arrow',
			'general.ellipsis',
			'hint.enter',
			'hint.escape',
			'hint.tab',
			'hint.arrows',
			'hint.arrowsUpDown',
			'hint.space',
			'hint.page',
			'hint.separator',
			'hint.toggle',
		]);
		for (const [key, pair] of entries) {
			if (!multiCharAllowed.has(key)) {
				expect(stringWidth(pair.unicode), `${key}.unicode width`).toBe(1);
				expect(stringWidth(pair.ascii), `${key}.ascii width`).toBe(1);
			}
		}
	});

	it('unicode and ascii variants differ for every key', () => {
		for (const [key, pair] of entries) {
			expect(pair.unicode, `${key}: unicode should differ from ascii`).not.toBe(
				pair.ascii,
			);
		}
	});
});

describe('getGlyphs', () => {
	it('returns unicode set by default', () => {
		const g = getGlyphs();
		expect(g['feed.expandCollapsed']).toBe('▸');
		expect(g['todo.done']).toBe('✓');
	});

	it('returns ascii set when ascii=true', () => {
		const g = getGlyphs(true);
		expect(g['feed.expandCollapsed']).toBe('>');
		expect(g['todo.done']).toBe('x');
	});
});

describe('domain helpers', () => {
	it('feedGlyphs returns only feed-prefixed keys with prefix stripped', () => {
		const f = feedGlyphs();
		expect(f.expandCollapsed).toBe('▸');
		expect(f.expandExpanded).toBe('▾');
		expect(f.searchMatch).toBe('▌');
		expect(f.userBorder).toBe('▎');
		expect(f.focusBorder).toBe('▎');
		expect(Object.keys(f)).toHaveLength(5);
	});

	it('todoGlyphSet returns todo keys', () => {
		const t = todoGlyphSet();
		expect(t.doing).toBe('■');
		expect(t.done).toBe('✓');
		expect(t.open).toBe('□');
	});

	it('frameGlyphs returns frame keys', () => {
		const f = frameGlyphs();
		expect(f.topLeft).toBe('┌');
		expect(f.horizontal).toBe('─');
	});

	it('domain helpers respect ascii flag', () => {
		const f = feedGlyphs(true);
		expect(f.expandCollapsed).toBe('>');
		expect(f.expandExpanded).toBe('v');
	});
});
