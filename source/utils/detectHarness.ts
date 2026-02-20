/**
 * Auto-detect which harness (coding assistant) athena is monitoring.
 * Currently only detects Claude Code; more harnesses coming soon.
 */
export function detectHarness(): string {
	if (process.env['CLAUDE_CODE'] || process.env['CLAUDE_CODE_ENTRYPOINT']) {
		return 'Claude Code';
	}
	return 'unknown';
}
