/**
 * Runner channel adapter (ADR 0001 phase 6).
 *
 * One adapter per attachmentId/runnerId. Subscribes to a `RunnerTransport`
 * scoped to its runnerId and republishes dashboard `job_assignment` and
 * `cancel` frames as `NormalizedInbound`. Outbound messages carry a
 * JSON-encoded envelope on `OutboundMessage.text` that the adapter
 * translates back to the dashboard's wire frames.
 *
 * Inbound text contract:
 *
 *   {kind: 'job_assignment', runId, runSpec?}
 *   {kind: 'cancel', runId}
 *
 * Outbound text contract (one shape, mirrors the wire `run_event` frame):
 *
 *   {kind: 'run_event', runId, seq, ts?, eventKind, payload?}
 *
 * `eventKind` is the dashboard-side discriminator (`progress`, `complete`,
 * `error`, …); terminal status rides this field, not a separate frame type.
 * The Registered runtime serializes/deserializes these envelopes on its end.
 * Treating run-specs as text on a chat-shaped channel is deliberate — it
 * lets the existing DispatchPipeline handle runner traffic without protocol
 * surgery.
 */

import type {
	AdapterContext,
	ChannelAdapter,
	ChannelCapabilities,
	NormalizedInbound,
	OutboundMessage,
	ProbeResult,
	SendResult,
	StopReason,
} from '../../../shared/gateway-protocol';
import type {
	RunnerInboundFrame,
	RunnerOutboundFrame,
	RunnerTransport,
	RunnerTransportSubscription,
} from './types';

export type RunnerAdapterOptions = {
	runnerId: string;
	transport: RunnerTransport;
};

const CAPABILITIES: ChannelCapabilities = {
	chat: true,
	threads: false,
	relayPermission: false,
	relayQuestion: false,
};

export function createRunnerAdapter(
	opts: RunnerAdapterOptions,
): ChannelAdapter {
	const {runnerId, transport} = opts;
	let unsubscribe: RunnerTransportSubscription | null = null;
	let ctx: AdapterContext | null = null;

	function inboundFromAssignment(
		frame: Extract<RunnerInboundFrame, {type: 'job_assignment'}>,
	): NormalizedInbound {
		return {
			location: {
				channelId: `runner:${runnerId}`,
				accountId: `runner:${runnerId}`,
			},
			sender: {id: `runner:${runnerId}`},
			text: JSON.stringify({
				kind: 'job_assignment',
				runId: frame.runId,
				...(frame.runSpec !== undefined ? {runSpec: frame.runSpec} : {}),
			}),
			receivedAt: Date.now(),
			idempotencyKey: frame.runId,
			providerMessageId: frame.runId,
		};
	}

	function inboundFromCancel(
		frame: Extract<RunnerInboundFrame, {type: 'cancel'}>,
	): NormalizedInbound {
		return {
			location: {
				channelId: `runner:${runnerId}`,
				accountId: `runner:${runnerId}`,
			},
			sender: {id: `runner:${runnerId}`},
			text: JSON.stringify({kind: 'cancel', runId: frame.runId}),
			receivedAt: Date.now(),
			idempotencyKey: `cancel:${frame.runId}`,
			providerMessageId: `cancel:${frame.runId}`,
		};
	}

	function parseOutbound(text: string): RunnerOutboundFrame {
		let env: unknown;
		try {
			env = JSON.parse(text);
		} catch (err) {
			throw new Error(
				`runner adapter: malformed outbound envelope: ${
					err instanceof Error ? err.message : String(err)
				}`,
			);
		}
		if (typeof env !== 'object' || env === null) {
			throw new Error('runner adapter: outbound envelope must be an object');
		}
		const obj = env as Record<string, unknown>;
		const kind = obj['kind'];
		const runId = obj['runId'];
		if (typeof runId !== 'string' || runId.length === 0) {
			throw new Error('runner adapter: outbound envelope missing runId');
		}
		if (kind !== 'run_event') {
			throw new Error(`runner adapter: unknown envelope kind: ${String(kind)}`);
		}
		const seq = obj['seq'];
		const eventKind = obj['eventKind'];
		const ts = obj['ts'];
		if (typeof seq !== 'number') {
			throw new Error('runner adapter: run_event envelope missing seq');
		}
		if (typeof eventKind !== 'string') {
			throw new Error('runner adapter: run_event envelope missing eventKind');
		}
		return {
			type: 'run_event',
			runId,
			seq,
			ts: typeof ts === 'number' ? ts : Date.now(),
			kind: eventKind,
			...(obj['payload'] !== undefined ? {payload: obj['payload']} : {}),
		};
	}

	return {
		id: `runner:${runnerId}`,
		capabilities: CAPABILITIES,

		async start(c: AdapterContext): Promise<void> {
			ctx = c;
			unsubscribe = transport.subscribe(runnerId, frame => {
				const emit = ctx?.emitInbound;
				if (!emit) return;
				if (frame.type === 'job_assignment') {
					emit(inboundFromAssignment(frame));
				} else {
					emit(inboundFromCancel(frame));
				}
			});
			ctx.emitHealth({at: Date.now(), transportOk: transport.isReady()});
		},

		async stop(_reason: StopReason): Promise<void> {
			if (unsubscribe) {
				unsubscribe();
				unsubscribe = null;
			}
			ctx = null;
		},

		async send(msg: OutboundMessage): Promise<SendResult> {
			if (!transport.isReady()) {
				throw new Error('runner adapter: transport not ready');
			}
			const frame = parseOutbound(msg.text);
			transport.send(frame);
			return {
				providerMessageId: msg.idempotencyKey,
				deliveredAt: Date.now(),
			};
		},

		async probe(): Promise<ProbeResult> {
			const ok = transport.isReady();
			return {
				ok,
				detail: ok ? 'transport ready' : 'transport not ready',
				checkedAt: Date.now(),
			};
		},
	};
}
