import {describe, expect, it} from 'vitest';
import {
	buildPanelRects,
	looksLikeMouseEscapeSequence,
	parseSgrClickEvents,
	parseSgrWheelEvents,
	resolvePanelTarget,
} from '../usePanelMouseWheel';

describe('parseSgrWheelEvents', () => {
	it('extracts wheel direction and coordinates from SGR mouse input', () => {
		const input = '\x1B[<64;12;8M\x1B[<65;30;15M';

		expect(parseSgrWheelEvents(input)).toEqual([
			{direction: 'up', col: 12, row: 8},
			{direction: 'down', col: 30, row: 15},
		]);
	});

	it('ignores non-wheel mouse events', () => {
		const input = '\x1B[<0;12;8M\x1B[<32;14;9M';

		expect(parseSgrWheelEvents(input)).toEqual([]);
	});
});

describe('parseSgrClickEvents', () => {
	it('extracts left-click coordinates from SGR mouse input', () => {
		const input = '\x1B[<0;12;8M\x1B[<0;30;15M';

		expect(parseSgrClickEvents(input)).toEqual([
			{button: 'left', col: 12, row: 8},
			{button: 'left', col: 30, row: 15},
		]);
	});

	it('ignores releases and non-left button codes', () => {
		const input = '\x1B[<0;12;8m\x1B[<64;14;9M\x1B[<32;14;9M';

		expect(parseSgrClickEvents(input)).toEqual([]);
	});
});

describe('looksLikeMouseEscapeSequence', () => {
	it('recognizes full SGR wheel escape sequences', () => {
		expect(looksLikeMouseEscapeSequence('\x1B[<64;12;8M')).toBe(true);
		expect(looksLikeMouseEscapeSequence('\x1B[<65;30;15M')).toBe(true);
	});

	it('recognizes fragments that can leak through useInput', () => {
		expect(looksLikeMouseEscapeSequence('[<64;12;8M')).toBe(true);
		expect(looksLikeMouseEscapeSequence('64;12;8M')).toBe(true);
	});

	it('does not classify normal typed input as mouse data', () => {
		expect(looksLikeMouseEscapeSequence('/help')).toBe(false);
		expect(looksLikeMouseEscapeSequence('hello')).toBe(false);
	});
});

describe('buildPanelRects', () => {
	it('builds a single feed rect in non-split mode', () => {
		expect(
			buildPanelRects({
				splitMode: false,
				frameWidth: 80,
				feedStartRow: 6,
				panelRows: 12,
				messagePanelWidth: 0,
				feedPanelWidth: 78,
				inputStartRow: 18,
				inputRows: 5,
			}),
		).toEqual({
			feed: {left: 2, right: 79, top: 6, bottom: 17},
			input: {left: 2, right: 79, top: 18, bottom: 22},
		});
	});

	it('builds separate message and feed rects in split mode', () => {
		expect(
			buildPanelRects({
				splitMode: true,
				frameWidth: 100,
				feedStartRow: 5,
				panelRows: 10,
				messagePanelWidth: 39,
				feedPanelWidth: 58,
				inputStartRow: 15,
				inputRows: 5,
			}),
		).toEqual({
			messages: {left: 2, right: 41, top: 5, bottom: 14},
			feed: {left: 42, right: 99, top: 5, bottom: 14},
			input: {left: 2, right: 99, top: 15, bottom: 19},
		});
	});
});

describe('resolvePanelTarget', () => {
	it('routes mouse events to the message/feed panel by coordinates', () => {
		const rects = buildPanelRects({
			splitMode: true,
			frameWidth: 100,
			feedStartRow: 5,
			panelRows: 10,
			messagePanelWidth: 39,
			feedPanelWidth: 58,
			inputStartRow: 15,
			inputRows: 5,
		});

		expect(resolvePanelTarget(rects, 10, 15)).toBe('input');
		expect(resolvePanelTarget(rects, 10, 19)).toBe('input');
		expect(resolvePanelTarget(rects, 10, 8)).toBe('messages');
		expect(resolvePanelTarget(rects, 80, 8)).toBe('feed');
		expect(resolvePanelTarget(rects, 1, 8)).toBeNull();
		expect(resolvePanelTarget(rects, 10, 20)).toBeNull();
	});
});
