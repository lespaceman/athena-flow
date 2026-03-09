import type {AthenaHarness} from '../../infra/plugins/config';

export type StartupDiagnosticsFailureStage =
	| 'spawn_error'
	| 'exit_nonzero'
	| 'startup_timeout';

export type PendingStartupDiagnosticsEvent = {
	failureStage: StartupDiagnosticsFailureStage;
	message: string;
	exitCode?: number;
	dismissAfterFeedEventCount: number;
};

export function shouldTrackStartupDiagnostics(harness: AthenaHarness): boolean {
	return harness === 'claude-code';
}

export function createPendingStartupDiagnosticsEvent(args: {
	failureStage: StartupDiagnosticsFailureStage;
	message: string;
	feedEventCount: number;
	exitCode?: number;
}): PendingStartupDiagnosticsEvent {
	return {
		failureStage: args.failureStage,
		message: args.message,
		exitCode: args.exitCode,
		// The failure notification itself adds one feed event. Only dismiss after
		// subsequent feed activity proves the user has moved on or the run recovered.
		dismissAfterFeedEventCount: args.feedEventCount + 1,
	};
}

export function shouldDismissPendingStartupDiagnostics(
	event: PendingStartupDiagnosticsEvent,
	feedEventCount: number,
): boolean {
	return feedEventCount > event.dismissAfterFeedEventCount;
}
