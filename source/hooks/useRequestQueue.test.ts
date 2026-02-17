/** @vitest-environment jsdom */
import {describe, it, expect} from 'vitest';
import {renderHook, act} from '@testing-library/react';
import {useRequestQueue} from './useRequestQueue.js';
import type {HookEventDisplay} from '../types/hooks/display.js';

function makeEvent(requestId: string): HookEventDisplay {
	return {
		id: requestId,
		timestamp: new Date(),
		hookName: 'PreToolUse',
		toolName: 'Bash',
		payload: {} as HookEventDisplay['payload'],
		status: 'pending',
	};
}

describe('useRequestQueue', () => {
	it('starts with empty queue', () => {
		const {result} = renderHook(() => useRequestQueue([]));
		expect(result.current.current).toBeNull();
		expect(result.current.count).toBe(0);
	});

	it('enqueue adds to queue and current returns first match', () => {
		const events = [makeEvent('req-1'), makeEvent('req-2')];
		const {result} = renderHook(() => useRequestQueue(events));

		act(() => result.current.enqueue('req-1'));
		act(() => result.current.enqueue('req-2'));

		expect(result.current.count).toBe(2);
		expect(result.current.current?.id).toBe('req-1');
	});

	it('dequeue removes from queue', () => {
		const events = [makeEvent('req-1'), makeEvent('req-2')];
		const {result} = renderHook(() => useRequestQueue(events));

		act(() => result.current.enqueue('req-1'));
		act(() => result.current.enqueue('req-2'));
		act(() => result.current.dequeue('req-1'));

		expect(result.current.count).toBe(1);
		expect(result.current.current?.id).toBe('req-2');
	});

	it('removeAll removes specified request IDs', () => {
		const events = [makeEvent('req-1'), makeEvent('req-2'), makeEvent('req-3')];
		const {result} = renderHook(() => useRequestQueue(events));

		act(() => result.current.enqueue('req-1'));
		act(() => result.current.enqueue('req-2'));
		act(() => result.current.enqueue('req-3'));
		act(() => result.current.removeAll(['req-1', 'req-3']));

		expect(result.current.count).toBe(1);
		expect(result.current.current?.id).toBe('req-2');
	});
});
