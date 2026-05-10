import {describe, expect, it, vi} from 'vitest';
import {
	createInstanceSocketRunnerTransport,
	type RunnerWireFrame,
	type RunnerWireRunEvent,
	type RunnerWireSource,
} from './instanceSocketTransport';
import type {RunnerInboundFrame} from './types';

type FakeClient = RunnerWireSource & {
	emit(frame: RunnerWireFrame): void;
	emitClose(reason: string): void;
	sentEvents: RunnerWireRunEvent[];
};

function fakeClient(): FakeClient {
	let frameHandler: ((frame: RunnerWireFrame) => void) | null = null;
	let closeHandler: ((reason: string) => void) | null = null;
	const sentEvents: RunnerWireRunEvent[] = [];
	const c: FakeClient = {
		onFrame(handler) {
			frameHandler = handler;
		},
		onClose(handler) {
			closeHandler = handler;
		},
		sendRunEvent(event) {
			sentEvents.push(event);
		},
		emit(frame) {
			frameHandler?.(frame);
		},
		emitClose(reason) {
			closeHandler?.(reason);
		},
		sentEvents,
	};
	return c;
}

describe('InstanceSocketRunnerTransport', () => {
	it('routes job_assignment frames to subscribers matching runnerId', () => {
		const client = fakeClient();
		const transport = createInstanceSocketRunnerTransport({source: client});
		const r1: RunnerInboundFrame[] = [];
		const r2: RunnerInboundFrame[] = [];
		transport.subscribe('r1', f => r1.push(f));
		transport.subscribe('r2', f => r2.push(f));
		client.emit({type: 'job_assignment', runId: 'run_a', runnerId: 'r1'});
		client.emit({type: 'job_assignment', runId: 'run_b', runnerId: 'r2'});
		expect(r1).toEqual([
			{type: 'job_assignment', runId: 'run_a', runSpec: undefined},
		]);
		expect(r2).toEqual([
			{type: 'job_assignment', runId: 'run_b', runSpec: undefined},
		]);
	});

	it('passes runSpec through when present on the wire frame', () => {
		const client = fakeClient();
		const transport = createInstanceSocketRunnerTransport({source: client});
		const seen: RunnerInboundFrame[] = [];
		transport.subscribe('r1', f => seen.push(f));
		client.emit({
			type: 'job_assignment',
			runId: 'run_a',
			runnerId: 'r1',
			runSpec: {goal: 'x'},
		});
		expect(seen).toEqual([
			{type: 'job_assignment', runId: 'run_a', runSpec: {goal: 'x'}},
		]);
	});

	it('routes cancel frames the same way as job_assignment', () => {
		const client = fakeClient();
		const transport = createInstanceSocketRunnerTransport({source: client});
		const seen: RunnerInboundFrame[] = [];
		transport.subscribe('r1', f => seen.push(f));
		client.emit({type: 'cancel', runId: 'run_a', runnerId: 'r1'});
		expect(seen).toEqual([{type: 'cancel', runId: 'run_a'}]);
	});

	it('frames without a runnerId fan out to no subscribers (legacy semantics handled elsewhere)', () => {
		const client = fakeClient();
		const transport = createInstanceSocketRunnerTransport({source: client});
		const seen: RunnerInboundFrame[] = [];
		transport.subscribe('r1', f => seen.push(f));
		client.emit({type: 'job_assignment', runId: 'run_a'});
		expect(seen).toEqual([]);
	});

	it('ignores non-runner frames (ping/pong/attachments.changed/error/run_event)', () => {
		const client = fakeClient();
		const transport = createInstanceSocketRunnerTransport({source: client});
		const seen: RunnerInboundFrame[] = [];
		transport.subscribe('r1', f => seen.push(f));
		client.emit({type: 'ping', ts: 1});
		client.emit({type: 'pong', ts: 1});
		client.emit({type: 'attachments.changed', attachments: []});
		client.emit({type: 'error', code: 'boom'});
		client.emit({
			type: 'run_event',
			runId: 'run_a',
			seq: 1,
			ts: 1,
			kind: 'progress',
		});
		expect(seen).toEqual([]);
	});

	it('unsubscribe stops further deliveries to that handler', () => {
		const client = fakeClient();
		const transport = createInstanceSocketRunnerTransport({source: client});
		const seen: RunnerInboundFrame[] = [];
		const off = transport.subscribe('r1', f => seen.push(f));
		client.emit({type: 'job_assignment', runId: 'run_a', runnerId: 'r1'});
		off();
		client.emit({type: 'job_assignment', runId: 'run_b', runnerId: 'r1'});
		expect(seen).toHaveLength(1);
	});

	it('supports multiple subscribers for the same runnerId (each receives every frame)', () => {
		const client = fakeClient();
		const transport = createInstanceSocketRunnerTransport({source: client});
		const a: RunnerInboundFrame[] = [];
		const b: RunnerInboundFrame[] = [];
		transport.subscribe('r1', f => a.push(f));
		transport.subscribe('r1', f => b.push(f));
		client.emit({type: 'job_assignment', runId: 'run_a', runnerId: 'r1'});
		expect(a).toHaveLength(1);
		expect(b).toHaveLength(1);
	});

	it('send() forwards run_event frames to client.sendRunEvent', () => {
		const client = fakeClient();
		const transport = createInstanceSocketRunnerTransport({source: client});
		transport.send({
			type: 'run_event',
			runId: 'run_a',
			seq: 7,
			ts: 1700,
			kind: 'complete',
			payload: {ok: true},
		});
		expect(client.sentEvents).toEqual([
			{runId: 'run_a', seq: 7, ts: 1700, kind: 'complete', payload: {ok: true}},
		]);
	});

	it('isReady() reflects the client connection state', () => {
		const client = fakeClient();
		const transport = createInstanceSocketRunnerTransport({source: client});
		expect(transport.isReady()).toBe(true);
		client.emitClose('disconnected');
		expect(transport.isReady()).toBe(false);
	});

	it('handler exceptions do not block other subscribers', () => {
		const client = fakeClient();
		const log = vi.fn();
		const transport = createInstanceSocketRunnerTransport({
			source: client,
			log,
		});
		transport.subscribe('r1', () => {
			throw new Error('boom');
		});
		const ok: RunnerInboundFrame[] = [];
		transport.subscribe('r1', f => ok.push(f));
		client.emit({type: 'job_assignment', runId: 'run_a', runnerId: 'r1'});
		expect(ok).toHaveLength(1);
		expect(log).toHaveBeenCalledWith('warn', expect.stringContaining('boom'));
	});
});
