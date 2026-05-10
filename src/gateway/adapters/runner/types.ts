/**
 * Runner channel adapter — protocol types.
 *
 * The dashboard's instance-socket connection delivers `job_assignment` and
 * `cancel` frames per runner. The runner adapter (one per attachmentId)
 * subscribes to a transport scoped to its runnerId and republishes those
 * frames as `NormalizedInbound` on the gateway control plane. Outbound is the
 * mirror image — the adapter accepts a JSON-encoded envelope on
 * `OutboundMessage.text` and translates it to the dashboard's wire frames
 * (`job_complete`, `job_error`, `run_event`).
 *
 * `RunnerTransport` is the test seam. Production wires it to
 * `instanceSocketClient`, filtered by `runnerId`.
 *
 * See ADR 0001 phase 6.
 */

export type RunnerInboundFrame =
	| {type: 'job_assignment'; runId: string; runSpec?: unknown}
	| {type: 'cancel'; runId: string};

/**
 * The dashboard's instance-socket protocol carries all run replies as
 * `run_event` frames with a per-event `kind` discriminator (`progress`,
 * `complete`, `error`, …). Terminal status is conveyed by `kind`, not by a
 * separate frame type. Keeping the adapter envelope aligned to the wire
 * means one shape to test and no second-level translation.
 */
export type RunnerOutboundFrame = {
	type: 'run_event';
	runId: string;
	seq: number;
	ts: number;
	kind: string;
	payload?: unknown;
};

export type RunnerTransportSubscription = () => void;

export type RunnerTransport = {
	/**
	 * Subscribe to inbound frames addressed to a single runnerId. The transport
	 * is responsible for filtering — adapters never see frames for other
	 * runners. Returns an unsubscribe function.
	 */
	subscribe(
		runnerId: string,
		handler: (frame: RunnerInboundFrame) => void,
	): RunnerTransportSubscription;
	/**
	 * Send an outbound frame addressed to the dashboard. Synchronous — the
	 * transport queues the frame and the underlying socket flushes when ready.
	 */
	send(frame: RunnerOutboundFrame): void;
	/** True once the underlying connection is open and registered. */
	isReady(): boolean;
};
