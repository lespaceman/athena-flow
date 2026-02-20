/**
 * Auto-detect which harness (coding assistant) athena is monitoring.
 * Currently athena only supports Claude Code. More harnesses coming soon —
 * when added, this function will inspect runtime config or adapter type
 * to determine which harness is active.
 */
export function detectHarness(): string {
	return 'Claude Code';
}
