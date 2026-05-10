import {describe, expect, it, vi} from 'vitest';
import type {
	AdapterContext,
	NormalizedInbound,
	OutboundMessage,
} from '../../../shared/gateway-protocol';
import {createRunnerAdapter} from './adapter';
import type {
	RunnerInboundFrame,
	RunnerOutboundFrame,
	RunnerTransport,
} from './types';

type FakeTransport = RunnerTransport & {
	subscribers: Map<string, (f: RunnerInboundFrame) => void>;
	sent: RunnerOutboundFrame[];
	ready: boolean;
};

function fakeTransport(): FakeTransport {
	const subscribers = new Map<string, (f: RunnerInboundFrame) => void>();
	const sent: RunnerOutboundFrame[] = [];
	const t: FakeTransport = {
		subscribers,
		sent,
		ready: true,
		subscribe(runnerId, handler) {
			subscribers.set(runnerId, handler);
			return () => {
				if (subscribers.get(runnerId) === handler) {
					subscribers.delete(runnerId);
				}
			};
		},
		send(frame) {
			sent.push(frame);
		},
		isReady() {
			return t.ready;
		},
	};
	return t;
}

function fakeContext(): AdapterContext & {
	inbound: NormalizedInbound[];
	healthCount: number;
} {
	const inbound: NormalizedInbound[] = [];
	let healthCount = 0;
	const controller = new AbortController();
	return Object.assign(
		{
			log: vi.fn(),
			signal: controller.signal,
			emitInbound(msg) {
				inbound.push(msg);
			},
			emitHealth() {
				healthCount += 1;
			},
		} satisfies AdapterContext,
		{
			get inbound() {
				return inbound;
			},
			get healthCount() {
				return healthCount;
			},
		},
	);
}

describe('RunnerAdapter', () => {
	it('exposes id derived from runnerId and chat-only capabilities', () => {
		const adapter = createRunnerAdapter({
			runnerId: 'r1',
			transport: fakeTransport(),
		});
		expect(adapter.id).toBe('runner:r1');
		expect(adapter.capabilities).toEqual({
			chat: true,
			threads: false,
			relayPermission: false,
			relayQuestion: false,
		});
	});

	it('start() subscribes to the transport for its runnerId', async () => {
		const transport = fakeTransport();
		const adapter = createRunnerAdapter({runnerId: 'r1', transport});
		await adapter.start(fakeContext());
		expect(transport.subscribers.has('r1')).toBe(true);
	});

	it('emits NormalizedInbound on job_assignment with runId as idempotencyKey', async () => {
		const transport = fakeTransport();
		const adapter = createRunnerAdapter({runnerId: 'r1', transport});
		const ctx = fakeContext();
		await adapter.start(ctx);
		transport.subscribers.get('r1')?.({
			type: 'job_assignment',
			runId: 'run_abc',
			runSpec: {goal: 'do thing'},
		});
		expect(ctx.inbound).toHaveLength(1);
		const msg = ctx.inbound[0]!;
		expect(msg.idempotencyKey).toBe('run_abc');
		expect(msg.providerMessageId).toBe('run_abc');
		expect(msg.location.channelId).toBe('runner:r1');
		expect(msg.location.accountId).toBe('runner:r1');
		// runSpec round-trips through text as a JSON envelope so the registered
		// runtime can parse it without protocol changes.
		const envelope = JSON.parse(msg.text);
		expect(envelope).toEqual({
			kind: 'job_assignment',
			runId: 'run_abc',
			runSpec: {goal: 'do thing'},
		});
	});

	it('emits NormalizedInbound on cancel with a control envelope', async () => {
		const transport = fakeTransport();
		const adapter = createRunnerAdapter({runnerId: 'r1', transport});
		const ctx = fakeContext();
		await adapter.start(ctx);
		transport.subscribers.get('r1')?.({type: 'cancel', runId: 'run_abc'});
		expect(ctx.inbound).toHaveLength(1);
		expect(JSON.parse(ctx.inbound[0]!.text)).toEqual({
			kind: 'cancel',
			runId: 'run_abc',
		});
		// Cancel idempotency key is distinct from the assignment so the dedup
		// window doesn't swallow it.
		expect(ctx.inbound[0]!.idempotencyKey).toBe('cancel:run_abc');
	});

	it('stop() unsubscribes from the transport', async () => {
		const transport = fakeTransport();
		const adapter = createRunnerAdapter({runnerId: 'r1', transport});
		await adapter.start(fakeContext());
		await adapter.stop('shutdown');
		expect(transport.subscribers.has('r1')).toBe(false);
	});

	it('send() translates a JSON-encoded envelope to a run_event frame', async () => {
		const transport = fakeTransport();
		const adapter = createRunnerAdapter({runnerId: 'r1', transport});
		await adapter.start(fakeContext());
		const msg: OutboundMessage = {
			location: {channelId: 'runner:r1', accountId: 'runner:r1'},
			text: JSON.stringify({
				kind: 'run_event',
				runId: 'run_abc',
				seq: 1,
				ts: 1700,
				eventKind: 'complete',
				payload: {ok: true},
			}),
			idempotencyKey: 'run_abc:1',
		};
		const result = await adapter.send(msg);
		expect(transport.sent).toEqual([
			{
				type: 'run_event',
				runId: 'run_abc',
				seq: 1,
				ts: 1700,
				kind: 'complete',
				payload: {ok: true},
			},
		]);
		expect(result.providerMessageId).toBe('run_abc:1');
	});

	it('send() rejects an envelope with an unknown kind', async () => {
		const transport = fakeTransport();
		const adapter = createRunnerAdapter({runnerId: 'r1', transport});
		await adapter.start(fakeContext());
		await expect(
			adapter.send({
				location: {channelId: 'runner:r1', accountId: 'runner:r1'},
				text: JSON.stringify({kind: 'mystery', runId: 'x'}),
				idempotencyKey: 'k',
			}),
		).rejects.toThrow(/unknown.*kind/i);
	});

	it('send() throws when called before start (no transport binding)', async () => {
		const transport = fakeTransport();
		transport.ready = false;
		const adapter = createRunnerAdapter({runnerId: 'r1', transport});
		await expect(
			adapter.send({
				location: {channelId: 'runner:r1', accountId: 'runner:r1'},
				text: JSON.stringify({
					kind: 'run_event',
					runId: 'run_abc',
					seq: 1,
					ts: 0,
					eventKind: 'complete',
				}),
				idempotencyKey: 'k',
			}),
		).rejects.toThrow(/not ready|not started/i);
	});

	it('probe() reports ok when the transport is ready', async () => {
		const transport = fakeTransport();
		const adapter = createRunnerAdapter({runnerId: 'r1', transport});
		const probe = await adapter.probe();
		expect(probe.ok).toBe(true);
	});

	it('probe() reports not-ok when the transport is unready', async () => {
		const transport = fakeTransport();
		transport.ready = false;
		const adapter = createRunnerAdapter({runnerId: 'r1', transport});
		const probe = await adapter.probe();
		expect(probe.ok).toBe(false);
	});
});
