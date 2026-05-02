/**
 * Gateway control-plane message kinds and payload shapes.
 *
 * The gateway daemon accepts these requests from in-process Athena clients
 * (interactive runtime, MCP server, hook helper) and sends pushes back. M1
 * defines only the lifecycle surface (`ping`, `status`); session/relay/chat
 * kinds are added in M3–M6, function invoke in M7.
 */

/**
 * Request kinds — sent from client to gateway. Each kind has a corresponding
 * response payload returned via `ControlResponseEnvelope`.
 */
export type ControlRequestKind = 'ping' | 'status';

export type PingRequestPayload = Record<string, never>;
export type PingResponsePayload = {
	pong: true;
	daemonPid: number;
	uptimeMs: number;
};

export type ChannelStatusEntry = {
	id: string;
	state: 'starting' | 'running' | 'degraded' | 'stopped' | 'parked';
	lastHealthAt?: number;
};

export type StatusRequestPayload = Record<string, never>;
export type StatusResponsePayload = {
	daemonPid: number;
	startedAt: number;
	uptimeMs: number;
	version: string;
	channels: ChannelStatusEntry[];
};

/**
 * Push kinds — sent from gateway to client without a request. Defined here so
 * the type list stays in one place; payload shapes for chat/relay/function
 * pushes are filled in by their respective milestones.
 */
export type ControlPushKind =
	| 'channel.health'
	| 'chat.inbound'
	| 'relay.permission.request'
	| 'relay.question.request'
	| 'function.progress';
