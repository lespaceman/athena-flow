import {describe, it, expect} from 'vitest';
import {buildPostByToolUseId} from '../hooks/useFeed.js';
import type {FeedEvent} from '../feed/types.js';

// invariant-waiver: #2 (mapper is sole constructor) — test helper for unit testing buildPostByToolUseId
function makeFeedEvent(
	kind: FeedEvent['kind'],
	data: Record<string, unknown>,
): FeedEvent {
	return {
		event_id: `evt-${Math.random()}`,
		seq: 1,
		ts: Date.now(),
		session_id: 's1',
		run_id: 's1:R1',
		kind,
		level: 'info',
		actor_id: 'agent:root',
		title: 'test',
		data,
	} as FeedEvent;
}

describe('buildPostByToolUseId', () => {
	it('maps tool.post events by tool_use_id', () => {
		const events: FeedEvent[] = [
			makeFeedEvent('tool.pre', {
				tool_name: 'Bash',
				tool_input: {},
				tool_use_id: 'tu-1',
			}),
			makeFeedEvent('tool.post', {
				tool_name: 'Bash',
				tool_input: {},
				tool_use_id: 'tu-1',
				tool_response: 'ok',
			}),
		];
		const map = buildPostByToolUseId(events);
		expect(map.get('tu-1')).toBeDefined();
		expect(map.get('tu-1')?.kind).toBe('tool.post');
	});

	it('maps tool.failure events by tool_use_id', () => {
		const events: FeedEvent[] = [
			makeFeedEvent('tool.pre', {
				tool_name: 'Bash',
				tool_input: {},
				tool_use_id: 'tu-2',
			}),
			makeFeedEvent('tool.failure', {
				tool_name: 'Bash',
				tool_input: {},
				tool_use_id: 'tu-2',
				error: 'fail',
			}),
		];
		const map = buildPostByToolUseId(events);
		expect(map.get('tu-2')?.kind).toBe('tool.failure');
	});

	it('returns empty map for events without tool_use_id', () => {
		const events: FeedEvent[] = [
			makeFeedEvent('tool.post', {
				tool_name: 'Bash',
				tool_input: {},
				tool_response: 'ok',
			}),
		];
		const map = buildPostByToolUseId(events);
		expect(map.size).toBe(0);
	});

	it('ignores non-tool events', () => {
		const events: FeedEvent[] = [
			makeFeedEvent('notification', {message: 'hello'}),
		];
		const map = buildPostByToolUseId(events);
		expect(map.size).toBe(0);
	});
});
