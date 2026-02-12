import React from 'react';
import {describe, it, expect} from 'vitest';
import {render} from 'ink-testing-library';
import UnifiedToolCallEvent from './UnifiedToolCallEvent.js';
import type {
	HookEventDisplay,
	PreToolUseEvent,
	PostToolUseEvent,
	PostToolUseFailureEvent,
} from '../types/hooks/index.js';

function makePreToolEvent(
	overrides: Partial<HookEventDisplay> = {},
): HookEventDisplay {
	const payload: PreToolUseEvent = {
		session_id: 'session-1',
		transcript_path: '/tmp/transcript.jsonl',
		cwd: '/project',
		hook_event_name: 'PreToolUse',
		tool_name: 'Bash',
		tool_input: {command: 'echo "hello world"'},
	};
	return {
		id: 'test-1',
		requestId: 'req-1',
		timestamp: new Date('2024-01-15T10:30:45.000Z'),
		hookName: 'PreToolUse',
		toolName: 'Bash',
		payload,
		status: 'passthrough',
		...overrides,
	};
}

function makePostToolPayload(response: unknown): {
	payload: PostToolUseEvent;
	display: HookEventDisplay;
} {
	const payload: PostToolUseEvent = {
		session_id: 'session-1',
		transcript_path: '/tmp/transcript.jsonl',
		cwd: '/project',
		hook_event_name: 'PostToolUse',
		tool_name: 'Bash',
		tool_input: {command: 'echo "hello world"'},
		tool_response: response,
	};
	return {
		payload,
		display: {
			id: 'test-2',
			requestId: 'req-2',
			timestamp: new Date('2024-01-15T10:30:46.000Z'),
			hookName: 'PostToolUse',
			toolName: 'Bash',
			payload,
			status: 'passthrough',
		},
	};
}

function makePostToolFailurePayload(): {
	payload: PostToolUseFailureEvent;
	display: HookEventDisplay;
} {
	const payload: PostToolUseFailureEvent = {
		session_id: 'session-1',
		transcript_path: '/tmp/transcript.jsonl',
		cwd: '/project',
		hook_event_name: 'PostToolUseFailure',
		tool_name: 'Bash',
		tool_input: {command: 'echo "hello world"'},
		error: 'command not found',
	};
	return {
		payload,
		display: {
			id: 'test-2',
			requestId: 'req-2',
			timestamp: new Date('2024-01-15T10:30:46.000Z'),
			hookName: 'PostToolUseFailure',
			toolName: 'Bash',
			payload,
			status: 'passthrough',
		},
	};
}

describe('UnifiedToolCallEvent', () => {
	it('renders pending state with tool name and Running', () => {
		const event = makePreToolEvent({status: 'pending'});
		const {lastFrame} = render(<UnifiedToolCallEvent event={event} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('\u25cf'); // ● bullet
		expect(frame).toContain('Bash');
		expect(frame).toContain('Running');
	});

	it('renders success with response text', () => {
		const post = makePostToolPayload('hello world');
		const event = makePreToolEvent({postToolEvent: post.display});
		const {lastFrame} = render(<UnifiedToolCallEvent event={event} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('\u25cf'); // ● bullet
		expect(frame).toContain('Bash');
		expect(frame).toContain('\u23bf'); // ⎿ response prefix
		expect(frame).toContain('hello world');
	});

	it('renders failure with error text', () => {
		const post = makePostToolFailurePayload();
		const event = makePreToolEvent({postToolEvent: post.display});
		const {lastFrame} = render(<UnifiedToolCallEvent event={event} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('\u25cf');
		expect(frame).toContain('Bash');
		expect(frame).toContain('command not found');
	});

	it('renders blocked state with User rejected', () => {
		const event = makePreToolEvent({status: 'blocked'});
		const {lastFrame} = render(<UnifiedToolCallEvent event={event} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('\u25cf');
		expect(frame).toContain('User rejected');
	});

	it('shows (no output) for empty response', () => {
		const post = makePostToolPayload('');
		const event = makePreToolEvent({postToolEvent: post.display});
		const {lastFrame} = render(<UnifiedToolCallEvent event={event} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('(no output)');
	});

	it('renders standalone PostToolUse (orphaned)', () => {
		const post = makePostToolPayload('orphaned result');
		const event: HookEventDisplay = {
			...post.display,
			hookName: 'PostToolUse',
		};
		const {lastFrame} = render(<UnifiedToolCallEvent event={event} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('\u25cf');
		expect(frame).toContain('Bash');
		expect(frame).toContain('orphaned result');
	});
});
