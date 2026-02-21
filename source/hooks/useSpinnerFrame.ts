import {useState, useEffect} from 'react';

const SPINNER_INTERVAL_MS = 80;

export function useSpinnerFrame(active: boolean): number {
	const [frame, setFrame] = useState(0);

	useEffect(() => {
		if (!active) return;
		const id = setInterval(() => {
			setFrame(f => f + 1);
		}, SPINNER_INTERVAL_MS);
		return () => clearInterval(id);
	}, [active]);

	return frame;
}
