/**
 * @vitest-environment jsdom
 */
import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {renderHook, act} from '@testing-library/react';
import {useSpinner} from './useSpinner.js';

const BRAILLE_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

describe('useSpinner', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('returns first frame initially when active', () => {
		const {result} = renderHook(() => useSpinner(true));
		expect(result.current).toBe(BRAILLE_FRAMES[0]);
	});

	it('cycles through braille frames at 120ms intervals', () => {
		const {result} = renderHook(() => useSpinner(true));

		expect(result.current).toBe('⠋');

		act(() => {
			vi.advanceTimersByTime(120);
		});
		expect(result.current).toBe('⠙');

		act(() => {
			vi.advanceTimersByTime(120);
		});
		expect(result.current).toBe('⠹');
	});

	it('wraps around after last frame', () => {
		const {result} = renderHook(() => useSpinner(true));

		// Advance through all 10 frames (10 * 120ms = 1200ms)
		act(() => {
			vi.advanceTimersByTime(1200);
		});
		expect(result.current).toBe('⠋'); // Back to first
	});

	it('returns empty string and does not tick when inactive', () => {
		const {result} = renderHook(() => useSpinner(false));
		expect(result.current).toBe('');

		act(() => {
			vi.advanceTimersByTime(500);
		});
		expect(result.current).toBe('');
	});

	it('stops and resets when deactivated', () => {
		const {result, rerender} = renderHook(({active}) => useSpinner(active), {
			initialProps: {active: true},
		});

		act(() => {
			vi.advanceTimersByTime(240); // Advance 2 frames
		});
		expect(result.current).toBe('⠹');

		rerender({active: false});
		expect(result.current).toBe('');
	});
});
