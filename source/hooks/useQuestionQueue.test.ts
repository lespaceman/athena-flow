/** @vitest-environment jsdom */
import {describe, it, expect} from 'vitest';
import {renderHook, act} from '@testing-library/react';
import {useQuestionQueue} from './useQuestionQueue.js';
import type {HookEventDisplay} from '../types/hooks/display.js';

function makeEvent(requestId: string): HookEventDisplay {
	return {
		id: `id-${requestId}`,
		requestId,
		timestamp: new Date(),
		hookName: 'PreToolUse',
		toolName: 'AskUserQuestion',
		payload: {} as HookEventDisplay['payload'],
		status: 'pending',
	};
}

describe('useQuestionQueue', () => {
	it('starts with empty queue', () => {
		const {result} = renderHook(() => useQuestionQueue([]));
		expect(result.current.currentQuestionRequest).toBeNull();
		expect(result.current.questionQueueCount).toBe(0);
	});

	it('enqueue and dequeue work correctly', () => {
		const events = [makeEvent('req-1'), makeEvent('req-2')];
		const {result} = renderHook(() => useQuestionQueue(events));

		act(() => result.current.enqueue('req-1'));
		expect(result.current.currentQuestionRequest?.requestId).toBe('req-1');

		act(() => result.current.enqueue('req-2'));
		expect(result.current.questionQueueCount).toBe(2);

		act(() => result.current.dequeue('req-1'));
		expect(result.current.currentQuestionRequest?.requestId).toBe('req-2');
	});

	it('removeAll removes specified request IDs', () => {
		const events = [makeEvent('req-1'), makeEvent('req-2')];
		const {result} = renderHook(() => useQuestionQueue(events));

		act(() => result.current.enqueue('req-1'));
		act(() => result.current.enqueue('req-2'));
		act(() => result.current.removeAll(['req-1']));

		expect(result.current.questionQueueCount).toBe(1);
	});
});
