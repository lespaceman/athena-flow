/**
 * Format a duration in milliseconds to a compact human string.
 * - Under 60s: `{n}s`
 * - 1–60 min: `{n}m{ss}s`
 * - Over 60 min: `{n}h{mm}m`
 */
export function formatElapsed(ms: number): string {
	const totalSeconds = Math.round(ms / 1000);
	if (totalSeconds < 60) return `${totalSeconds}s`;
	const totalMinutes = Math.floor(totalSeconds / 60);
	const secs = totalSeconds % 60;
	if (totalMinutes < 60)
		return `${totalMinutes}m${String(secs).padStart(2, '0')}s`;
	const hours = Math.floor(totalMinutes / 60);
	const mins = totalMinutes % 60;
	return `${hours}h${String(mins).padStart(2, '0')}m`;
}
