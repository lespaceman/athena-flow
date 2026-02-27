/** @vitest-environment jsdom */
import {describe, it, expect} from 'vitest';
import {renderHook, act} from '@testing-library/react';
import {useFocusableList} from '../useFocusableList';

describe('useFocusableList', () => {
	const ids = ['E1', 'E2', 'E3'];

	it('initializes cursor at 0 and empty expandSet', () => {
		const {result} = renderHook(() => useFocusableList(ids));
		expect(result.current.cursor).toBe(0);
		expect(result.current.expandedSet.size).toBe(0);
		expect(result.current.focusedId).toBe('E1');
	});

	it('moveDown increments cursor, clamped at end', () => {
		const {result} = renderHook(() => useFocusableList(ids));
		act(() => result.current.moveDown());
		expect(result.current.cursor).toBe(1);
		act(() => result.current.moveDown());
		act(() => result.current.moveDown());
		expect(result.current.cursor).toBe(2); // clamped
	});

	it('moveUp decrements cursor, clamped at 0', () => {
		const {result} = renderHook(() => useFocusableList(ids));
		act(() => result.current.moveDown());
		act(() => result.current.moveUp());
		expect(result.current.cursor).toBe(0);
		act(() => result.current.moveUp());
		expect(result.current.cursor).toBe(0); // clamped
	});

	it('toggleExpand adds/removes from expandedSet', () => {
		const {result} = renderHook(() => useFocusableList(ids));
		act(() => result.current.toggleExpand('E2'));
		expect(result.current.expandedSet.has('E2')).toBe(true);
		act(() => result.current.toggleExpand('E2'));
		expect(result.current.expandedSet.has('E2')).toBe(false);
	});

	it('toggleFocused toggles the currently focused item', () => {
		const {result} = renderHook(() => useFocusableList(ids));
		act(() => result.current.toggleFocused());
		expect(result.current.expandedSet.has('E1')).toBe(true);
	});

	it('expandById expands a specific event and moves cursor to it', () => {
		const {result} = renderHook(() => useFocusableList(ids));
		act(() => result.current.expandById('E3'));
		expect(result.current.cursor).toBe(2);
		expect(result.current.expandedSet.has('E3')).toBe(true);
	});

	it('moveDown on empty list keeps cursor at 0', () => {
		const {result} = renderHook(() => useFocusableList([]));
		act(() => result.current.moveDown());
		expect(result.current.cursor).toBe(0);
		expect(result.current.focusedId).toBeUndefined();
	});

	it('clamps cursor when focusableIds shrinks', () => {
		const {result, rerender} = renderHook(({ids}) => useFocusableList(ids), {
			initialProps: {ids: ['E1', 'E2', 'E3']},
		});
		act(() => result.current.moveDown());
		act(() => result.current.moveDown());
		expect(result.current.cursor).toBe(2);
		rerender({ids: ['E1']});
		expect(result.current.cursor).toBe(0);
	});
});
