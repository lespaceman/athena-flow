import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {WebSocketServer, type WebSocket as ServerWebSocket} from 'ws';
import {createConsoleBrokerClient} from './client';
import type {AthenaConsoleFrame} from '../../../shared/gateway-protocol';

describe('ConsoleBrokerClient', () => {
	let server: WebSocketServer;
	let port: number;
	let serverSockets: ServerWebSocket[] = [];

	beforeEach(async () => {
		server = new WebSocketServer({port: 0, host: '127.0.0.1'});
		await new Promise<void>(resolve =>
			server.once('listening', () => resolve()),
		);
		const addr = server.address();
		if (typeof addr !== 'object' || addr === null) throw new Error('no addr');
		port = addr.port;
		serverSockets = [];
		server.on('connection', ws => {
			serverSockets.push(ws);
		});
	});

	afterEach(async () => {
		for (const ws of serverSockets) ws.terminate();
		await new Promise<void>(resolve => server.close(() => resolve()));
	});

	const url = (): string => `ws://127.0.0.1:${port}/adapter`;

	function makeClient() {
		return createConsoleBrokerClient({
			brokerUrl: url(),
			pairingToken: 'tok-abc',
			log: () => {},
		});
	}

	it('completes hello/ready handshake and surfaces ready address', async () => {
		const client = makeClient();
		const helloFrames: AthenaConsoleFrame[] = [];
		server.once('connection', ws => {
			ws.on('message', data => {
				const frame = JSON.parse(String(data)) as AthenaConsoleFrame;
				helloFrames.push(frame);
				if (frame.kind === 'console.hello') {
					const ready: AthenaConsoleFrame = {
						kind: 'console.ready',
						frameId: 'ready-1',
						sentAt: Date.now(),
						protocolVersion: 1,
						brokerName: 'fake-broker',
						address: {runnerId: 'r1'},
					};
					ws.send(JSON.stringify(ready));
				}
			});
		});

		await client.connect({
			runnerId: 'r1',
			clientName: 'athena-cli',
			clientVersion: '0.0.0-test',
		});

		expect(helloFrames).toHaveLength(1);
		expect(helloFrames[0]!.kind).toBe('console.hello');
		expect(client.getReadyAddress()?.runnerId).toBe('r1');
		client.close('done');
	});

	it('sends pairing token via Authorization header (never URL)', async () => {
		const client = makeClient();
		const headerSeen: string[] = [];
		server.once('connection', (ws, req) => {
			const auth = req.headers['authorization'];
			if (typeof auth === 'string') headerSeen.push(auth);
			ws.on('message', () => {
				ws.send(
					JSON.stringify({
						kind: 'console.ready',
						frameId: 'r',
						sentAt: 0,
						protocolVersion: 1,
						brokerName: 'b',
						address: {runnerId: 'r1'},
					}),
				);
			});
		});

		await client.connect({
			runnerId: 'r1',
			clientName: 'athena-cli',
			clientVersion: 'x',
		});
		expect(headerSeen).toEqual(['Bearer tok-abc']);
		client.close('done');
	});

	it('rejects when broker sends console.error during handshake', async () => {
		const client = makeClient();
		server.once('connection', ws => {
			ws.on('message', () => {
				ws.send(
					JSON.stringify({
						kind: 'console.error',
						frameId: 'e',
						sentAt: 0,
						code: 'unauthorized',
						message: 'bad token',
					}),
				);
			});
		});

		await expect(
			client.connect({
				runnerId: 'r1',
				clientName: 'athena-cli',
				clientVersion: 'x',
			}),
		).rejects.toThrow(/unauthorized/);
	});

	it('rejects when broker closes before sending ready', async () => {
		const client = makeClient();
		server.once('connection', ws => {
			ws.on('message', () => ws.close());
		});

		await expect(
			client.connect({
				runnerId: 'r1',
				clientName: 'athena-cli',
				clientVersion: 'x',
			}),
		).rejects.toThrow(/closed/);
	});

	it('rejects when broker accepts the socket but never sends ready', async () => {
		const client = createConsoleBrokerClient({
			brokerUrl: url(),
			pairingToken: 'tok',
			log: () => {},
			connectTimeoutMs: 80,
		});
		// Server stays connected, swallows the hello, never replies.
		server.once('connection', ws => {
			ws.on('message', () => {});
		});

		await expect(
			client.connect({
				runnerId: 'r1',
				clientName: 'athena-cli',
				clientVersion: 'x',
			}),
		).rejects.toThrow(/timed out/);
	});

	it('redacts the pairing token from thrown errors', async () => {
		const client = createConsoleBrokerClient({
			brokerUrl: 'ws://127.0.0.1:1/adapter', // unreachable
			pairingToken: 'super-secret-token',
			log: () => {},
			connectTimeoutMs: 50,
		});
		try {
			await client.connect({
				runnerId: 'r1',
				clientName: 'athena-cli',
				clientVersion: 'x',
			});
			throw new Error('expected connect to fail');
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			expect(msg).not.toContain('super-secret-token');
		}
	});

	it('emits inbound frames to the registered handler', async () => {
		const client = makeClient();
		const received: AthenaConsoleFrame[] = [];
		client.onFrame(frame => received.push(frame));
		server.once('connection', ws => {
			ws.on('message', () => {
				ws.send(
					JSON.stringify({
						kind: 'console.ready',
						frameId: 'r',
						sentAt: 0,
						protocolVersion: 1,
						brokerName: 'b',
						address: {runnerId: 'r1'},
					}),
				);
				setTimeout(() => {
					ws.send(
						JSON.stringify({
							kind: 'console.message.in',
							frameId: 'm1',
							sentAt: Date.now(),
							address: {runnerId: 'r1'},
							messageId: 'm1',
							idempotencyKey: 'console:r1:m1',
							text: 'hi',
						}),
					);
				}, 5);
			});
		});

		await client.connect({
			runnerId: 'r1',
			clientName: 'athena-cli',
			clientVersion: 'x',
		});

		await vi.waitFor(() => expect(received.length).toBeGreaterThan(0), {
			timeout: 500,
		});
		expect(received[0]!.kind).toBe('console.message.in');
		client.close('done');
	});
});
