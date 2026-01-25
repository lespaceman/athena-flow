import React from 'react';
import {describe, it, expect} from 'vitest';
import {render} from 'ink-testing-library';
import HookEvent from './HookEvent.js';
import type {HookEventDisplay, PreToolUseEvent} from '../types/hooks/index.js';

describe('HookEvent', () => {
	const basePayload: PreToolUseEvent = {
		session_id: 'session-1',
		transcript_path: '/tmp/transcript.jsonl',
		cwd: '/project',
		hook_event_name: 'PreToolUse',
		tool_name: 'Bash',
		tool_input: {command: 'ls -la'},
	};

	const baseEvent: HookEventDisplay = {
		id: 'test-1',
		requestId: 'req-1',
		timestamp: new Date('2024-01-15T10:30:45.000Z'),
		hookName: 'PreToolUse',
		toolName: 'Bash',
		payload: basePayload,
		status: 'pending',
	};

	it('renders pending event with yellow indicator', () => {
		const {lastFrame} = render(<HookEvent event={baseEvent} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('PreToolUse:Bash');
		expect(frame).toContain('\u25cb'); // ○ symbol for pending
	});

	it('renders passthrough event with green indicator', () => {
		const event: HookEventDisplay = {
			...baseEvent,
			status: 'passthrough',
			result: {action: 'passthrough'},
		};
		const {lastFrame} = render(<HookEvent event={event} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('\u2713'); // ✓ symbol for passthrough
		expect(frame).toContain('passthrough');
	});

	it('renders blocked event with red indicator', () => {
		const event: HookEventDisplay = {
			...baseEvent,
			status: 'blocked',
			result: {action: 'block_with_stderr', stderr: 'Access denied'},
		};
		const {lastFrame} = render(<HookEvent event={event} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('\u2717'); // ✗ symbol for blocked
		expect(frame).toContain('blocked');
		expect(frame).toContain('Access denied');
	});

	it('renders json_output event with blue indicator', () => {
		const event: HookEventDisplay = {
			...baseEvent,
			status: 'json_output',
			result: {action: 'json_output', stdout_json: {modified: true}},
		};
		const {lastFrame} = render(<HookEvent event={event} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('\u2192'); // → symbol for json_output
		expect(frame).toContain('json_output');
	});

	it('renders hook event without tool name', () => {
		const event: HookEventDisplay = {
			...baseEvent,
			hookName: 'Notification',
			toolName: undefined,
			payload: {
				session_id: 'session-1',
				transcript_path: '/tmp/transcript.jsonl',
				cwd: '/project',
				hook_event_name: 'Notification',
				title: 'Info',
				message: 'Task completed',
			},
		};
		const {lastFrame} = render(<HookEvent event={event} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('Notification');
		expect(frame).not.toContain(':undefined');
	});

	it('truncates long tool input preview', () => {
		const longPayload: PreToolUseEvent = {
			...basePayload,
			tool_input: {
				command:
					'This is a very long command that should be truncated because it exceeds the maximum preview length',
			},
		};
		const event: HookEventDisplay = {
			...baseEvent,
			payload: longPayload,
		};
		const {lastFrame} = render(<HookEvent event={event} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('...');
	});

	it('shows notification message preview', () => {
		const event: HookEventDisplay = {
			...baseEvent,
			hookName: 'Notification',
			toolName: undefined,
			payload: {
				session_id: 'session-1',
				transcript_path: '/tmp/transcript.jsonl',
				cwd: '/project',
				hook_event_name: 'Notification',
				title: 'Build',
				message: 'Build complete',
			},
		};
		const {lastFrame} = render(<HookEvent event={event} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('Build complete');
	});
});
