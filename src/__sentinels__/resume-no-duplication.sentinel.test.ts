/**
 * ARCHITECTURAL SENTINEL
 *
 * Protects: Resume continuation must not duplicate prior feed events
 * Risk weight: 4
 *
 * If this test fails, investigate pipeline integrity before touching assertions.
 */
import {describe, it, expect, afterEach} from 'vitest';
import {createSessionStore, type SessionStore} from '../sessions/store';
import {createFeedMapper} from '../feed/mapper';
import {makeEvent, resetCounter} from './helpers';

describe('Sentinel: resume does not duplicate events', () => {
	let store: SessionStore;

	afterEach(() => {
		store?.close();
		resetCounter();
	});

	it('continuation after restore produces no duplicate feed events', () => {
		store = createSessionStore({
			sessionId: 'resume-dup-1',
			projectDir: '/tmp/proj',
			dbPath: ':memory:',
		});

		// Phase 1: Initial session with events
		const mapper1 = createFeedMapper();
		const events1 = [
			makeEvent('SessionStart'),
			makeEvent('UserPromptSubmit'),
			makeEvent('PreToolUse'),
			makeEvent('PostToolUse'),
			makeEvent('Stop'),
		];
		for (const evt of events1) {
			const feed = mapper1.mapEvent(evt);
			store.recordEvent(evt, feed);
		}

		const preRestoreCount = store.restore().feedEvents.length;

		// Phase 2: Bootstrap new mapper (simulating resume)
		const bootstrap = store.toBootstrap();
		const mapper2 = createFeedMapper(bootstrap!);

		// Phase 3: Continue with new events
		const events2 = [
			makeEvent('UserPromptSubmit'),
			makeEvent('PreToolUse'),
			makeEvent('PostToolUse'),
		];
		for (const evt of events2) {
			const feed = mapper2.mapEvent(evt);
			store.recordEvent(evt, feed);
		}

		// Phase 4: Verify no duplication
		const finalRestore = store.restore();
		const allSeqs = finalRestore.feedEvents.map(e => e.seq);

		// No duplicate seq values
		expect(new Set(allSeqs).size).toBe(allSeqs.length);

		// Event count grew (not re-emitted old events)
		expect(finalRestore.feedEvents.length).toBeGreaterThan(preRestoreCount);

		// No duplicate event_ids
		const allIds = finalRestore.feedEvents.map(e => e.event_id);
		expect(new Set(allIds).size).toBe(allIds.length);
	});
});
