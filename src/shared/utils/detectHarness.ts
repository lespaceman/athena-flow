/**
 * Auto-detect which harness (coding assistant) athena is monitoring.
 * Falls back to Claude Code for backward compatibility.
 */
export function detectHarness(harness?: string | null): string {
	if (harness == null) return 'Claude Code';
	switch (harness) {
		case 'openai-codex':
			return 'OpenAI Codex';
		case 'opencode':
			return 'OpenCode';
		case 'claude-code':
		default:
			return 'Claude Code';
	}
}
