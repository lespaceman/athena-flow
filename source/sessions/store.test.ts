import {describe, it, expect, afterEach} from 'vitest';
import {createSessionStore} from './store.js';
import type {RuntimeEvent} from '../runtime/types.js';
import type {FeedEvent} from '../feed/types.js';

// Helper: minimal RuntimeEvent
function makeRuntimeEvent(overrides: Partial<RuntimeEvent> = {}): RuntimeEvent {
	return {
		id: 'rt-1',
		timestamp: Date.now(),
		hookName: 'PreToolUse',
		sessionId: 'claude-session-1',
		context: {cwd: '/tmp', transcriptPath: '/tmp/t.jsonl'},
		interaction: {expectsDecision: false},
		payload: {tool_name: 'Bash'},
		...overrides,
	};
}

// Helper: minimal FeedEvent
function makeFeedEvent(overrides: Partial<FeedEvent> = {}): FeedEvent {
	return {
		event_id: 'run1:E1',
		seq: 1,
		ts: Date.now(),
		session_id: 'claude-session-1',
		run_id: 'run1',
		kind: 'tool.pre',
		level: 'info',
		actor_id: 'agent:root',
		title: 'Bash',
		data: {},
		...overrides,
	} as unknown as FeedEvent;
}

describe('SessionStore', () => {
	let store: ReturnType<typeof createSessionStore>;

	afterEach(() => {
		store?.close();
	});

	it('records a runtime event and retrieves it', () => {
		store = createSessionStore({
			sessionId: 's1',
			projectDir: '/home/user/proj',
			dbPath: ':memory:',
		});

		const rtEvent = makeRuntimeEvent({id: 'rt-1', sessionId: 'cs-1'});
		store.recordRuntimeEvent(rtEvent);

		const restored = store.restore();
		expect(restored.session.id).toBe('s1');
		expect(restored.session.adapterSessionIds).toContain('cs-1');
	});

	it('records feed events linked to a runtime event', () => {
		store = createSessionStore({
			sessionId: 's2',
			projectDir: '/tmp',
			dbPath: ':memory:',
		});

		const rtEvent = makeRuntimeEvent({id: 'rt-2'});
		store.recordRuntimeEvent(rtEvent);

		const fe1 = makeFeedEvent({event_id: 'run1:E1', seq: 1});
		const fe2 = makeFeedEvent({event_id: 'run1:E2', seq: 2});
		store.recordFeedEvents('rt-2', [fe1, fe2]);

		const restored = store.restore();
		expect(restored.feedEvents).toHaveLength(2);
		expect(restored.feedEvents[0]!.event_id).toBe('run1:E1');
		expect(restored.feedEvents[1]!.event_id).toBe('run1:E2');
	});

	it('tracks adapter sessions from runtime events', () => {
		store = createSessionStore({
			sessionId: 's3',
			projectDir: '/tmp',
			dbPath: ':memory:',
		});

		store.recordRuntimeEvent(
			makeRuntimeEvent({id: 'rt-a', sessionId: 'adapter-1'}),
		);
		store.recordRuntimeEvent(
			makeRuntimeEvent({id: 'rt-b', sessionId: 'adapter-1'}),
		);
		store.recordRuntimeEvent(
			makeRuntimeEvent({id: 'rt-c', sessionId: 'adapter-2'}),
		);

		const restored = store.restore();
		expect(restored.session.adapterSessionIds).toEqual([
			'adapter-1',
			'adapter-2',
		]);
		expect(restored.adapterSessions).toHaveLength(2);
	});

	it('updates session updatedAt on each runtime event', () => {
		store = createSessionStore({
			sessionId: 's4',
			projectDir: '/tmp',
			dbPath: ':memory:',
		});

		const t1 = 1000;
		const t2 = 2000;
		store.recordRuntimeEvent(makeRuntimeEvent({id: 'r1', timestamp: t1}));
		store.recordRuntimeEvent(makeRuntimeEvent({id: 'r2', timestamp: t2}));

		const restored = store.restore();
		expect(restored.session.updatedAt).toBe(t2);
	});

	it('recordEvent atomically writes runtime and feed events', () => {
		store = createSessionStore({
			sessionId: 's-atomic',
			projectDir: '/tmp',
			dbPath: ':memory:',
		});

		const rtEvent = makeRuntimeEvent({id: 'rt-atomic'});
		const fe1 = makeFeedEvent({event_id: 'run1:E1', seq: 1});
		const fe2 = makeFeedEvent({event_id: 'run1:E2', seq: 2});
		store.recordEvent(rtEvent, [fe1, fe2]);

		const restored = store.restore();
		expect(restored.feedEvents).toHaveLength(2);
		expect(restored.session.adapterSessionIds).toContain('claude-session-1');
	});

	it('returns empty feedEvents when nothing recorded', () => {
		store = createSessionStore({
			sessionId: 's5',
			projectDir: '/tmp',
			dbPath: ':memory:',
		});

		const restored = store.restore();
		expect(restored.feedEvents).toEqual([]);
		expect(restored.adapterSessions).toEqual([]);
	});
});
