/**
 * Gateway control-plane envelope.
 *
 * Wire format: NDJSON (one JSON object per line, terminated by \n).
 * Mirrors the request/response envelope used by the Claude hook-forwarder
 * (`src/harnesses/claude/protocol/envelope.ts`) but generalized so the
 * gateway daemon and any in-process Athena clients can speak the same
 * structural protocol regardless of which control message they carry.
 *
 * `request_id` correlates a request with its response. `kind` selects the
 * concrete payload shape — see `./control.ts` for the discriminated union.
 */
export type ControlEnvelope<
	TKind extends string = string,
	TPayload = unknown,
> = {
	request_id: string;
	ts: number;
	kind: TKind;
	payload: TPayload;
};

/**
 * Response envelope sent back to the requester. Either `ok` with a payload
 * matching the inverse of the request kind, or `error` with a code+message.
 */
export type ControlResponseEnvelope<TPayload = unknown> =
	| {
			request_id: string;
			ts: number;
			ok: true;
			payload: TPayload;
	  }
	| {
			request_id: string;
			ts: number;
			ok: false;
			error: {code: string; message: string};
	  };

/**
 * One-way push from gateway → client (no response expected). Used for events
 * such as `chat.inbound` delivery, channel health changes, function-invocation
 * progress.
 */
export type ControlPushEnvelope<
	TKind extends string = string,
	TPayload = unknown,
> = {
	push_id: string;
	ts: number;
	kind: TKind;
	payload: TPayload;
};
