import {describe, expect, it} from 'vitest';
import {
	createPendingStartupDiagnosticsEvent,
	shouldDismissPendingStartupDiagnostics,
	shouldTrackStartupDiagnostics,
} from './startupDiagnostics';

describe('startupDiagnostics', () => {
	it('only tracks startup diagnostics for the Claude harness', () => {
		expect(shouldTrackStartupDiagnostics('claude-code')).toBe(true);
		expect(shouldTrackStartupDiagnostics('openai-codex')).toBe(false);
	});

	it('keeps the prompt visible through its own failure notification', () => {
		const event = createPendingStartupDiagnosticsEvent({
			failureStage: 'startup_timeout',
			message: 'Athena hook server is not running.',
			feedEventCount: 12,
		});

		expect(shouldDismissPendingStartupDiagnostics(event, 12)).toBe(false);
		expect(shouldDismissPendingStartupDiagnostics(event, 13)).toBe(false);
		expect(shouldDismissPendingStartupDiagnostics(event, 14)).toBe(true);
	});
});
