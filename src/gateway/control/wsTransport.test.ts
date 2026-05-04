import {afterEach, describe, expect, it, vi} from 'vitest';
import crypto from 'node:crypto';
import {createDispatcher, type DispatcherDeps} from './handlers';
import {connect, type ControlClient} from './client';
import {
	startControlServer,
	type ConnectionContext,
	type ControlServer,
} from './server';
import {SessionRegistry} from '../sessionRegistry';
import {ChannelManager} from '../channelManager';
import {Dispatcher} from '../dispatcher';
import {InboundQueue} from '../state/inboundQueue';
import {openGatewayState, type GatewayStateDb} from '../state/db';
import {RelayCoordinator} from '../relay/coordinator';
import {createWsClientTransport} from '../transport/wsClient';
import {createWsServerTransport} from '../transport/tlsWs';
import type {
	AdapterContext,
	ChannelAdapter,
	NormalizedInbound,
	OutboundMessage,
	SessionDispatchTurnPushPayload,
	StopReason,
} from '../../shared/gateway-protocol';

class FakeAdapter implements ChannelAdapter {
	readonly id = 'fake';
	readonly capabilities = {
		chat: true,
		threads: false,
		relayPermission: false,
		relayQuestion: false,
	} as const;
	private ctx: AdapterContext | null = null;
	sentMessages: OutboundMessage[] = [];

	async start(ctx: AdapterContext): Promise<void> {
		this.ctx = ctx;
	}
	async stop(_reason: StopReason): Promise<void> {
		this.ctx = null;
	}
	async send(msg: OutboundMessage) {
		this.sentMessages.push(msg);
		return {providerMessageId: 'pm1', deliveredAt: 1};
	}
	async probe() {
		return {ok: true, checkedAt: 1};
	}
	emitInbound(msg: NormalizedInbound): void {
		this.ctx?.emitInbound(msg);
	}
}

const inbound: NormalizedInbound = {
	location: {
		channelId: 'fake',
		accountId: 'a',
		peer: {id: '12345', kind: 'user'},
	},
	sender: {id: '99', displayName: 'alice'},
	text: 'hello bot',
	receivedAt: 100,
	idempotencyKey: 'fk:1',
	providerMessageId: '5',
};

describe('loopback WS control transport', () => {
	let server: ControlServer | undefined;
	let client: ControlClient | undefined;
	let db: GatewayStateDb | undefined;

	afterEach(async () => {
		client?.close();
		client = undefined;
		if (server) await server.close();
		server = undefined;
		db?.close();
		db = undefined;
	});

	it('round-trips the existing session flow over WS without wrapping envelopes', async () => {
		const token = 'test-token';
		const startedAt = Date.now();
		db = openGatewayState(':memory:');
		const channelManager = new ChannelManager();
		const adapter = new FakeAdapter();
		await channelManager.register(adapter);
		const relayCoordinator = new RelayCoordinator({
			adapters: () => channelManager.listAdapters(),
		});
		const registry = new SessionRegistry();
		const runtimeConnections = new Map<string, ConnectionContext>();
		const inboundQueue = new InboundQueue(db);
		const dispatcher = new Dispatcher({
			registry,
			pushDispatch: payload => {
				const current = registry.getCurrent();
				if (!current) return;
				runtimeConnections.get(current.runtimeId)?.push({
					push_id: crypto.randomUUID(),
					ts: Date.now(),
					kind: 'session.dispatch.turn',
					payload,
				});
			},
			sendOutbound: (channelId, msg) => channelManager.send(channelId, msg),
			inboundQueue,
		});
		channelManager.setInboundSink(message => {
			dispatcher.handleInbound(message);
		});
		const state: DispatcherDeps = {
			startedAt,
			registry,
			dispatcher,
			channelManager,
			relayCoordinator,
			registerRuntimeConnection: (runtimeId, ctx) => {
				runtimeConnections.set(runtimeId, ctx);
			},
			unregisterRuntimeConnection: runtimeId => {
				runtimeConnections.delete(runtimeId);
			},
		};
		const transport = createWsServerTransport({
			host: '127.0.0.1',
			port: 0,
		});

		server = await startControlServer({
			socketPath: 'unused-for-ws',
			token,
			startedAt,
			handler: createDispatcher(state),
			transport,
		});
		const endpoint = transport.endpoint();
		client = await connect({
			socketPath: 'unused-for-ws',
			token,
			transport: createWsClientTransport({url: endpoint.url}),
		});
		const dispatchPushed = vi.fn<(p: SessionDispatchTurnPushPayload) => void>();
		client.onPush('session.dispatch.turn', env =>
			dispatchPushed(env.payload as SessionDispatchTurnPushPayload),
		);

		await client.request('session.register', {
			runtimeId: 'r1',
			defaultAgentId: 'main',
			pid: 9999,
		});
		adapter.emitInbound(inbound);

		await waitUntil(() => dispatchPushed.mock.calls.length === 1);
		const pushed = dispatchPushed.mock.calls[0]?.[0];
		expect(pushed?.sessionKey).toBe('peer:fake:a:12345');
		expect(pushed?.agentId).toBe('main');
		const dispatchId = pushed?.dispatchId ?? '';

		const reply = await client.request<
			{
				runtimeId: string;
				dispatchId: string;
				location: typeof inbound.location;
				text: string;
				idempotencyKey: string;
			},
			{delivered: boolean; providerMessageId?: string}
		>('session.turn.complete', {
			runtimeId: 'r1',
			dispatchId,
			location: inbound.location,
			text: 'hi back',
			idempotencyKey: 'reply:1',
		});

		expect(reply).toEqual({delivered: true, providerMessageId: 'pm1'});
		expect(adapter.sentMessages[0]?.text).toBe('hi back');
	});
});

async function waitUntil(cond: () => boolean, timeoutMs = 2000): Promise<void> {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		if (cond()) return;
		await new Promise(r => setTimeout(r, 10));
	}
	throw new Error('timeout waiting for condition');
}
