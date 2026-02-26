import React from 'react';
import {render} from 'ink-testing-library';
import {describe, it, expect} from 'vitest';
import SubagentStopEvent from '../SubagentStopEvent.js';
import type {FeedEvent} from '../../feed/types.js';

function makeEvent(
	overrides: Partial<{
		agent_id: string;
		agent_type: string;
		stop_hook_active: boolean;
		agent_transcript_path: string;
	}> = {},
): FeedEvent {
	return {
		event_id: 'E1',
		seq: 1,
		ts: Date.now(),
		session_id: 's',
		run_id: 'r',
		kind: 'subagent.stop',
		level: 'info',
		actor_id: 'agent:root',
		title: '',
		data: {
			agent_id: 'sub-1',
			agent_type: 'Task',
			stop_hook_active: false,
			...overrides,
		},
	} as unknown as FeedEvent;
}

describe('SubagentStopEvent', () => {
	it('renders agent type name', () => {
		const {lastFrame} = render(<SubagentStopEvent event={makeEvent()} />);
		expect(lastFrame()).toContain('⏹ Task done');
	});

	it('defaults to "Agent" when agent_type is empty', () => {
		const {lastFrame} = render(
			<SubagentStopEvent event={makeEvent({agent_type: ''})} />,
		);
		expect(lastFrame()).toContain('⏹ Agent done');
	});

	it('shows agent_id and transcript path when expanded', () => {
		const event = makeEvent({
			agent_id: 'sub-42',
			agent_transcript_path: '/tmp/transcript.md',
		});
		const {lastFrame} = render(
			<SubagentStopEvent event={event} expanded={true} />,
		);
		const frame = lastFrame()!;
		expect(frame).toContain('agent_id: sub-42');
		expect(frame).toContain('transcript: /tmp/transcript.md');
	});

	it('hides metadata when not expanded', () => {
		const event = makeEvent({agent_transcript_path: '/tmp/transcript.md'});
		const {lastFrame} = render(<SubagentStopEvent event={event} />);
		expect(lastFrame()).not.toContain('agent_id:');
		expect(lastFrame()).not.toContain('transcript:');
	});

	it('returns null for non-subagent.stop events', () => {
		const event = {
			...makeEvent(),
			kind: 'tool.pre',
		} as unknown as FeedEvent;
		const {lastFrame} = render(<SubagentStopEvent event={event} />);
		expect(lastFrame()).toBe('');
	});
});
