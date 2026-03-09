import type {AthenaHarness} from '../../infra/plugins/config';
import type {RuntimeStartupError} from '../../core/runtime/types';
import type {HarnessProcessFailureCode} from '../../core/runtime/process';

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

export type StartupTimeoutFailure = {
	message: string;
	failureCode?: HarnessProcessFailureCode;
};

export function deriveStartupTimeoutFailure(args: {
	runtimeError: RuntimeStartupError | null;
	isServerRunning: boolean;
	isHarnessRunning: boolean;
	harnessLabel: string;
}): StartupTimeoutFailure | null {
	if (args.runtimeError) {
		return {
			message: args.runtimeError.message,
			failureCode:
				args.runtimeError.code === 'socket_path_too_long'
					? 'socket_path_too_long'
					: 'hook_server_unavailable',
		};
	}

	if (!args.isServerRunning) {
		return {
			message:
				'Athena hook server is not running. Check socket path length and restart from the real project path.',
			failureCode: 'hook_server_unavailable',
		};
	}

	// No hook events within the handshake window is not, by itself, evidence of
	// broken forwarding if the Claude process is still alive. Some prompts simply
	// take longer to emit the first hook event.
	if (args.isHarnessRunning) {
		return null;
	}

	return {
		message: `${args.harnessLabel} exited before Athena received startup events. Check ${args.harnessLabel} installation and hook configuration.`,
		failureCode: 'hook_handshake_timeout',
	};
}
