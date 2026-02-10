import {useState, useCallback} from 'react';
import type {HookEventDisplay} from '../types/hooks/display.js';

export type UseQuestionQueueResult = {
	currentQuestionRequest: HookEventDisplay | null;
	questionQueueCount: number;
	enqueue: (requestId: string) => void;
	dequeue: (requestId: string) => void;
	removeAll: (requestIds: string[]) => void;
};

export function useQuestionQueue(
	events: HookEventDisplay[],
): UseQuestionQueueResult {
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

	const currentQuestionRequest =
		queue.length > 0
			? (events.find(e => e.requestId === queue[0]) ?? null)
			: null;

	return {
		currentQuestionRequest,
		questionQueueCount: queue.length,
		enqueue,
		dequeue,
		removeAll,
	};
}
