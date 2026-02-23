/**
 * ARCHITECTURAL SENTINEL
 *
 * Protects: Full pipeline persist→restore structural equivalence
 * Risk weight: 5
 *
 * If this test fails, investigate pipeline integrity before touching assertions.
 */
import {describe, it, expect, afterEach} from 'vitest';
import {createSessionStore, type SessionStore} from '../sessions/store.js';
import {createFeedMapper} from '../feed/mapper.js';
import type {FeedEvent} from '../feed/types.js';
import {makeEvent, makeDecision, resetCounter} from './helpers.js';

describe('Sentinel: replay equivalence', () => {
	let store: SessionStore;

	afterEach(() => {
		store?.close();
		resetCounter();
	});

	it('full canonical session survives persist → restore with structural equivalence', () => {
		store = createSessionStore({
			sessionId: 'replay-eq-1',
			projectDir: '/tmp/proj',
			dbPath: ':memory:',
		});
		const mapper = createFeedMapper();
		const allFeedEvents: FeedEvent[] = [];

		const scenario = [
			makeEvent('SessionStart'),
			makeEvent('UserPromptSubmit'),
			makeEvent('PreToolUse'),
			makeEvent('PostToolUse'),
			makeEvent('PermissionRequest'),
			makeEvent('Stop'),
			makeEvent('SessionEnd'),
		];

		for (const evt of scenario) {
			const feed = mapper.mapEvent(evt);
			store.recordEvent(evt, feed);
			allFeedEvents.push(...feed);
		}

		// Add permission decision
		const permReqEvent = scenario.find(
			e => e.hookName === 'PermissionRequest',
		)!;
		const decision = mapper.mapDecision(
			permReqEvent.id,
			makeDecision({kind: 'permission_allow'}),
		);
		if (decision) {
			store.recordFeedEvents([decision]);
			allFeedEvents.push(decision);
		}

		// Restore and compare on stable fields
		const restored = store.restore();

		// Structural equivalence: kind, seq, actor, cause, run_id
		// Intentionally excludes title — title wording may change without structural corruption
		const normalize = (events: FeedEvent[]) =>
			events
				.sort((a, b) => a.seq - b.seq)
				.map(e => ({
					kind: e.kind,
					seq: e.seq,
					actor_id: e.actor_id,
					cause: e.cause,
					run_id: e.run_id,
				}));

		expect(normalize(restored.feedEvents)).toEqual(normalize(allFeedEvents));
		expect(restored.feedEvents.length).toBe(allFeedEvents.length);

		// Separately: titles exist and are non-empty for all events
		for (const e of restored.feedEvents) {
			expect(e.title).toBeTruthy();
		}
	});

	it('restored mapper resumes seq without gaps or duplicates', () => {
		store = createSessionStore({
			sessionId: 'replay-eq-2',
			projectDir: '/tmp/proj',
			dbPath: ':memory:',
		});
		const mapper1 = createFeedMapper();

		const events = [
			makeEvent('SessionStart'),
			makeEvent('UserPromptSubmit'),
			makeEvent('PreToolUse'),
		];
		for (const evt of events) {
			store.recordEvent(evt, mapper1.mapEvent(evt));
		}

		const bootstrap = store.toBootstrap();
		expect(bootstrap).not.toBeUndefined();
		const mapper2 = createFeedMapper(bootstrap!);

		const restored = store.restore();
		const maxStoredSeq = Math.max(...restored.feedEvents.map(e => e.seq));

		const newFeed = mapper2.mapEvent(makeEvent('PostToolUse'));
		for (const fe of newFeed) {
			expect(fe.seq).toBeGreaterThan(maxStoredSeq);
		}
	});
});
