import {describe, expect, it} from 'vitest';
import {
	createPendingStartupDiagnosticsEvent,
	deriveStartupTimeoutFailure,
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

	it('does not treat a running Claude process with delayed hook events as startup failure', () => {
		expect(
			deriveStartupTimeoutFailure({
				runtimeError: null,
				isServerRunning: true,
				isHarnessRunning: true,
				harnessLabel: 'Claude Code',
			}),
		).toBeNull();
	});

	it('reports hook server startup errors when the runtime already knows startup failed', () => {
		expect(
			deriveStartupTimeoutFailure({
				runtimeError: {
					code: 'socket_path_too_long',
					message: 'Socket path is too long',
				},
				isServerRunning: false,
				isHarnessRunning: false,
				harnessLabel: 'Claude Code',
			}),
		).toEqual({
			message: 'Socket path is too long',
			failureCode: 'socket_path_too_long',
		});
	});
});
