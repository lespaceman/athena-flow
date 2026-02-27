/**
 * ARCHITECTURAL SENTINEL
 *
 * Protects: Strict seq monotonicity under rapid interleaved events + decisions
 * Risk weight: 4
 *
 * If this test fails, investigate pipeline integrity before touching assertions.
 */
import {describe, it, expect, afterEach} from 'vitest';
import {createFeedMapper} from '../core/feed/mapper';
import {createSessionStore, type SessionStore} from '../infra/sessions/store';
import type {FeedEvent} from '../core/feed/types';
import {makeEvent, makeDecision, resetCounter} from './helpers';

describe('Sentinel: burst event ordering', () => {
	let store: SessionStore;

	afterEach(() => {
		store?.close();
		resetCounter();
	});

	it('30 interleaved tool cycles with decisions preserve strict seq monotonicity', () => {
		store = createSessionStore({
			sessionId: 'burst-1',
			projectDir: '/tmp/proj',
			dbPath: ':memory:',
		});
		const mapper = createFeedMapper();
		const allFeed: FeedEvent[] = [];

		const start = makeEvent('SessionStart');
		let feed = mapper.mapEvent(start);
		store.recordEvent(start, feed);
		allFeed.push(...feed);

		const prompt = makeEvent('UserPromptSubmit');
		feed = mapper.mapEvent(prompt);
		store.recordEvent(prompt, feed);
		allFeed.push(...feed);

		for (let i = 0; i < 30; i++) {
			const pre = makeEvent('PreToolUse');
			feed = mapper.mapEvent(pre);
			store.recordEvent(pre, feed);
			allFeed.push(...feed);

			if (i % 5 === 0) {
				const perm = makeEvent('PermissionRequest');
				feed = mapper.mapEvent(perm);
				store.recordEvent(perm, feed);
				allFeed.push(...feed);

				const dec = mapper.mapDecision(
					perm.id,
					makeDecision({kind: 'permission_allow'}),
				);
				if (dec) {
					store.recordFeedEvents([dec]);
					allFeed.push(dec);
				}
			}

			const post = makeEvent('PostToolUse');
			feed = mapper.mapEvent(post);
			store.recordEvent(post, feed);
			allFeed.push(...feed);
		}

		// Strict monotonicity
		const seqs = allFeed.map(e => e.seq);
		for (let i = 1; i < seqs.length; i++) {
			expect(seqs[i]).toBeGreaterThan(seqs[i - 1]!);
		}

		// No duplicate seq
		expect(new Set(seqs).size).toBe(seqs.length);

		// Restored order matches
		const restored = store.restore();
		const restoredSeqs = restored.feedEvents.map(e => e.seq);
		for (let i = 1; i < restoredSeqs.length; i++) {
			expect(restoredSeqs[i]).toBeGreaterThan(restoredSeqs[i - 1]!);
		}
	});
});
