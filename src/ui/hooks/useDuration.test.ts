/** @vitest-environment jsdom */
import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {renderHook, act} from '@testing-library/react';
import {useDuration} from './useDuration';

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

describe('useDuration', () => {
	it('returns 0 when startTime is null', () => {
		const {result} = renderHook(() => useDuration(null));
		expect(result.current).toBe(0);
	});

	it('computes initial elapsed time from startTime', () => {
		vi.setSystemTime(new Date('2024-01-15T10:00:10Z'));
		const start = new Date('2024-01-15T10:00:00Z');

		const {result} = renderHook(() => useDuration(start));
		expect(result.current).toBe(10);
	});

	it('updates elapsed every second', () => {
		vi.setSystemTime(new Date('2024-01-15T10:00:00Z'));
		const start = new Date('2024-01-15T10:00:00Z');

		const {result} = renderHook(() => useDuration(start));
		expect(result.current).toBe(0);

		act(() => {
			vi.advanceTimersByTime(3000);
		});
		expect(result.current).toBe(3);
	});

	it('resets to 0 when startTime becomes null', () => {
		vi.setSystemTime(new Date('2024-01-15T10:00:05Z'));
		const start = new Date('2024-01-15T10:00:00Z');

		const {result, rerender} = renderHook(
			({t}: {t: Date | null}) => useDuration(t),
			{initialProps: {t: start}},
		);
		expect(result.current).toBe(5);

		rerender({t: null});
		expect(result.current).toBe(0);
	});
});
