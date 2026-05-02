/**
 * UDS NDJSON server for the gateway control plane.
 *
 * Wire protocol (one JSON object per line, terminated by `\n`):
 *
 *   1. First frame from client must be:
 *        {"kind":"connect","token":"<bearer>"}
 *      The server replies with either:
 *        {"ok":true,"hello":{"daemonPid":N,"startedAt":N}}    or
 *        {"ok":false,"error":{"code":"unauthorized","message":"..."}}
 *
 *   2. Subsequent frames are `ControlEnvelope`s; each gets a
 *      `ControlResponseEnvelope` reply correlated by `request_id`. The
 *      server may also push `ControlPushEnvelope`s to the connection when
 *      the daemon has unsolicited events (e.g. `session.dispatch.turn`).
 *
 * Filesystem ACL is the primary authentication boundary (UDS path in a 0700
 * dir, socket file 0600); the token in the connect frame is a defense-in-
 * depth check against socket leaks.
 */

import type {
	ControlEnvelope,
	ControlPushEnvelope,
	ControlResponseEnvelope,
} from '../../shared/gateway-protocol';
import {timingSafeTokenEqual} from '../auth';
import {
	createUdsServerTransport,
	type UdsServerTransportOptions,
} from '../transport/uds';
import type {FramedConnection, ServerTransport} from '../transport/types';

const CONNECT_TIMEOUT_MS = 2_000;

export type ConnectionContext = {
	/** Process-unique id for this connection. */
	connectionId: string;
	/** Push an unsolicited frame to the connected peer. */
	push: (envelope: ControlPushEnvelope) => void;
	/** Force-close the connection (e.g. when the runtime unregisters). */
	disconnect: () => void;
};

export type RequestHandler = (
	envelope: ControlEnvelope,
	connection: ConnectionContext,
) => Promise<ControlResponseEnvelope> | ControlResponseEnvelope;

export type ControlServerOptions = {
	socketPath: string;
	token: string;
	startedAt: number;
	handler: RequestHandler;
	/** Notified when a connection authenticates. */
	onConnect?: (ctx: ConnectionContext) => void;
	/** Notified when a connection closes (after auth or otherwise). */
	onDisconnect?: (ctx: ConnectionContext) => void;
	/** Override stderr for tests. */
	logError?: (message: string) => void;
	transport?: ServerTransport;
};

export type ControlServer = {
	close: () => Promise<void>;
};

function isStringRecord(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function nowError(
	requestId: string,
	code: string,
	message: string,
): ControlResponseEnvelope {
	return {
		request_id: requestId,
		ts: Date.now(),
		ok: false,
		error: {code, message},
	};
}

let connectionCounter = 0;
function nextConnectionId(): string {
	connectionCounter = (connectionCounter + 1) >>> 0;
	return `c${connectionCounter}-${process.pid}`;
}

export async function startControlServer(
	opts: ControlServerOptions,
): Promise<ControlServer> {
	const {socketPath, token, startedAt, handler} = opts;
	const logError =
		opts.logError ?? ((m: string) => process.stderr.write(m + '\n'));
	const transport =
		opts.transport ??
		createUdsServerTransport({
			socketPath,
			logError,
		} satisfies UdsServerTransportOptions);

	const listener = await transport.listen(connection => {
		handleConnection(
			connection,
			token,
			startedAt,
			handler,
			logError,
			opts.onConnect,
			opts.onDisconnect,
		);
	});

	return {
		close: () => listener.close(),
	};
}

function handleConnection(
	connection: FramedConnection,
	expectedToken: string,
	startedAt: number,
	handler: RequestHandler,
	logError: (m: string) => void,
	onConnect?: (ctx: ConnectionContext) => void,
	onDisconnect?: (ctx: ConnectionContext) => void,
): void {
	let authed = false;
	const connectTimer = setTimeout(() => {
		connection.close();
	}, CONNECT_TIMEOUT_MS);

	const ctx: ConnectionContext = {
		connectionId: nextConnectionId(),
		push: env => connection.send(env),
		disconnect: () => connection.close(),
	};

	connection.onFrame(parsed => {
		if (!isStringRecord(parsed)) {
			connection.close();
			return;
		}

		if (!authed) {
			if (parsed['kind'] !== 'connect') {
				connection.close();
				return;
			}
			const tok = parsed['token'];
			if (
				typeof tok !== 'string' ||
				!timingSafeTokenEqual(tok, expectedToken)
			) {
				connection.send({
					ok: false,
					error: {code: 'unauthorized', message: 'invalid token'},
				});
				connection.close();
				return;
			}
			authed = true;
			clearTimeout(connectTimer);
			connection.send({
				ok: true,
				hello: {daemonPid: process.pid, startedAt},
			});
			onConnect?.(ctx);
			return;
		}

		const requestId =
			typeof parsed['request_id'] === 'string'
				? (parsed['request_id'] as string)
				: '';
		if (
			typeof parsed['kind'] !== 'string' ||
			typeof parsed['ts'] !== 'number' ||
			!('payload' in parsed) ||
			requestId.length === 0
		) {
			connection.send(nowError(requestId, 'bad_request', 'malformed envelope'));
			return;
		}
		void Promise.resolve()
			.then(() => handler(parsed as ControlEnvelope, ctx))
			.then(res => connection.send(res))
			.catch((err: unknown) =>
				connection.send(
					nowError(
						requestId,
						'handler_error',
						err instanceof Error ? err.message : String(err),
					),
				),
			);
	});

	connection.onError(err => {
		const code = (err as NodeJS.ErrnoException).code;
		if (code !== 'EPIPE' && code !== 'ECONNRESET') {
			logError(`gateway: socket error: ${err.message}`);
		}
	});

	connection.onClose(() => {
		clearTimeout(connectTimer);
		if (authed) {
			onDisconnect?.(ctx);
		}
	});
}
