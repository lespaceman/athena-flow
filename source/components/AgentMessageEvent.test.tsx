import {describe, expect, it} from 'vitest';
import React from 'react';
import {render} from 'ink-testing-library';
import AgentMessageEvent from './AgentMessageEvent.js';
import type {FeedEvent} from '../feed/types.js';

function makeAgentMessage(scope: 'root' | 'subagent'): FeedEvent {
	return {
		kind: 'agent.message',
		id: 'ev-1',
		seq: 1,
		ts: Date.now(),
		run_id: 'run-1',
		actor_id: scope === 'subagent' ? 'subagent:s1' : 'agent:root',
		level: 'info',
		data: {message: 'Hello world', scope},
	} as FeedEvent;
}

describe('AgentMessageEvent', () => {
	it('uses glyph instead of emoji for label', () => {
		const {lastFrame} = render(
			<AgentMessageEvent event={makeAgentMessage('root')} />,
		);
		const output = lastFrame();
		expect(output).not.toContain('💬');
		expect(output).toContain('Agent response');
	});

	it('uses subagent label for subagent scope', () => {
		const {lastFrame} = render(
			<AgentMessageEvent event={makeAgentMessage('subagent')} />,
		);
		const output = lastFrame();
		expect(output).not.toContain('💬');
		expect(output).toContain('Subagent response');
	});
});
