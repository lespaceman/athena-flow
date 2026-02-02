/**
 * @vitest-environment jsdom
 */
import {describe, it, expect} from 'vitest';
import {renderHook, act} from '@testing-library/react';
import {useInputHistory} from './useInputHistory.js';

describe('useInputHistory', () => {
	it('returns undefined from back() when history is empty', () => {
		const {result} = renderHook(() => useInputHistory());

		let value: string | undefined;
		act(() => {
			value = result.current.back('');
		});

		expect(value).toBeUndefined();
	});

	it('returns undefined from forward() when history is empty', () => {
		const {result} = renderHook(() => useInputHistory());

		let value: string | undefined;
		act(() => {
			value = result.current.forward();
		});

		expect(value).toBeUndefined();
	});

	it('navigates back through history', () => {
		const {result} = renderHook(() => useInputHistory());

		act(() => {
			result.current.push('first');
			result.current.push('second');
			result.current.push('third');
		});

		let value: string | undefined;
		act(() => {
			value = result.current.back('');
		});
		expect(value).toBe('third');

		act(() => {
			value = result.current.back('third');
		});
		expect(value).toBe('second');

		act(() => {
			value = result.current.back('second');
		});
		expect(value).toBe('first');
	});

	it('returns undefined when navigating past beginning of history', () => {
		const {result} = renderHook(() => useInputHistory());

		act(() => {
			result.current.push('only');
		});

		let value: string | undefined;
		act(() => {
			value = result.current.back('');
		});
		expect(value).toBe('only');

		act(() => {
			value = result.current.back('only');
		});
		expect(value).toBeUndefined();
	});

	it('navigates forward after going back', () => {
		const {result} = renderHook(() => useInputHistory());

		act(() => {
			result.current.push('first');
			result.current.push('second');
		});

		act(() => {
			result.current.back('current draft');
		});
		act(() => {
			result.current.back('second');
		});

		let value: string | undefined;
		act(() => {
			value = result.current.forward();
		});
		expect(value).toBe('second');

		act(() => {
			value = result.current.forward();
		});
		expect(value).toBe('current draft');
	});

	it('returns undefined from forward() when at end of history', () => {
		const {result} = renderHook(() => useInputHistory());

		act(() => {
			result.current.push('first');
		});

		act(() => {
			result.current.back('');
		});

		act(() => {
			result.current.forward();
		});

		let value: string | undefined;
		act(() => {
			value = result.current.forward();
		});
		expect(value).toBeUndefined();
	});

	it('preserves draft when navigating back and forward', () => {
		const {result} = renderHook(() => useInputHistory());

		act(() => {
			result.current.push('old');
		});

		// Start typing a new message, then press up
		act(() => {
			result.current.back('my draft');
		});

		// Press down to get back to draft
		let value: string | undefined;
		act(() => {
			value = result.current.forward();
		});
		expect(value).toBe('my draft');
	});

	it('skips consecutive duplicate entries', () => {
		const {result} = renderHook(() => useInputHistory());

		act(() => {
			result.current.push('same');
			result.current.push('same');
			result.current.push('same');
		});

		let value: string | undefined;
		act(() => {
			value = result.current.back('');
		});
		expect(value).toBe('same');

		// Should have no more entries
		act(() => {
			value = result.current.back('same');
		});
		expect(value).toBeUndefined();
	});

	it('resets cursor on push', () => {
		const {result} = renderHook(() => useInputHistory());

		act(() => {
			result.current.push('first');
			result.current.push('second');
		});

		// Navigate back
		act(() => {
			result.current.back('');
		});

		// Push a new entry — should reset cursor
		act(() => {
			result.current.push('third');
		});

		let value: string | undefined;
		act(() => {
			value = result.current.back('');
		});
		expect(value).toBe('third');
	});

	it('caps history at 200 entries', () => {
		const {result} = renderHook(() => useInputHistory());

		act(() => {
			for (let i = 0; i < 250; i++) {
				result.current.push(`entry-${i}`);
			}
		});

		// Navigate all the way back
		let count = 0;
		let value: string | undefined;
		act(() => {
			value = result.current.back('');
			while (value !== undefined) {
				count++;
				value = result.current.back(value);
			}
		});

		expect(count).toBe(200);
	});
});
