import {useState, useCallback} from 'react';
import type {HookEventDisplay} from '../types/hooks/display.js';

export type UseRequestQueueResult = {
	/** Current request (first in queue) */
	current: HookEventDisplay | null;
	/** Number of queued requests */
	count: number;
	/** Add a request ID to the queue */
	enqueue: (requestId: string) => void;
	/** Remove a request ID from the queue */
	dequeue: (requestId: string) => void;
	/** Remove multiple request IDs at once (e.g., on socket close) */
	removeAll: (requestIds: string[]) => void;
};

export function useRequestQueue(
	events: HookEventDisplay[],
): UseRequestQueueResult {
	const [queue, setQueue] = useState<string[]>([]);

	const enqueue = useCallback((requestId: string) => {
		setQueue(prev => [...prev, requestId]);
	}, []);

	const dequeue = useCallback((requestId: string) => {
		setQueue(prev => prev.filter(id => id !== requestId));
	}, []);

	const removeAll = useCallback((requestIds: string[]) => {
		setQueue(prev => prev.filter(id => !requestIds.includes(id)));
	}, []);

	const current =
		queue.length > 0 ? (events.find(e => e.id === queue[0]) ?? null) : null;

	return {
		current,
		count: queue.length,
		enqueue,
		dequeue,
		removeAll,
	};
}
