/**
 * `ConsoleBrokerClient` — adapter-local WS wrapper that owns one outbound
 * connection to the rich-client broker and speaks the `AthenaConsoleFrame`
 * protocol.
 *
 * Scope of this module:
 *   - open one WSS connection (single-shot in K2; reconnect lives in K7);
 *   - perform `console.hello` → `console.ready` handshake;
 *   - emit typed inbound frames to a single registered handler;
 *   - send outbound frames via `sendFrame()`;
 *   - close cleanly on `close(reason)`.
 *
 * Notes:
 *   - Pairing token travels via the `Authorization: Bearer …` header. It is
 *     never appended to the URL query string and never logged.
 *   - This client is independent from `gateway/transport/wsClient.ts`, which
 *     speaks `ControlEnvelope` for the runtime control plane.
 */

import {readFileSync} from 'node:fs';
import {WebSocket} from 'ws';
import type {
	AthenaConsoleFrame,
	AthenaConsoleHelloFrame,
	AthenaConsoleReadyFrame,
} from '../../../shared/gateway-protocol';

export type ConsoleBrokerClientLogger = (
	level: 'debug' | 'info' | 'warn' | 'error',
	message: string,
) => void;

export type ConsoleBrokerClientOptions = {
	brokerUrl: string;
	pairingToken: string;
	tlsCaPath?: string;
	log: ConsoleBrokerClientLogger;
	connectTimeoutMs?: number;
};

export type ConsoleHelloPayload = {
	runnerId: string;
	clientName: string;
	clientVersion: string;
};

export type ConsoleBrokerClient = {
	connect(hello: ConsoleHelloPayload): Promise<void>;
	close(reason: string): void;
	sendFrame(frame: AthenaConsoleFrame): void;
	onFrame(handler: (frame: AthenaConsoleFrame) => void): void;
	onReady(handler: (address: AthenaConsoleReadyFrame['address']) => void): void;
	onClose(handler: (reason: string) => void): void;
	getReadyAddress(): AthenaConsoleReadyFrame['address'] | null;
	isReady(): boolean;
};

const DEFAULT_CONNECT_TIMEOUT_MS = 10_000;

export function createConsoleBrokerClient(
	opts: ConsoleBrokerClientOptions,
): ConsoleBrokerClient {
	let ws: WebSocket | null = null;
	let ready: AthenaConsoleReadyFrame | null = null;
	const frameHandlers = new Set<(frame: AthenaConsoleFrame) => void>();
	const closeHandlers = new Set<(reason: string) => void>();
	const readyHandlers = new Set<
		(address: AthenaConsoleReadyFrame['address']) => void
	>();
	const tokenRedacted = '<redacted>';

	function redact(message: string): string {
		return message.split(opts.pairingToken).join(tokenRedacted);
	}

	function emitClose(reason: string): void {
		for (const h of [...closeHandlers]) {
			try {
				h(reason);
			} catch {
				// listener errors must not break shutdown
			}
		}
	}

	async function connect(hello: ConsoleHelloPayload): Promise<void> {
		if (ws) throw new Error('console broker client already connected');
		const timeoutMs = opts.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
		const headers = {Authorization: `Bearer ${opts.pairingToken}`};
		const wsOpts = opts.tlsCaPath
			? {headers, ca: readFileSync(opts.tlsCaPath)}
			: {headers};
		ws = new WebSocket(opts.brokerUrl, wsOpts);

		try {
			await new Promise<void>((resolve, reject) => {
				let settled = false;
				const finishOk = (): void => {
					if (settled) return;
					settled = true;
					clearTimeout(timer);
					resolve();
				};
				const finishErr = (err: Error): void => {
					if (settled) return;
					settled = true;
					clearTimeout(timer);
					reject(err);
				};
				// Single timer covers both `open` and `ready` — a broker that accepts
				// the socket but never replies must still surface as a timeout.
				const timer = setTimeout(() => {
					finishErr(
						new Error(`console broker connect timed out after ${timeoutMs}ms`),
					);
				}, timeoutMs);

				ws!.once('open', () => {
					try {
						const helloFrame: AthenaConsoleHelloFrame = {
							kind: 'console.hello',
							frameId: makeFrameId(),
							sentAt: Date.now(),
							protocolVersion: 1,
							clientName: hello.clientName,
							clientVersion: hello.clientVersion,
						};
						ws!.send(JSON.stringify(helloFrame));
					} catch (err) {
						finishErr(err instanceof Error ? err : new Error(String(err)));
					}
				});

				ws!.once('error', err => {
					finishErr(
						new Error(`console broker connect failed: ${redact(err.message)}`),
					);
				});

				ws!.once('close', (code, reasonBuf) => {
					if (!ready) {
						const reason = reasonBuf.toString();
						finishErr(
							new Error(
								`console broker closed before ready (code=${code}${reason ? ` reason=${reason}` : ''})`,
							),
						);
					}
				});

				ws!.on('message', data => {
					let parsed: AthenaConsoleFrame;
					try {
						parsed = JSON.parse(String(data)) as AthenaConsoleFrame;
					} catch (err) {
						opts.log(
							'warn',
							`console broker frame parse failed: ${redact(String(err))}`,
						);
						return;
					}
					if (!ready) {
						if (parsed.kind === 'console.ready') {
							ready = parsed;
							const address = parsed.address;
							for (const h of [...readyHandlers]) {
								try {
									h(address);
								} catch {
									// ready handlers must not break the connect path
								}
							}
							finishOk();
							return;
						}
						if (parsed.kind === 'console.error') {
							finishErr(
								new Error(
									`console broker rejected hello: ${parsed.code} ${parsed.message}`,
								),
							);
							return;
						}
						opts.log(
							'warn',
							`console broker pre-ready frame ignored: ${parsed.kind}`,
						);
						return;
					}
					for (const h of [...frameHandlers]) {
						try {
							h(parsed);
						} catch (err) {
							opts.log(
								'warn',
								`console frame handler threw: ${redact(err instanceof Error ? err.message : String(err))}`,
							);
						}
					}
				});
			});
		} catch (err) {
			try {
				ws.terminate();
			} catch {
				// best-effort
			}
			ws = null;
			ready = null;
			throw err;
		}

		ws.on('close', (_code, reasonBuf) => {
			ws = null;
			ready = null;
			emitClose(reasonBuf.toString() || 'closed');
		});
	}

	function close(reason: string): void {
		if (!ws) return;
		try {
			ws.close(1000, reason);
		} catch {
			ws.terminate();
		}
		ws = null;
		ready = null;
		emitClose(reason);
	}

	function sendFrame(frame: AthenaConsoleFrame): void {
		if (!ws || ws.readyState !== WebSocket.OPEN) {
			throw new Error('console broker client not connected');
		}
		ws.send(JSON.stringify(frame));
	}

	function onFrame(handler: (frame: AthenaConsoleFrame) => void): void {
		frameHandlers.add(handler);
	}

	function onClose(handler: (reason: string) => void): void {
		closeHandlers.add(handler);
	}

	function onReady(
		handler: (address: AthenaConsoleReadyFrame['address']) => void,
	): void {
		readyHandlers.add(handler);
	}

	return {
		connect,
		close,
		sendFrame,
		onFrame,
		onReady,
		onClose,
		getReadyAddress: () => ready?.address ?? null,
		isReady: () => ready !== null,
	};
}

let frameCounter = 0;
function makeFrameId(): string {
	frameCounter = (frameCounter + 1) % 1_000_000;
	return `f${Date.now().toString(36)}-${frameCounter.toString(36)}`;
}
