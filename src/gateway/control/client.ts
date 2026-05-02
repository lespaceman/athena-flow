/**
 * UDS NDJSON client for the gateway control plane.
 *
 * Spawns a fresh connection per request in M3 — M5+ will switch to a
 * long-lived multiplexed client when the session bridge needs persistent
 * push-event subscription. For one-shot RPCs (ping/status/probe) the
 * per-request connect is fine and avoids state-tracking complexity.
 */

import crypto from 'node:crypto';
import net from 'node:net';
import type {
	ControlEnvelope,
	ControlResponseEnvelope,
} from '../../shared/gateway-protocol';
import {encodeLine, LineReader, LineReaderOverflowError} from './lineReader';

export type ControlClientOptions = {
	socketPath: string;
	token: string;
	timeoutMs?: number;
};

export class GatewayUnreachableError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'GatewayUnreachableError';
	}
}

export class GatewayUnauthorizedError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'GatewayUnauthorizedError';
	}
}

export class GatewayProtocolError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'GatewayProtocolError';
	}
}

export type ControlClient = {
	request<TPayload, TResponse>(
		kind: string,
		payload: TPayload,
	): Promise<TResponse>;
	close: () => void;
};

/**
 * Open a control connection: connect → send `connect` frame → wait for
 * `hello` ack. Subsequent `request` calls reuse this socket.
 */
export async function connect(
	opts: ControlClientOptions,
): Promise<ControlClient> {
	const timeoutMs = opts.timeoutMs ?? 5_000;
	const socket = net.createConnection({path: opts.socketPath});

	await new Promise<void>((resolve, reject) => {
		const timer = setTimeout(() => {
			socket.destroy();
			reject(
				new GatewayUnreachableError(`connect timed out after ${timeoutMs}ms`),
			);
		}, timeoutMs);
		socket.once('connect', () => {
			clearTimeout(timer);
			resolve();
		});
		socket.once('error', err => {
			clearTimeout(timer);
			const code = (err as NodeJS.ErrnoException).code;
			if (code === 'ENOENT' || code === 'ECONNREFUSED') {
				reject(
					new GatewayUnreachableError(
						`gateway not reachable at ${opts.socketPath}: ${err.message}`,
					),
				);
			} else {
				reject(err);
			}
		});
	});

	const reader = new LineReader();
	const inbox: string[] = [];
	const waiters: Array<(line: string) => void> = [];

	socket.on('data', chunk => {
		let lines: string[];
		try {
			lines = reader.push(chunk);
		} catch (err) {
			if (err instanceof LineReaderOverflowError) {
				socket.destroy();
				return;
			}
			throw err;
		}
		for (const line of lines) {
			const w = waiters.shift();
			if (w) w(line);
			else inbox.push(line);
		}
	});

	const nextLine = (): Promise<string> => {
		const buffered = inbox.shift();
		if (buffered !== undefined) return Promise.resolve(buffered);
		return new Promise<string>(resolve => waiters.push(resolve));
	};

	// Handshake: send connect frame, await hello.
	socket.write(encodeLine({kind: 'connect', token: opts.token}));
	const helloLine = await nextLine();
	let hello: unknown;
	try {
		hello = JSON.parse(helloLine);
	} catch {
		socket.destroy();
		throw new GatewayProtocolError('invalid hello frame');
	}
	if (!isStringRecord(hello) || hello['ok'] !== true) {
		socket.destroy();
		const errPayload =
			isStringRecord(hello) && isStringRecord(hello['error'])
				? hello['error']
				: undefined;
		const code = errPayload?.['code'];
		const msg = errPayload?.['message'] ?? 'unauthorized';
		if (code === 'unauthorized') {
			throw new GatewayUnauthorizedError(String(msg));
		}
		throw new GatewayProtocolError(String(msg));
	}

	const request = async <TPayload, TResponse>(
		kind: string,
		payload: TPayload,
	): Promise<TResponse> => {
		const requestId = crypto.randomUUID();
		const envelope: ControlEnvelope<string, TPayload> = {
			request_id: requestId,
			ts: Date.now(),
			kind,
			payload,
		};
		const reqTimer = setTimeout(() => socket.destroy(), timeoutMs);
		try {
			socket.write(encodeLine(envelope));
			const line = await nextLine();
			let parsed: unknown;
			try {
				parsed = JSON.parse(line);
			} catch {
				throw new GatewayProtocolError('invalid response frame');
			}
			if (!isStringRecord(parsed)) {
				throw new GatewayProtocolError('response not an object');
			}
			const res = parsed as ControlResponseEnvelope;
			if (res.request_id !== requestId) {
				throw new GatewayProtocolError(
					`response request_id mismatch: ${res.request_id} != ${requestId}`,
				);
			}
			if (!res.ok) {
				const code = res.error.code;
				const message = res.error.message;
				throw new GatewayProtocolError(`${code}: ${message}`);
			}
			return res.payload as TResponse;
		} finally {
			clearTimeout(reqTimer);
		}
	};

	return {
		request,
		close: () => {
			socket.end();
			socket.destroy();
		},
	};
}

function isStringRecord(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null && !Array.isArray(v);
}
