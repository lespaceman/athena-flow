import {useState, useEffect} from 'react';

/**
 * Hook that tracks elapsed time since a given start time.
 * Ticks every second when startTime is non-null.
 * Returns 0 when startTime is null.
 */
export function useDuration(startTime: Date | null): number {
	const [elapsed, setElapsed] = useState(0);

	useEffect(() => {
		if (!startTime) {
			setElapsed(0);
			return;
		}

		const tick = () => {
			setElapsed(Math.floor((Date.now() - startTime.getTime()) / 1000));
		};

		tick(); // Set initial value immediately
		const timer = setInterval(tick, 1000);

		return () => clearInterval(timer);
	}, [startTime]);

	return elapsed;
}
