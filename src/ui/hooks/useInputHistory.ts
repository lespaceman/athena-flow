import {useCallback, useRef} from 'react';
import {loadHistory, saveHistory} from '../../utils/historyStore';

const MAX_HISTORY = 200;

export type InputHistory = {
	push: (value: string) => void;
	back: (currentValue: string) => string | undefined;
	forward: () => string | undefined;
};

/**
 * Shell-like input history with up/down arrow navigation.
 *
 * Uses refs so history mutations don't trigger re-renders.
 * When projectDir is provided, history is loaded from and persisted to disk.
 */
export function useInputHistory(projectDir?: string): InputHistory {
	const projectDirRef = useRef(projectDir);
	projectDirRef.current = projectDir;

	// Lazy init — loadHistory runs only on first render
	const historyRef = useRef<string[] | null>(null);
	if (historyRef.current === null) {
		historyRef.current = projectDir ? loadHistory(projectDir) : [];
	}

	const cursorRef = useRef(-1); // -1 = not navigating (at draft position)
	const draftRef = useRef('');

	const push = useCallback((value: string): void => {
		const h = historyRef.current!;

		if (h.length > 0 && h[h.length - 1] === value) return;

		h.push(value);
		if (h.length > MAX_HISTORY) {
			historyRef.current = h.slice(-MAX_HISTORY);
		}

		cursorRef.current = -1;
		draftRef.current = '';

		if (projectDirRef.current) {
			void saveHistory(projectDirRef.current, historyRef.current!);
		}
	}, []);

	const back = useCallback((currentValue: string): string | undefined => {
		const h = historyRef.current!;
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
		const h = historyRef.current!;
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
