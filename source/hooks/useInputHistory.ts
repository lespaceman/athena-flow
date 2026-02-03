import {useCallback, useRef} from 'react';

const MAX_HISTORY = 200;

export type InputHistory = {
	push: (value: string) => void;
	back: (currentValue: string) => string | undefined;
	forward: () => string | undefined;
};

/**
 * Shell-like input history with up/down arrow navigation.
 *
 * Uses refs internally so history changes don't trigger re-renders.
 */
export function useInputHistory(): InputHistory {
	const historyRef = useRef<string[]>([]);
	// -1 means "not navigating" (at the draft position)
	const cursorRef = useRef(-1);
	const draftRef = useRef('');

	const push = useCallback((value: string): void => {
		const h = historyRef.current;
		// Skip consecutive duplicates
		if (h.length > 0 && h[h.length - 1] === value) return;
		h.push(value);
		// Cap at max
		if (h.length > MAX_HISTORY) {
			historyRef.current = h.slice(-MAX_HISTORY);
		}
		// Reset navigation state
		cursorRef.current = -1;
		draftRef.current = '';
	}, []);

	const back = useCallback((currentValue: string): string | undefined => {
		const h = historyRef.current;
		if (h.length === 0) return undefined;

		// On first back press, save the current input as draft
		if (cursorRef.current === -1) {
			draftRef.current = currentValue;
			cursorRef.current = h.length - 1;
			return h[cursorRef.current];
		}

		// Already at the beginning
		if (cursorRef.current <= 0) return undefined;

		cursorRef.current--;
		return h[cursorRef.current];
	}, []);

	const forward = useCallback((): string | undefined => {
		const h = historyRef.current;
		if (cursorRef.current === -1) return undefined;

		cursorRef.current++;

		// Past the end of history — return to draft
		if (cursorRef.current >= h.length) {
			cursorRef.current = -1;
			return draftRef.current;
		}

		return h[cursorRef.current];
	}, []);

	return {push, back, forward};
}
