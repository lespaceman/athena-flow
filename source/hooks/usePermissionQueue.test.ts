/** @vitest-environment jsdom */
import {describe, it, expect} from 'vitest';
import {renderHook, act} from '@testing-library/react';
import {usePermissionQueue} from './usePermissionQueue.js';
import type {HookEventDisplay} from '../types/hooks/display.js';

function makeEvent(requestId: string): HookEventDisplay {
	return {
		id: `id-${requestId}`,
		requestId,
		timestamp: new Date(),
		hookName: 'PreToolUse',
		toolName: 'Bash',
		payload: {} as HookEventDisplay['payload'],
		status: 'pending',
	};
}

describe('usePermissionQueue', () => {
	it('starts with empty queue', () => {
		const {result} = renderHook(() => usePermissionQueue([]));
		expect(result.current.currentPermissionRequest).toBeNull();
		expect(result.current.permissionQueueCount).toBe(0);
	});

	it('enqueue adds to queue and currentPermissionRequest returns first match', () => {
		const events = [makeEvent('req-1'), makeEvent('req-2')];
		const {result} = renderHook(() => usePermissionQueue(events));

		act(() => result.current.enqueue('req-1'));
		act(() => result.current.enqueue('req-2'));

		expect(result.current.permissionQueueCount).toBe(2);
		expect(result.current.currentPermissionRequest?.requestId).toBe('req-1');
	});

	it('dequeue removes from queue', () => {
		const events = [makeEvent('req-1'), makeEvent('req-2')];
		const {result} = renderHook(() => usePermissionQueue(events));

		act(() => result.current.enqueue('req-1'));
		act(() => result.current.enqueue('req-2'));
		act(() => result.current.dequeue('req-1'));

		expect(result.current.permissionQueueCount).toBe(1);
		expect(result.current.currentPermissionRequest?.requestId).toBe('req-2');
	});

	it('removeAll removes specified request IDs', () => {
		const events = [makeEvent('req-1'), makeEvent('req-2'), makeEvent('req-3')];
		const {result} = renderHook(() => usePermissionQueue(events));

		act(() => result.current.enqueue('req-1'));
		act(() => result.current.enqueue('req-2'));
		act(() => result.current.enqueue('req-3'));
		act(() => result.current.removeAll(['req-1', 'req-3']));

		expect(result.current.permissionQueueCount).toBe(1);
		expect(result.current.currentPermissionRequest?.requestId).toBe('req-2');
	});
});
