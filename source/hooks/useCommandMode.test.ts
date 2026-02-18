import {describe, it, expect} from 'vitest';
import {parseCommand} from './useCommandMode.js';

describe('parseCommand', () => {
	it('parses :todo as toggle-todo', () => {
		expect(parseCommand(':todo')).toEqual({type: 'toggle-todo'});
	});

	it('parses :todo done as toggle-todo-done', () => {
		expect(parseCommand(':todo done')).toEqual({type: 'toggle-todo-done'});
	});

	it('parses :todo focus as focus-todo', () => {
		expect(parseCommand(':todo focus')).toEqual({type: 'focus-todo'});
	});

	it('parses :todo add with default priority', () => {
		expect(parseCommand(':todo add fix the bug')).toEqual({
			type: 'add-todo',
			priority: 'P1',
			text: 'fix the bug',
		});
	});

	it('parses :todo add with explicit priority', () => {
		expect(parseCommand(':todo add p0 urgent task')).toEqual({
			type: 'add-todo',
			priority: 'P0',
			text: 'urgent task',
		});
		expect(parseCommand(':todo add P2 low prio')).toEqual({
			type: 'add-todo',
			priority: 'P2',
			text: 'low prio',
		});
	});

	it('parses :run list as show-run-overlay', () => {
		expect(parseCommand(':run list')).toEqual({type: 'show-run-overlay'});
	});

	it('parses :run all as filter-all-runs', () => {
		expect(parseCommand(':run all')).toEqual({type: 'filter-all-runs'});
	});

	it('parses :run <id> as filter-run', () => {
		expect(parseCommand(':run R1')).toEqual({
			type: 'filter-run',
			needle: 'r1',
		});
	});

	it('parses :tail as jump-to-tail', () => {
		expect(parseCommand(':tail')).toEqual({type: 'jump-to-tail'});
	});

	it('parses :jump <id> as jump-to-event', () => {
		expect(parseCommand(':jump EVT123')).toEqual({
			type: 'jump-to-event',
			needle: 'evt123',
		});
	});

	it('parses :errors as toggle-errors', () => {
		expect(parseCommand(':errors')).toEqual({type: 'toggle-errors'});
	});

	it('returns unknown for unrecognized commands', () => {
		expect(parseCommand(':foobar')).toEqual({
			type: 'unknown',
			command: ':foobar',
		});
	});

	it('trims whitespace', () => {
		expect(parseCommand('  :todo  ')).toEqual({type: 'toggle-todo'});
	});
});
