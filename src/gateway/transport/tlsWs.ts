import {WebSocketServer, type WebSocket} from 'ws';
import type {Server as HttpsServer} from 'node:https';
import {createServer as createHttpsServer} from 'node:https';
import {readFileSync} from 'node:fs';
import type {FramedConnection, ServerTransport} from './types';
import {isLoopbackHost, type GatewayTlsConfig} from '../paths';
import {traceGatewayFrame} from './trace';

export type WsServerTransportOptions = {
	host: string;
	port: number;
	allowNonLoopback?: boolean;
	/** Ping interval in ms (default 15000). Set <=0 to disable. */
	pingIntervalMs?: number;
	/** Terminate connections that have not ponged within this window (default 30000). */
	pongTimeoutMs?: number;
	/** Optional TLS config; when set the listener serves WSS. */
	tls?: GatewayTlsConfig;
	/** Connect attempts per source IP per minute (default 10). Set <=0 to disable. */
	rateLimitPerMin?: number;
};

export type WsEndpoint = {
	url: string;
	host: string;
	port: number;
};

export type WsServerTransport = ServerTransport & {
	endpoint: () => WsEndpoint;
};

export function createWsServerTransport(
	opts: WsServerTransportOptions,
): WsServerTransport {
	if (!opts.allowNonLoopback && !isLoopbackHost(opts.host)) {
		throw new Error(`gateway: refusing non-loopback bind without --insecure`);
	}

	let endpoint: WsEndpoint | null = null;
	const scheme = opts.tls ? 'wss' : 'ws';
	const rateLimit = createConnectRateLimiter(opts.rateLimitPerMin ?? 10);
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
				const verifyClient = (info: {
					req: {socket: {remoteAddress?: string}};
				}) => rateLimit.allow(info.req.socket.remoteAddress ?? 'unknown');
				const {wss, httpsServer} = createWss({
					host: opts.host,
					port: opts.port,
					tls: opts.tls,
					verifyClient,
				});
				const onError = (err: Error) => reject(err);
				wss.once('error', onError);
				if (httpsServer) httpsServer.once('error', onError);
				const onListening = () => {
					wss.off('error', onError);
					if (httpsServer) httpsServer.off('error', onError);
					const addr = httpsServer ? httpsServer.address() : wss.address();
					if (typeof addr === 'string' || addr === null) {
						wss.close();
						httpsServer?.close();
						reject(
							new Error('gateway: WS listener did not expose TCP address'),
						);
						return;
					}
					endpoint = {
						host: opts.host,
						port: addr.port,
						url: `${scheme}://${opts.host}:${addr.port}`,
					};
					resolve({
						close: () =>
							new Promise<void>(closeResolve => {
								for (const client of wss.clients) client.terminate();
								wss.close(() => {
									if (httpsServer) httpsServer.close(() => closeResolve());
									else closeResolve();
								});
							}),
					});
				};
				if (httpsServer) httpsServer.once('listening', onListening);
				else wss.once('listening', onListening);
				const pingIntervalMs = opts.pingIntervalMs ?? 15_000;
				const pongTimeoutMs = opts.pongTimeoutMs ?? 30_000;
				wss.on('connection', ws => {
					attachHeartbeat(ws, pingIntervalMs, pongTimeoutMs);
					onConnection(createWsConnection(ws, `${scheme}:${opts.host}`));
				});
			}),
	};
}

type TlsServerOptions = {cert: Buffer; key: Buffer};

function loadTlsOptions(tls: GatewayTlsConfig): TlsServerOptions {
	return {
		cert: readFileSync(tls.certPath),
		key: readFileSync(tls.keyPath),
	};
}

function createWss(input: {
	host: string;
	port: number;
	tls?: GatewayTlsConfig;
	verifyClient: (info: {req: {socket: {remoteAddress?: string}}}) => boolean;
}): {wss: WebSocketServer; httpsServer: HttpsServer | null} {
	if (input.tls) {
		const httpsServer = createHttpsServer(loadTlsOptions(input.tls));
		httpsServer.listen({host: input.host, port: input.port});
		return {
			wss: new WebSocketServer({
				server: httpsServer,
				verifyClient: input.verifyClient,
			}),
			httpsServer,
		};
	}
	return {
		wss: new WebSocketServer({
			host: input.host,
			port: input.port,
			verifyClient: input.verifyClient,
		}),
		httpsServer: null,
	};
}

type ConnectRateLimiter = {allow: (ip: string) => boolean};

function createConnectRateLimiter(maxPerMin: number): ConnectRateLimiter {
	if (maxPerMin <= 0) return {allow: () => true};
	const buckets = new Map<string, number[]>();
	let pruneCountdown = 256;
	const prune = (cutoff: number) => {
		for (const [ip, arr] of buckets) {
			const fresh = arr.filter(t => t > cutoff);
			if (fresh.length === 0) buckets.delete(ip);
			else if (fresh.length !== arr.length) buckets.set(ip, fresh);
		}
	};
	return {
		allow(ip) {
			const now = Date.now();
			const cutoff = now - 60_000;
			pruneCountdown -= 1;
			if (pruneCountdown <= 0) {
				prune(cutoff);
				pruneCountdown = 256;
			}
			const recent = (buckets.get(ip) ?? []).filter(t => t > cutoff);
			if (recent.length >= maxPerMin) {
				buckets.set(ip, recent);
				return false;
			}
			recent.push(now);
			buckets.set(ip, recent);
			return true;
		},
	};
}

function attachHeartbeat(
	ws: WebSocket,
	pingIntervalMs: number,
	pongTimeoutMs: number,
): void {
	if (pingIntervalMs <= 0) return;
	let pongTimer: ReturnType<typeof setTimeout> | null = null;
	const clearPongTimer = () => {
		if (pongTimer) {
			clearTimeout(pongTimer);
			pongTimer = null;
		}
	};
	ws.on('pong', clearPongTimer);
	const interval = setInterval(() => {
		if (ws.readyState !== ws.OPEN) return;
		try {
			ws.ping();
		} catch {
			return;
		}
		if (!pongTimer) {
			pongTimer = setTimeout(() => ws.terminate(), pongTimeoutMs);
		}
	}, pingIntervalMs);
	const stop = () => {
		clearInterval(interval);
		clearPongTimer();
	};
	ws.on('close', stop);
	ws.on('error', stop);
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
