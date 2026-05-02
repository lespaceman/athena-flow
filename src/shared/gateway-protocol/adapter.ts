/**
 * In-daemon `ChannelAdapter` contract — the interface every concrete
 * messaging-platform adapter implements (Telegram, Slack, …).
 *
 * Lives in `shared/` because both the gateway daemon (which hosts adapters
 * directly) and any test fixtures speak this contract; gateway/** cannot
 * import from channels/**, so the type belongs at the shared boundary.
 *
 * # Lifecycle
 *
 *   construct → start(ctx) → ... send/probe/relay ... → stop(reason)
 *
 * `start()` should be fast: spin up the long-poll/socket task, return as
 * soon as the transport is reachable. Block on full readiness only if it
 * takes <1s. `ctx.signal` aborts when the manager is winding down — adapter
 * owns its loop teardown.
 *
 * # Inbound + health emission
 *
 * The adapter receives `emitInbound` and `emitHealth` callbacks via
 * `AdapterContext`. Calling these is the *only* way inbound messages and
 * health samples reach the gateway. Emit `health` whenever transport state
 * changes (poll error, recovery), not on every successful tick.
 *
 * # Idempotency contract
 *
 *   inbound:  adapter MUST set `idempotencyKey` to a value stable across
 *             provider retries (Telegram `update_id`, Slack `client_msg_id`).
 *             The gateway's dedup window absorbs replays.
 *   outbound: adapter SHOULD honour `OutboundMessage.idempotencyKey` to
 *             avoid double-posting on retry. If the provider doesn't
 *             support idempotent send, dedup in-process for at least the
 *             retry window (default 30s).
 */

import type {
	HealthSample,
	NormalizedInbound,
	OutboundMessage,
	ProbeResult,
	SendResult,
} from './channel-events';
import type {
	PermissionRelayRequest,
	PermissionRelayResult,
	QuestionRelayRequest,
	QuestionRelayResult,
} from './relay';

export type ChannelCapabilities = {
	/** True if the adapter can deliver outbound chat messages. */
	chat: boolean;
	/** True if the adapter exposes per-thread routing (e.g. Telegram forum). */
	threads: boolean;
	/** True if the adapter implements `requestPermissionVerdict`. */
	relayPermission: boolean;
	/** True if the adapter implements `requestQuestionAnswer`. */
	relayQuestion: boolean;
	/** Maximum text bytes per outbound message; missing means adapter handles chunking. */
	maxMessageBytes?: number;
};

/**
 * Why `stop()` is being called.
 *   - `shutdown`: clean daemon stop (SIGTERM, manual stop)
 *   - `parked`:   health monitor exhausted retry budget (reserved for N4)
 *   - `error`:    adapter `start()` threw or failed registration
 */
export type StopReason = 'shutdown' | 'parked' | 'error';

export type AdapterLogger = (
	level: 'debug' | 'info' | 'warn' | 'error',
	message: string,
) => void;

export type ChannelInboundListener = (msg: NormalizedInbound) => void;
export type ChannelHealthListener = (sample: HealthSample) => void;

/**
 * Context handed to an adapter on `start()`. Carries the only handles an
 * adapter needs to do its job: a logger, a shutdown signal, and emitter
 * callbacks for the two upstream event streams.
 *
 * Emitters are wired *before* `start()` resolves, so an adapter can safely
 * emit during start (e.g. an initial health sample after the first
 * successful provider call).
 */
export type AdapterContext = {
	log: AdapterLogger;
	/** Aborted when the manager is shutting the adapter down. */
	signal: AbortSignal;
	/** Publish a normalized inbound message to the gateway router. */
	emitInbound: ChannelInboundListener;
	/** Publish a health sample to the gateway health monitor. */
	emitHealth: ChannelHealthListener;
};

export interface ChannelAdapter {
	readonly id: string;
	readonly capabilities: ChannelCapabilities;
	start(ctx: AdapterContext): Promise<void>;
	stop(reason: StopReason): Promise<void>;
	send(msg: OutboundMessage): Promise<SendResult>;
	/**
	 * Lightweight transport check (e.g. `getMe`, `auth.test`). Should return
	 * fast (< 2s); used by `athena gateway probe` and the health monitor.
	 * No side effects beyond the network call itself.
	 */
	probe(): Promise<ProbeResult>;
	/**
	 * Present iff `capabilities.relayPermission` is true. Resolves with the
	 * user's verdict, or — when `signal` aborts before a verdict arrives —
	 * with `{kind: 'cancelled'}`. Implementations are responsible for
	 * surfacing the prompt on the channel and tearing it down on abort.
	 */
	requestPermissionVerdict?(
		req: PermissionRelayRequest,
		signal: AbortSignal,
	): Promise<PermissionRelayResult>;
	/** Present iff `capabilities.relayQuestion` is true. Same shape contract. */
	requestQuestionAnswer?(
		req: QuestionRelayRequest,
		signal: AbortSignal,
	): Promise<QuestionRelayResult>;
}

/**
 * Adapter authors implement this module shape and register it in
 * `src/gateway/adapters/registry.ts`. The factory uses the registered
 * module to validate the sidecar config and construct the adapter; nothing
 * else needs to know the platform exists.
 *
 * `parseConfig` returns a typed config object on success; `create` is a
 * pure constructor — no I/O until `start()`.
 */
export interface AdapterModule<TConfig = unknown> {
	readonly name: string;
	parseConfig(input: {
		options: Record<string, unknown>;
		allowedUserIds: ReadonlyArray<string>;
	}): {ok: true; config: TConfig} | {ok: false; reason: string};
	create(config: TConfig): ChannelAdapter;
}
