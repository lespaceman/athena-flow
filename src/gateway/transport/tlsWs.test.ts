import {describe, expect, it} from 'vitest';
import {WebSocket} from 'ws';
import {createWsServerTransport} from './tlsWs';

describe('createWsServerTransport heartbeat', () => {
	it('terminates a connection that stops responding to pings', async () => {
		const transport = createWsServerTransport({
			host: '127.0.0.1',
			port: 0,
			pingIntervalMs: 30,
			pongTimeoutMs: 60,
		});
		const closed: Array<() => void> = [];
		const server = await transport.listen(conn => {
			conn.onClose(() => closed.push(() => {}));
		});
		const url = transport.endpoint().url;

		// Open a raw WS but suppress pong responses so the heartbeat must trip.
		const ws = new WebSocket(url, {autoPong: false});
		await new Promise<void>(resolve => ws.once('open', () => resolve()));
		// Intentionally do nothing on ping — gateway must terminate after pongTimeoutMs.
		ws.on('ping', () => {});

		const closeWaiter = new Promise<void>(resolve => ws.once('close', resolve));
		await closeWaiter;
		// Server-side close event fires on its own ws instance; give it a tick.
		await new Promise(r => setTimeout(r, 50));
		expect(closed.length).toBeGreaterThan(0);
		await server.close();
	}, 5_000);

	it('rejects connect attempts exceeding the per-IP rate limit', async () => {
		const transport = createWsServerTransport({
			host: '127.0.0.1',
			port: 0,
			pingIntervalMs: 0,
			rateLimitPerMin: 2,
		});
		const accepted: number[] = [];
		const server = await transport.listen(() => {
			accepted.push(Date.now());
		});
		const url = transport.endpoint().url;

		const open = (): Promise<'ok' | 'rejected'> =>
			new Promise(resolve => {
				const ws = new WebSocket(url);
				ws.once('open', () => {
					ws.close();
					resolve('ok');
				});
				ws.once('error', () => resolve('rejected'));
				ws.once('unexpected-response', () => resolve('rejected'));
			});

		const a = await open();
		const b = await open();
		const c = await open();
		expect(a).toBe('ok');
		expect(b).toBe('ok');
		expect(c).toBe('rejected');
		// Give the server a tick to record both accepted connects.
		await new Promise(r => setTimeout(r, 50));
		expect(accepted.length).toBe(2);
		await server.close();
	}, 5_000);

	it('keeps a healthy connection alive across multiple ping intervals', async () => {
		const transport = createWsServerTransport({
			host: '127.0.0.1',
			port: 0,
			pingIntervalMs: 30,
			pongTimeoutMs: 1_000,
		});
		const server = await transport.listen(() => {});
		const url = transport.endpoint().url;

		const ws = new WebSocket(url);
		await new Promise<void>(resolve => ws.once('open', () => resolve()));

		// Wait through several ping intervals; the ws lib auto-replies with pong.
		await new Promise(r => setTimeout(r, 150));
		expect(ws.readyState).toBe(ws.OPEN);
		ws.close();
		await server.close();
	}, 5_000);
});
