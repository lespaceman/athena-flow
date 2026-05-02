import {WebSocketServer, type WebSocket} from 'ws';
import type {FramedConnection, ServerTransport} from './types';
import {isLoopbackHost} from '../paths';
import {traceGatewayFrame} from './trace';

export type LoopbackWsServerTransportOptions = {
	host: string;
	port: number;
	allowNonLoopback?: boolean;
};

export type WsEndpoint = {
	url: string;
	host: string;
	port: number;
};

export type LoopbackWsServerTransport = ServerTransport & {
	endpoint: () => WsEndpoint;
};

export function createLoopbackWsServerTransport(
	opts: LoopbackWsServerTransportOptions,
): LoopbackWsServerTransport {
	if (!opts.allowNonLoopback && !isLoopbackHost(opts.host)) {
		throw new Error(`gateway: WS transport is loopback-only in R2`);
	}

	let endpoint: WsEndpoint | null = null;
	return {
		kind: 'ws',
		endpoint: () => {
			if (!endpoint) {
				throw new Error('gateway: WS transport has not started listening');
			}
			return endpoint;
		},
		listen: onConnection =>
			new Promise((resolve, reject) => {
				const wss = new WebSocketServer({
					host: opts.host,
					port: opts.port,
				});
				const onError = (err: Error) => {
					reject(err);
				};
				wss.once('error', onError);
				wss.once('listening', () => {
					wss.off('error', onError);
					const addr = wss.address();
					if (typeof addr === 'string' || addr === null) {
						wss.close();
						reject(
							new Error('gateway: WS listener did not expose TCP address'),
						);
						return;
					}
					endpoint = {
						host: opts.host,
						port: addr.port,
						url: `ws://${opts.host}:${addr.port}`,
					};
					resolve({
						close: () =>
							new Promise<void>(closeResolve => {
								for (const client of wss.clients) {
									client.terminate();
								}
								wss.close(() => closeResolve());
							}),
					});
				});
				wss.on('connection', ws => {
					onConnection(createWsConnection(ws, `ws:${opts.host}`));
				});
			}),
	};
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
		traceGatewayFrame('ws', peer, 'in', parsed);
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
			traceGatewayFrame('ws', peer, 'out', frame);
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
