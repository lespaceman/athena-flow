import {useState, useEffect} from 'react';

const BRAILLE_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const SPINNER_INTERVAL_MS = 200;

/**
 * Hook that returns an animated braille spinner character.
 * Cycles through frames at 200ms when active, returns '' when inactive.
 */
export function useSpinner(active: boolean): string {
	const [frameIndex, setFrameIndex] = useState(0);

	useEffect(() => {
		if (!active) {
			setFrameIndex(0);
			return;
		}

		const timer = setInterval(() => {
			setFrameIndex(i => (i + 1) % BRAILLE_FRAMES.length);
		}, SPINNER_INTERVAL_MS);

		return () => clearInterval(timer);
	}, [active]);

	if (!active) return '';
	return BRAILLE_FRAMES[frameIndex] ?? '⠋';
}
