import {describe, it, expect} from 'vitest';
import {createFeedMapper} from './mapper.js';
import type {StoredSession} from '../sessions/types.js';
import type {FeedEvent} from './types.js';
import type {RuntimeEvent} from '../runtime/types.js';

function makeFeedEvent(overrides: Partial<FeedEvent> = {}): FeedEvent {
	return {
		event_id: 'R1:E1',
		seq: 1,
		ts: Date.now(),
		session_id: 'cs-1',
		run_id: 'R1',
		kind: 'session.start',
		level: 'info',
		actor_id: 'system',
		title: 'Session started',
		data: {source: 'startup'},
		...overrides,
	} as unknown as FeedEvent;
}

function makeRuntimeEvent(overrides: Partial<RuntimeEvent> = {}): RuntimeEvent {
	return {
		id: 'rt-1',
		timestamp: Date.now(),
		hookName: 'PreToolUse',
		sessionId: 'cs-1',
		context: {cwd: '/tmp', transcriptPath: '/tmp/t.jsonl'},
		interaction: {expectsDecision: false},
		payload: {tool_name: 'Bash'},
		...overrides,
	};
}

describe('createFeedMapper', () => {
	it('works without stored session (default)', () => {
		const mapper = createFeedMapper();
		expect(mapper.getSession()).toBeNull();
		expect(mapper.getCurrentRun()).toBeNull();
	});

	describe('with stored session', () => {
		it('bootstraps session state from stored feed events', () => {
			const stored: StoredSession = {
				session: {
					id: 'athena-1',
					projectDir: '/tmp',
					createdAt: 1000,
					updatedAt: 2000,
					adapterSessionIds: ['cs-1'],
				},
				feedEvents: [
					makeFeedEvent({
						event_id: 'cs-1:R1:E1',
						seq: 1,
						run_id: 'cs-1:R1',
						kind: 'session.start',
						session_id: 'cs-1',
						data: {source: 'startup', model: 'opus'},
					}),
					makeFeedEvent({
						event_id: 'cs-1:R1:E2',
						seq: 2,
						run_id: 'cs-1:R1',
						kind: 'tool.pre',
						actor_id: 'agent:root',
					}),
					makeFeedEvent({
						event_id: 'cs-1:R1:E3',
						seq: 3,
						run_id: 'cs-1:R1',
						kind: 'session.end',
						data: {reason: 'completed'},
					}),
				],
				adapterSessions: [{sessionId: 'cs-1', startedAt: 1000}],
			};

			const mapper = createFeedMapper(stored);
			expect(mapper.getSession()).not.toBeNull();
			expect(mapper.getSession()!.session_id).toBe('cs-1');
		});

		it('continues run numbering from stored events', () => {
			const stored: StoredSession = {
				session: {
					id: 'a-1',
					projectDir: '/tmp',
					createdAt: 1000,
					updatedAt: 2000,
					adapterSessionIds: ['cs-1'],
				},
				feedEvents: [
					makeFeedEvent({event_id: 'cs-1:R1:E1', seq: 1, run_id: 'cs-1:R1'}),
					makeFeedEvent({event_id: 'cs-1:R1:E2', seq: 2, run_id: 'cs-1:R1'}),
					makeFeedEvent({
						event_id: 'cs-1:R1:E3',
						seq: 3,
						run_id: 'cs-1:R1',
						kind: 'session.end',
						data: {reason: 'completed'},
					}),
				],
				adapterSessions: [{sessionId: 'cs-1', startedAt: 1000}],
			};

			const mapper = createFeedMapper(stored);

			// Process a new SessionStart — runSeq should be 2 (R2), not R1
			const newEvents = mapper.mapEvent(
				makeRuntimeEvent({
					hookName: 'SessionStart',
					sessionId: 'cs-2',
					payload: {session_id: 'cs-2', source: 'resume'},
				}),
			);

			// New events should use R2 in their run_id (stored had 1 run)
			const runStartEvent = newEvents.find(e => e.kind === 'run.start');
			expect(runStartEvent).toBeDefined();
			expect(runStartEvent!.run_id).toContain('R2');
		});

		// NOTE: Subagent actor reconstruction from stored events is intentionally
		// NOT done during bootstrap. Actors are registered when SubagentStart
		// events arrive in the new adapter session.
	});
});
