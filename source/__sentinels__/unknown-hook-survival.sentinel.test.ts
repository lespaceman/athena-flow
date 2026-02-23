/**
 * ARCHITECTURAL SENTINEL
 *
 * Protects: Forward-compatible unknown hook events survive full pipeline (mapper → store → restore)
 * Risk weight: 3
 *
 * If this test fails, investigate pipeline integrity before touching assertions.
 */
import {describe, it, expect, afterEach} from 'vitest';
import {createSessionStore, type SessionStore} from '../sessions/store.js';
import {createFeedMapper} from '../feed/mapper.js';
import {makeEvent, resetCounter} from './helpers.js';

describe('Sentinel: unknown hook survives full pipeline', () => {
	let store: SessionStore;

	afterEach(() => {
		store?.close();
		resetCounter();
	});

	it('unknown hook event persists and restores with correct kind', () => {
		store = createSessionStore({
			sessionId: 'unknown-1',
			projectDir: '/tmp/proj',
			dbPath: ':memory:',
		});
		const mapper = createFeedMapper();

		const start = makeEvent('SessionStart');
		store.recordEvent(start, mapper.mapEvent(start));

		const prompt = makeEvent('UserPromptSubmit');
		store.recordEvent(prompt, mapper.mapEvent(prompt));

		// Inject unknown hook
		const unknownEvt = makeEvent('FutureHookV99', {
			payload: {some_new_field: 'value', nested: {data: true}},
		});
		const unknownFeed = mapper.mapEvent(unknownEvt);
		store.recordEvent(unknownEvt, unknownFeed);

		// Mapper produced event (not silently dropped)
		expect(unknownFeed.length).toBeGreaterThan(0);
		const unknownFeedEvent = unknownFeed.find(
			e => e.kind === 'unknown.hook',
		);
		expect(unknownFeedEvent).toBeDefined();

		// Survives persistence round-trip
		const restored = store.restore();
		const restoredUnknown = restored.feedEvents.find(
			e => e.kind === 'unknown.hook',
		);
		expect(restoredUnknown).toBeDefined();
		expect(restoredUnknown!.title).toContain('FutureHookV99');
		expect(restoredUnknown!.seq).toBe(unknownFeedEvent!.seq);
	});
});
