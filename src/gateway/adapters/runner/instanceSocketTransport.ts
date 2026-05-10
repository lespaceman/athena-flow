/**
 * Pure-data `RunnerTransport` that consumes any frame source matching the
 * narrow `RunnerWireSource` shape. Decouples the gateway from
 * `app/dashboard/instanceSocketClient` (which lives in the app layer); the
 * production wiring shim is in `app/dashboard/runnerTransport.ts`.
 *
 * One source feeds N RunnerAdapters via subscribe/runnerId. Frames lacking
 * `runnerId` are dropped — the supervisor only routes when the dashboard
 * advertises which runner an assignment belongs to (single-runtime fallback
 * handled by the legacy runtimeDaemon path until phase 6 deletion).
 *
 * See ADR 0001 phase 6.
 */

import type {
	RunnerInboundFrame,
	RunnerOutboundFrame,
	RunnerTransport,
} from './types';

/**
 * Wire-frame shape this transport understands. Duplicates the load-bearing
 * fields of `InstanceSocketFrame`'s job_assignment/cancel variants so the
 * gateway layer doesn't reach into app/.
 */
export type RunnerWireFrame =
	| {
			type: 'job_assignment';
			runId: string;
			runnerId?: string;
			runSpec?: unknown;
	  }
	| {type: 'cancel'; runId: string; runnerId?: string}
	| {type: string; [key: string]: unknown};

export type RunnerWireRunEvent = {
	runId: string;
	seq: number;
	ts: number;
	kind: string;
	payload?: unknown;
};

export type RunnerWireSource = {
	onFrame(handler: (frame: RunnerWireFrame) => void): void;
	onClose(handler: (reason: string) => void): void;
	sendRunEvent(event: RunnerWireRunEvent): void;
};

export type InstanceSocketRunnerTransportLog = (
	level: 'debug' | 'info' | 'warn' | 'error',
	message: string,
) => void;

export type InstanceSocketRunnerTransportOptions = {
	source: RunnerWireSource;
	log?: InstanceSocketRunnerTransportLog;
};

export function createInstanceSocketRunnerTransport(
	opts: InstanceSocketRunnerTransportOptions,
): RunnerTransport {
	const log = opts.log ?? (() => {});
	const subscribers = new Map<
		string,
		Set<(frame: RunnerInboundFrame) => void>
	>();
	let connected = true;

	function deliver(runnerId: string, frame: RunnerInboundFrame): void {
		const set = subscribers.get(runnerId);
		if (!set) return;
		for (const handler of [...set]) {
			try {
				handler(frame);
			} catch (err) {
				log(
					'warn',
					`runner transport handler threw: ${
						err instanceof Error ? err.message : String(err)
					}`,
				);
			}
		}
	}

	opts.source.onFrame((frame: RunnerWireFrame) => {
		if (frame.type === 'job_assignment') {
			const f = frame as Extract<RunnerWireFrame, {type: 'job_assignment'}>;
			if (!f.runnerId) return;
			deliver(f.runnerId, {
				type: 'job_assignment',
				runId: f.runId,
				runSpec: f.runSpec,
			});
			return;
		}
		if (frame.type === 'cancel') {
			const f = frame as Extract<RunnerWireFrame, {type: 'cancel'}>;
			if (!f.runnerId) return;
			deliver(f.runnerId, {type: 'cancel', runId: f.runId});
		}
		// All other frame types (run_event/ping/pong/attachments.changed/error/
		// assignment_accepted) are out-of-scope for the runner transport.
	});

	opts.source.onClose(() => {
		connected = false;
	});

	return {
		subscribe(runnerId, handler) {
			let set = subscribers.get(runnerId);
			if (!set) {
				set = new Set();
				subscribers.set(runnerId, set);
			}
			set.add(handler);
			return () => {
				const cur = subscribers.get(runnerId);
				if (!cur) return;
				cur.delete(handler);
				if (cur.size === 0) subscribers.delete(runnerId);
			};
		},
		send(frame: RunnerOutboundFrame) {
			opts.source.sendRunEvent({
				runId: frame.runId,
				seq: frame.seq,
				ts: frame.ts,
				kind: frame.kind,
				...(frame.payload !== undefined ? {payload: frame.payload} : {}),
			});
		},
		isReady() {
			return connected;
		},
	};
}
