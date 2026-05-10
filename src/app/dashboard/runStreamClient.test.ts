import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {WebSocketServer, type WebSocket as ServerWebSocket} from 'ws';
import {createRunStreamClient} from './runStreamClient';

type ServerFrame = {seq: number; ts: number; kind: string; payload?: unknown};

/**
 * A miniature dashboard-side RunStreamDO substitute. Implements the same
 * resume + ack + sequence_gap protocol the production DO uses. Each test gets
 * its own instance so we can drive disconnects and inspect what the client
 * actually delivered (and re-delivered).
 */
async function startFakeDashboard(): Promise<{
	port: number;
	stop(): Promise<void>;
	connections: Array<{
		socket: ServerWebSocket;
		received: ServerFrame[];
		closed: boolean;
	}>;
	state: {lastAckedSeq: number; terminated: boolean};
	server: WebSocketServer;
	/** Force-close the most recent server-side socket. Tests use this to
	 *  simulate a mid-run drop. */
	dropLatest(reason?: string): void;
}> {
	const wss = new WebSocketServer({port: 0, host: '127.0.0.1'});
	await new Promise<void>(resolve => wss.once('listening', () => resolve()));
	const state = {lastAckedSeq: 0, terminated: false};
	const connections: ReturnType<typeof startFakeDashboard>['connections'] = [];

	wss.on('connection', socket => {
		const conn = {socket, received: [] as ServerFrame[], closed: false};
		connections.push(conn);
		// Send `resume` immediately so the client unblocks.
		socket.send(
			JSON.stringify({
				type: 'resume',
				lastAckedSeq: state.lastAckedSeq,
				terminated: state.terminated,
			}),
		);
		if (state.terminated) {
			socket.close(1000, 'run_terminated');
			return;
		}
		socket.on('message', raw => {
			let parsed: unknown;
			try {
				parsed = JSON.parse(String(raw));
			} catch {
				return;
			}
			const frame = parsed as
				| ServerFrame
				| {type: 'ping'; ts?: number}
				| {type?: string};
			if ((frame as {type?: string}).type === 'ping') {
				socket.send(
					JSON.stringify({type: 'pong', ts: (frame as {ts?: number}).ts ?? 0}),
				);
				return;
			}
			const f = frame as ServerFrame;
			if (typeof f.seq !== 'number') return;
			if (f.seq <= state.lastAckedSeq) {
				// Duplicate replay — re-ack.
				socket.send(JSON.stringify({type: 'ack', seq: f.seq}));
				return;
			}
			if (f.seq !== state.lastAckedSeq + 1) {
				socket.send(
					JSON.stringify({
						type: 'error',
						code: 'sequence_gap',
						expected: state.lastAckedSeq + 1,
						message: `expected seq ${state.lastAckedSeq + 1}`,
					}),
				);
				return;
			}
			conn.received.push(f);
			state.lastAckedSeq = f.seq;
			socket.send(JSON.stringify({type: 'ack', seq: f.seq}));
			if (f.kind === 'completion' || f.kind === 'error') {
				state.terminated = true;
				socket.close(1000, 'run_terminated');
			}
		});
		socket.on('close', () => {
			conn.closed = true;
		});
	});

	const addr = wss.address();
	if (typeof addr !== 'object' || addr === null) throw new Error('no addr');
	const port = addr.port;

	return {
		port,
		state,
		server: wss,
		connections,
		dropLatest(reason = 'forced_drop') {
			const last = connections[connections.length - 1];
			if (!last) return;
			try {
				last.socket.close(1011, reason);
			} catch {
				try {
					last.socket.terminate();
				} catch {
					// best-effort
				}
			}
		},
		async stop() {
			for (const c of connections) {
				try {
					c.socket.terminate();
				} catch {
					// best-effort
				}
			}
			await new Promise<void>(resolve => wss.close(() => resolve()));
		},
	};
}

describe('runStreamClient', () => {
	let dashboard: Awaited<ReturnType<typeof startFakeDashboard>>;
	const url = (p: number, runId = 'run_1', token = 'tok_1') =>
		`ws://127.0.0.1:${p}/api/runs/${runId}/stream?token=${token}`;

	beforeEach(async () => {
		dashboard = await startFakeDashboard();
	});

	afterEach(async () => {
		await dashboard.stop();
	});

	it('connects, sends sequenced frames, and closes cleanly on completion', async () => {
		const client = createRunStreamClient({
			wsUrl: url(dashboard.port),
			token: 'tok_1',
			heartbeatIntervalMs: 0,
			watchdogTimeoutMs: 0,
		});
		await client.connect();

		client.sendEvent({ts: 1, kind: 'progress', payload: {message: 'hi'}});
		client.sendEvent({ts: 2, kind: 'exec.started', payload: null});
		client.sendEvent({
			ts: 3,
			kind: 'completion',
			payload: {success: true},
		});

		await client.whenTerminated();

		expect(dashboard.state.lastAckedSeq).toBe(3);
		expect(dashboard.connections).toHaveLength(1);
		const seqs = dashboard.connections[0]!.received.map(f => f.seq);
		expect(seqs).toEqual([1, 2, 3]);
	});

	// This is the regression for the original bug. The instance-socket relay
	// silently dropped any frame that hit a closed-then-reopening WS; the new
	// per-run channel must replay unacked frames after reconnect.
	it('replays unacked frames after the WS drops mid-run', async () => {
		const client = createRunStreamClient({
			wsUrl: url(dashboard.port, 'run_drop'),
			token: 'tok_drop',
			heartbeatIntervalMs: 0,
			watchdogTimeoutMs: 0,
			reconnectDelaysMs: [10, 10, 10],
		});
		await client.connect();

		client.sendEvent({ts: 1, kind: 'progress', payload: {message: 'first'}});
		// Wait for the ack so we know seq=1 is durably persisted.
		await vi.waitFor(() => expect(dashboard.state.lastAckedSeq).toBe(1));

		// Drop the socket — anything we send next must survive.
		dashboard.dropLatest('mid_run_drop');

		// Send a burst of frames while the client is reconnecting. Without the
		// queue + replay, these would all be dropped.
		client.sendEvent({ts: 2, kind: 'exec.started', payload: null});
		client.sendEvent({ts: 3, kind: 'runtime.event', payload: {x: 1}});
		client.sendEvent({ts: 4, kind: 'runtime.event', payload: {x: 2}});
		client.sendEvent({ts: 5, kind: 'completion', payload: {success: true}});

		await client.whenTerminated();

		expect(dashboard.state.lastAckedSeq).toBe(5);
		// At least two connections (initial + reconnect after drop).
		expect(dashboard.connections.length).toBeGreaterThanOrEqual(2);
		// Across all connections, the ordered set of *received* (non-duplicate)
		// frames must be the full sequence.
		const allReceived = dashboard.connections.flatMap(c => c.received);
		const uniqueSeqs = [...new Set(allReceived.map(f => f.seq))].sort(
			(a, b) => a - b,
		);
		expect(uniqueSeqs).toEqual([1, 2, 3, 4, 5]);
	});

	it('rejects no frames when the server reports the run is already terminated on resume', async () => {
		// Pre-terminate before the client connects. RunStreamDO does this when
		// a run finalised before a late reconnect (or when the dashboard reaped
		// the run state). The client must close cleanly without trying to send.
		dashboard.state.terminated = true;
		dashboard.state.lastAckedSeq = 7;

		const client = createRunStreamClient({
			wsUrl: url(dashboard.port, 'run_already_done'),
			token: 'tok_done',
			heartbeatIntervalMs: 0,
			watchdogTimeoutMs: 0,
		});
		await client.connect();
		await client.whenTerminated();
		// No frames should reach the server: the connection received resume +
		// closed before the client got a chance to send.
		expect(dashboard.connections[0]!.received).toEqual([]);
	});
});
