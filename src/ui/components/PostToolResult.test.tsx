/** @vitest-environment jsdom */
import React from 'react';
import {describe, it, expect} from 'vitest';
import {render} from 'ink-testing-library';
import stripAnsi from 'strip-ansi';
import PostToolResult from './PostToolResult';
import type {FeedEvent} from '../../core/feed/types';

function makeFeedEvent(
	kind: FeedEvent['kind'],
	data: Record<string, unknown>,
): FeedEvent {
	return {
		event_id: 'test-1',
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

describe('PostToolResult', () => {
	it('renders tool output for PostToolUse events', () => {
		const bashResponse = {
			stdout: 'hello\n',
			stderr: '',
			interrupted: false,
			isImage: false,
			noOutputExpected: false,
		};
		const event = makeFeedEvent('tool.post', {
			tool_name: 'Bash',
			tool_input: {command: 'echo hello'},
			tool_response: bashResponse,
		});
		const {lastFrame} = render(<PostToolResult event={event} />);
		const output = stripAnsi(lastFrame() ?? '');
		expect(output).toContain('hello');
	});

	it('renders error text for tool.failure events', () => {
		const event = makeFeedEvent('tool.failure', {
			tool_name: 'Bash',
			tool_input: {command: 'bad-command'},
			error: 'command not found',
		});
		const {lastFrame} = render(<PostToolResult event={event} />);
		const output = stripAnsi(lastFrame() ?? '');
		expect(output).toContain('command not found');
	});

	it('returns null for non-post-tool events', () => {
		const event = makeFeedEvent('tool.pre', {
			tool_name: 'Bash',
			tool_input: {command: 'echo hello'},
		});
		const {lastFrame} = render(<PostToolResult event={event} />);
		expect(lastFrame()).toBe('');
	});

	it('shows raw post-tool text when verbose is true', () => {
		const bashResponse = {
			stdout: 'verbose output\n',
			stderr: '',
			interrupted: false,
			isImage: false,
			noOutputExpected: false,
		};
		const event = makeFeedEvent('tool.post', {
			tool_name: 'Bash',
			tool_input: {command: 'echo hello'},
			tool_response: bashResponse,
		});
		const {lastFrame} = render(<PostToolResult event={event} verbose />);
		const output = stripAnsi(lastFrame() ?? '');
		expect(output).toContain('verbose output');
	});
});
