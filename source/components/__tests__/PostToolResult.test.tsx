import React from 'react';
import {render} from 'ink-testing-library';
import {describe, it, expect} from 'vitest';
import PostToolResult from '../PostToolResult.js';
import type {FeedEvent} from '../../feed/types.js';

function stubToolPost(): FeedEvent {
	return {
		event_id: 'E1',
		seq: 1,
		ts: Date.now(),
		session_id: 's',
		run_id: 'r',
		kind: 'tool.post',
		level: 'info',
		actor_id: 'agent:root',
		title: 'Bash result',
		data: {
			tool_name: 'Bash',
			tool_input: {command: 'echo hello'},
			tool_response: {stdout: 'hello', stderr: '', exitCode: 0},
			tool_use_id: 't1',
		},
	} as unknown as FeedEvent;
}

describe('PostToolResult', () => {
	it('renders tool result without expanded prop', () => {
		const event = stubToolPost();
		const {lastFrame} = render(<PostToolResult event={event} />);
		const frame = lastFrame() ?? '';
		expect(frame).toContain('hello');
	});

	it('renders correctly with verbose=false', () => {
		const event = stubToolPost();
		const {lastFrame} = render(
			<PostToolResult event={event} verbose={false} />,
		);
		expect(lastFrame()).toContain('hello');
	});
});
