import {WebSocket} from 'ws';
import {readFileSync} from 'node:fs';
import {
	TransportUnreachableError,
	type ClientTransport,
	type FramedConnection,
} from './types';
import {traceGatewayFrame} from './trace';

export type WsClientTransportOptions = {
	url: string;
	timeoutMs?: number;
	/** Custom CA bundle path for self-signed gateway certs. */
	tlsCaPath?: string;
};

export function createWsClientTransport(
	opts: WsClientTransportOptions,
): ClientTransport {
	return {
		kind: 'ws',
		connect: () => connectWs(opts),
	};
}

/**
 * Build a `WsClientTransportOptions`-shaped object that omits `tlsCaPath`
 * when undefined, so spreading the result doesn't write the optional key.
 */
export function wsClientOptionsForEndpoint(input: {
	url: string;
	timeoutMs?: number;
	tlsCaPath?: string;
}): WsClientTransportOptions {
	return {
		url: input.url,
		...(input.timeoutMs !== undefined ? {timeoutMs: input.timeoutMs} : {}),
		...(input.tlsCaPath !== undefined ? {tlsCaPath: input.tlsCaPath} : {}),
	};
}

async function connectWs(
	opts: WsClientTransportOptions,
): Promise<FramedConnection> {
	const timeoutMs = opts.timeoutMs ?? 5_000;
	const wsOpts = opts.tlsCaPath ? {ca: readFileSync(opts.tlsCaPath)} : {};
	const ws = new WebSocket(opts.url, wsOpts);

	await new Promise<void>((resolve, reject) => {
		const timer = setTimeout(() => {
			ws.close();
			reject(
				new TransportUnreachableError(`connect timed out after ${timeoutMs}ms`),
			);
		}, timeoutMs);
		ws.once('open', () => {
			clearTimeout(timer);
			resolve();
		});
		ws.once('error', err => {
			clearTimeout(timer);
			reject(
				new TransportUnreachableError(
					`gateway not reachable at ${opts.url}: ${err.message}`,
				),
			);
		});
	});

	return createWsConnection(ws, opts.url);
}

function createWsConnection(ws: WebSocket, peer: string): FramedConnection {
	const frameHandlers = new Set<(frame: unknown) => void>();
	const closeHandlers = new Set<() => void>();
	const errorHandlers = new Set<(err: Error) => void>();

	ws.on('message', data => {
		let parsed: unknown;
		try {
			parsed = JSON.parse(data.toString());
		} catch {
			ws.close();
			return;
		}
		traceGatewayFrame('ws-client', peer, 'in', parsed);
		for (const handler of frameHandlers) handler(parsed);
	});
	ws.on('error', err => {
		for (const handler of errorHandlers) handler(err);
	});
	ws.on('close', () => {
		for (const handler of closeHandlers) handler();
	});

	return {
		kind: 'ws',
		peer,
		send: frame => {
			if (ws.readyState !== ws.OPEN) return;
			traceGatewayFrame('ws-client', peer, 'out', frame);
			ws.send(JSON.stringify(frame));
		},
		close: () => ws.close(),
		onFrame: cb => {
			frameHandlers.add(cb);
			return () => frameHandlers.delete(cb);
		},
		onClose: cb => {
			closeHandlers.add(cb);
			return () => closeHandlers.delete(cb);
		},
		onError: cb => {
			errorHandlers.add(cb);
			return () => errorHandlers.delete(cb);
		},
	};
}
