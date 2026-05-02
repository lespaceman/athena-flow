/**
 * Normalized channel-event types crossing the gateway control plane.
 *
 * Adapter-side channel libraries (grammY, Slack Bolt, etc.) produce
 * provider-specific payloads; the in-daemon adapter normalizes to these
 * shapes before publishing on the control plane. This keeps router and
 * session-bridge logic transport-agnostic.
 *
 * M1 establishes the type contract; full semantics (router, persistence,
 * idempotency) are wired in M4–M5.
 */

/**
 * Stable identifier for a chat surface. Distinguishes 1:1 DMs (`peer.id`),
 * group/room chats (`room.id`), and threaded continuations (`thread.id`)
 * within either of the above. The router's SessionKey ladder consumes this
 * shape directly.
 */
export type ChannelLocation = {
	channelId: string;
	accountId: string;
	peer?: {id: string; kind: 'user'};
	room?: {id: string; kind: 'group' | 'channel'};
	thread?: {id: string};
};

export type ChannelAttachment = {
	mimeType: string;
	url?: string;
	filename?: string;
	sizeBytes?: number;
};

/**
 * Inbound chat message after adapter normalization. Idempotency key is
 * required — adapters that lack a stable provider-side identifier must
 * synthesize one (e.g. Telegram `update_id`, Slack `client_msg_id`).
 */
export type NormalizedInbound = {
	location: ChannelLocation;
	sender: {id: string; displayName?: string};
	text: string;
	attachments?: ChannelAttachment[];
	receivedAt: number;
	idempotencyKey: string;
	providerMessageId: string;
};

/**
 * Outbound message destined for a chat surface. `idempotencyKey` is mandatory
 * so retries (after socket flap, daemon restart, drain replay) don't double-
 * post. The adapter records the resulting `providerMessageId` for threading.
 */
export type OutboundMessage = {
	location: ChannelLocation;
	text: string;
	attachments?: ChannelAttachment[];
	idempotencyKey: string;
};

export type SendResult = {
	providerMessageId: string;
	deliveredAt: number;
};

export type ProbeResult = {
	ok: boolean;
	detail?: string;
	checkedAt: number;
};

export type HealthSample = {
	at: number;
	transportOk: boolean;
	lastInboundAt?: number;
	note?: string;
};

/**
 * Build a `ChannelLocation` for a 1:1 DM. Optional `threadId` covers
 * adapters that thread DMs (rare; Telegram doesn't, Slack DMs can).
 */
export function peerLocation(input: {
	channelId: string;
	accountId: string;
	peerId: string;
	threadId?: string;
}): ChannelLocation {
	return {
		channelId: input.channelId,
		accountId: input.accountId,
		peer: {id: input.peerId, kind: 'user'},
		...(input.threadId !== undefined ? {thread: {id: input.threadId}} : {}),
	};
}

/**
 * Build a `ChannelLocation` for a group/channel room. `kind` defaults to
 * `'group'`; pass `'channel'` for broadcast surfaces (Telegram channels,
 * Slack public channels with no membership cap).
 */
export function roomLocation(input: {
	channelId: string;
	accountId: string;
	roomId: string;
	kind?: 'group' | 'channel';
	threadId?: string;
}): ChannelLocation {
	return {
		channelId: input.channelId,
		accountId: input.accountId,
		room: {id: input.roomId, kind: input.kind ?? 'group'},
		...(input.threadId !== undefined ? {thread: {id: input.threadId}} : {}),
	};
}
