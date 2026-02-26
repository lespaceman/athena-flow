import {useState, useCallback} from 'react';

type QueueableEvent = {event_id: string};

export type UseRequestQueueResult<T> = {
	current: T | null;
	count: number;
	enqueue: (requestId: string) => void;
	dequeue: (requestId: string) => void;
	removeAll: (requestIds: string[]) => void;
};

export function useRequestQueue<T extends QueueableEvent>(
	events: T[],
): UseRequestQueueResult<T> {
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
		queue.length > 0
			? (events.find(e => e.event_id === queue[0]) ?? null)
			: null;

	return {
		current,
		count: queue.length,
		enqueue,
		dequeue,
		removeAll,
	};
}
