import {describe, it, expect} from 'vitest';
import {isExpandable} from '../expandable.js';
import type {FeedEvent} from '../types.js';

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
	it('returns true for tool.pre', () => {
		expect(isExpandable(stub('tool.pre'))).toBe(true);
	});

	it('returns true for permission.request', () => {
		expect(isExpandable(stub('permission.request'))).toBe(true);
	});

	it('returns true for subagent.start', () => {
		expect(
			isExpandable(stub('subagent.start', {agent_id: 'a1', agent_type: 'X'})),
		).toBe(true);
	});

	it('returns true for run.start', () => {
		expect(isExpandable(stub('run.start'))).toBe(true);
	});

	it('returns true for stop.request', () => {
		expect(isExpandable(stub('stop.request'))).toBe(true);
	});

	it('returns false for tool.post', () => {
		expect(isExpandable(stub('tool.post'))).toBe(false);
	});

	it('returns false for tool.failure', () => {
		expect(isExpandable(stub('tool.failure'))).toBe(false);
	});

	it('returns false for permission.decision', () => {
		expect(isExpandable(stub('permission.decision'))).toBe(false);
	});

	it('returns false for notification', () => {
		expect(isExpandable(stub('notification'))).toBe(false);
	});
});
