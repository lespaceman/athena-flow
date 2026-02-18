// source/feed/__tests__/filter.test.ts
import {describe, it, expect} from 'vitest';
import {shouldExcludeFromFeed} from '../filter.js';
import type {FeedEvent, FeedEventKind} from '../types.js';

function makeEvent(
	kind: FeedEventKind,
	data: Record<string, unknown> = {},
): FeedEvent {
	return {
		event_id: 'e1',
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

describe('shouldExcludeFromFeed', () => {
	it('excludes session.end (rendered as synthetic messages)', () => {
		expect(
			shouldExcludeFromFeed(makeEvent('session.end', {reason: 'clear'})),
		).toBe(true);
	});

	it('excludes subagent.stop (result via tool.post Task)', () => {
		expect(
			shouldExcludeFromFeed(
				makeEvent('subagent.stop', {
					agent_id: 'a1',
					agent_type: 'Explore',
					stop_hook_active: false,
				}),
			),
		).toBe(true);
	});

	it('excludes TodoWrite tool.pre events', () => {
		expect(
			shouldExcludeFromFeed(
				makeEvent('tool.pre', {
					tool_name: 'TodoWrite',
					tool_input: {},
				}),
			),
		).toBe(true);
	});

	it('excludes TaskCreate tool.pre events', () => {
		expect(
			shouldExcludeFromFeed(
				makeEvent('tool.pre', {
					tool_name: 'TaskCreate',
					tool_input: {},
				}),
			),
		).toBe(true);
	});

	it('excludes TodoWrite tool.post events', () => {
		expect(
			shouldExcludeFromFeed(
				makeEvent('tool.post', {
					tool_name: 'TodoWrite',
					tool_input: {},
					tool_response: {},
				}),
			),
		).toBe(true);
	});

	it('does not exclude regular tool.pre events', () => {
		expect(
			shouldExcludeFromFeed(
				makeEvent('tool.pre', {
					tool_name: 'Bash',
					tool_input: {},
				}),
			),
		).toBe(false);
	});

	it('does not exclude permission.request', () => {
		expect(
			shouldExcludeFromFeed(
				makeEvent('permission.request', {
					tool_name: 'Bash',
					tool_input: {},
				}),
			),
		).toBe(false);
	});

	it('does not exclude run.start/run.end', () => {
		expect(
			shouldExcludeFromFeed(
				makeEvent('run.start', {
					trigger: {type: 'other'},
				}),
			),
		).toBe(false);
		expect(
			shouldExcludeFromFeed(
				makeEvent('run.end', {
					status: 'completed',
					counters: {
						tool_uses: 0,
						tool_failures: 0,
						permission_requests: 0,
						blocks: 0,
					},
				}),
			),
		).toBe(false);
	});
});
