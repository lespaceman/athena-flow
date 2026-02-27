import {describe, it, expect, afterEach} from 'vitest';
import {createSessionStore, type SessionStore} from './store';
import {createFeedMapper} from '../../core/feed/mapper';
import type {RuntimeEvent} from '../../core/runtime/types';
import type {RuntimeDecision} from '../../core/runtime/types';
import {mapLegacyHookNameToRuntimeKind} from '../../core/runtime/events';

let seq = 0;
function makeRuntimeEvent(
	hookName: string,
	overrides: Partial<RuntimeEvent> = {},
): RuntimeEvent {
	seq++;
	const payload = {
		tool_name: 'Bash',
		tool_input: {command: 'echo hi'},
		...(hookName === 'UserPromptSubmit' ? {prompt: 'do stuff'} : {}),
		...(hookName === 'SessionStart' ? {source: 'startup'} : {}),
		...(hookName === 'Stop'
			? {stop_hook_active: true, last_assistant_message: 'done'}
			: {}),
		...(typeof overrides.payload === 'object' && overrides.payload !== null
			? (overrides.payload as Record<string, unknown>)
			: {}),
	};
	return {
		id: `rt-${seq}`,
		timestamp: Date.now() + seq,
		kind: overrides.kind ?? mapLegacyHookNameToRuntimeKind(hookName),
		data: overrides.data ?? payload,
		hookName,
		sessionId: 'claude-sess-1',
		context: {cwd: '/tmp', transcriptPath: '/tmp/t.jsonl'},
		interaction: {expectsDecision: hookName === 'PermissionRequest'},
		payload,
		...overrides,
	};
}

describe('restore integration', () => {
	let store: SessionStore;

	afterEach(() => {
		store?.close();
		seq = 0;
	});

	it('decision events survive round-trip', () => {
		store = createSessionStore({
			sessionId: 'athena-1',
			projectDir: '/tmp/proj',
			dbPath: ':memory:',
		});
		const mapper = createFeedMapper();

		// SessionStart
		const sessionStart = makeRuntimeEvent('SessionStart');
		const sessionStartFeed = mapper.mapEvent(sessionStart);
		store.recordEvent(sessionStart, sessionStartFeed);

		// UserPromptSubmit — opens a run
		const userPrompt = makeRuntimeEvent('UserPromptSubmit');
		const userPromptFeed = mapper.mapEvent(userPrompt);
		store.recordEvent(userPrompt, userPromptFeed);

		// PermissionRequest — requires a decision
		const permReq = makeRuntimeEvent('PermissionRequest');
		const permReqFeed = mapper.mapEvent(permReq);
		store.recordEvent(permReq, permReqFeed);

		// Create a permission decision via mapDecision
		const decision: RuntimeDecision = {
			type: 'json',
			source: 'user',
			intent: {kind: 'permission_allow'},
		};
		const decisionEvent = mapper.mapDecision(permReq.id, decision);
		expect(decisionEvent).not.toBeNull();
		expect(decisionEvent!.kind).toBe('permission.decision');

		// Persist the decision event (feed-only, no runtime event)
		store.recordFeedEvents([decisionEvent!]);

		// Restore and verify
		const restored = store.restore();
		const decisionEvents = restored.feedEvents.filter(
			e => e.kind === 'permission.decision',
		);
		expect(decisionEvents).toHaveLength(1);
		expect(
			(decisionEvents[0]!.data as {decision_type: string}).decision_type,
		).toBe('allow');
		expect(decisionEvents[0]!.cause?.parent_event_id).toBeDefined();
	});

	it('seq ordering is deterministic after restore', () => {
		store = createSessionStore({
			sessionId: 'athena-2',
			projectDir: '/tmp/proj',
			dbPath: ':memory:',
		});
		const mapper = createFeedMapper();

		// Run 1: SessionStart → UserPromptSubmit → PreToolUse → Stop
		const events1 = [
			makeRuntimeEvent('SessionStart'),
			makeRuntimeEvent('UserPromptSubmit'),
			makeRuntimeEvent('PreToolUse'),
			makeRuntimeEvent('Stop'),
		];
		for (const evt of events1) {
			const feedEvents = mapper.mapEvent(evt);
			store.recordEvent(evt, feedEvents);
		}

		// Run 2: UserPromptSubmit → PreToolUse
		const events2 = [
			makeRuntimeEvent('UserPromptSubmit'),
			makeRuntimeEvent('PreToolUse'),
		];
		for (const evt of events2) {
			const feedEvents = mapper.mapEvent(evt);
			store.recordEvent(evt, feedEvents);
		}

		// Restore and verify strict seq ordering
		const restored = store.restore();
		expect(restored.feedEvents.length).toBeGreaterThan(0);

		for (let i = 1; i < restored.feedEvents.length; i++) {
			const prev = restored.feedEvents[i - 1]!;
			const curr = restored.feedEvents[i]!;
			expect(curr.seq).toBeGreaterThan(prev.seq);
		}
	});
});
