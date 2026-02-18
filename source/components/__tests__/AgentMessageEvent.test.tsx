import React from 'react';
import {render} from 'ink-testing-library';
import {describe, it, expect} from 'vitest';
import AgentMessageEvent from '../AgentMessageEvent.js';
import type {FeedEvent} from '../../feed/types.js';

function makeEvent(overrides?: Partial<Record<string, unknown>>): FeedEvent {
	return {
		event_id: 'R1:E5:msg',
		seq: 5.5,
		ts: Date.now(),
		session_id: 'sess-1',
		run_id: 'R1',
		kind: 'agent.message',
		level: 'info',
		actor_id: 'agent:root',
		title: '💬 Agent response',
		body: 'Here is my final response.',
		data: {
			message: 'Here is my final response.',
			source: 'transcript',
			scope: 'root',
		},
		...overrides,
	} as unknown as FeedEvent;
}

describe('AgentMessageEvent', () => {
	it('renders agent response label', () => {
		const {lastFrame} = render(<AgentMessageEvent event={makeEvent()} />);
		expect(lastFrame()).toContain('Agent response');
	});

	it('renders subagent response label when scope is subagent', () => {
		const event = makeEvent({
			data: {
				message: 'Done.',
				source: 'transcript',
				scope: 'subagent',
			},
		});
		const {lastFrame} = render(<AgentMessageEvent event={event} />);
		expect(lastFrame()).toContain('Subagent response');
	});

	it('returns null for non-agent.message events', () => {
		const event = makeEvent({kind: 'session.start'});
		const {lastFrame} = render(<AgentMessageEvent event={event} />);
		expect(lastFrame()).toBe('');
	});
});
