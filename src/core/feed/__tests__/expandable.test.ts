import {describe, it, expect} from 'vitest';
import {isExpandable} from '../expandable';
import type {FeedEvent} from '../types';

function stub(kind: string, extra?: Record<string, unknown>): FeedEvent {
	return {
		event_id: 'e1',
		seq: 1,
		ts: 1,
		session_id: 's',
		run_id: 'r',
		kind,
		level: 'info',
		actor_id: 'agent:root',
		title: '',
		data: {tool_name: 'Bash', tool_input: {}, ...extra},
	} as unknown as FeedEvent;
}

describe('isExpandable', () => {
	it('returns true for all feed event kinds', () => {
		for (const kind of [
			'tool.pre',
			'tool.post',
			'tool.failure',
			'permission.request',
			'permission.decision',
			'subagent.start',
			'subagent.stop',
			'run.start',
			'run.end',
			'user.prompt',
			'notification',
			'stop.request',
			'stop.decision',
		] as const) {
			expect(
				isExpandable(stub(kind, {agent_id: 'a1', agent_type: 'Explore'})),
			).toBe(true);
		}
	});
});
