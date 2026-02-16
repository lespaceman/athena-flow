/** @vitest-environment jsdom */
import React from 'react';
import {describe, it, expect} from 'vitest';
import {render} from 'ink-testing-library';
import stripAnsi from 'strip-ansi';
import PostToolResult from './PostToolResult.js';
import type {
	HookEventDisplay,
	PostToolUseEvent,
	PostToolUseFailureEvent,
	PreToolUseEvent,
} from '../types/hooks/index.js';

function makePostToolEvent(
	response: unknown,
	overrides: Partial<HookEventDisplay> = {},
): HookEventDisplay {
	const payload: PostToolUseEvent = {
		session_id: 'session-1',
		transcript_path: '/tmp/transcript.jsonl',
		cwd: '/project',
		hook_event_name: 'PostToolUse',
		tool_name: 'Bash',
		tool_input: {command: 'echo hello'},
		tool_response: response,
	};
	return {
		id: 'post-1',
		timestamp: new Date('2024-01-15T10:30:46.000Z'),
		hookName: 'PostToolUse',
		toolName: 'Bash',
		payload,
		status: 'passthrough',
		...overrides,
	};
}

function makePostToolFailureEvent(
	overrides: Partial<HookEventDisplay> = {},
): HookEventDisplay {
	const payload: PostToolUseFailureEvent = {
		session_id: 'session-1',
		transcript_path: '/tmp/transcript.jsonl',
		cwd: '/project',
		hook_event_name: 'PostToolUseFailure',
		tool_name: 'Bash',
		tool_input: {command: 'bad-command'},
		error: 'command not found',
	};
	return {
		id: 'post-fail-1',
		timestamp: new Date('2024-01-15T10:30:46.000Z'),
		hookName: 'PostToolUseFailure',
		toolName: 'Bash',
		payload,
		status: 'blocked',
		...overrides,
	};
}

function makePreToolEvent(): HookEventDisplay {
	const payload: PreToolUseEvent = {
		session_id: 'session-1',
		transcript_path: '/tmp/transcript.jsonl',
		cwd: '/project',
		hook_event_name: 'PreToolUse',
		tool_name: 'Bash',
		tool_input: {command: 'echo hello'},
	};
	return {
		id: 'pre-1',
		timestamp: new Date('2024-01-15T10:30:45.000Z'),
		hookName: 'PreToolUse',
		toolName: 'Bash',
		payload,
		status: 'passthrough',
	};
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
		const event = makePostToolEvent(bashResponse);
		const {lastFrame} = render(<PostToolResult event={event} />);
		const output = stripAnsi(lastFrame() ?? '');
		expect(output).toContain('hello');
	});

	it('renders error text for PostToolUseFailure events', () => {
		const event = makePostToolFailureEvent();
		const {lastFrame} = render(<PostToolResult event={event} />);
		const output = stripAnsi(lastFrame() ?? '');
		expect(output).toContain('command not found');
	});

	it('returns null for non-PostToolUse events', () => {
		const event = makePreToolEvent();
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
		const event = makePostToolEvent(bashResponse);
		const {lastFrame} = render(<PostToolResult event={event} verbose />);
		const output = stripAnsi(lastFrame() ?? '');
		expect(output).toContain('verbose output');
	});
});
