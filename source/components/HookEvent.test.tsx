import React from 'react';
import {describe, it, expect} from 'vitest';
import {render} from 'ink-testing-library';
import HookEvent from './HookEvent.js';
import type {
	HookEventDisplay,
	PreToolUseEvent,
	PostToolUseEvent,
	PostToolUseFailureEvent,
} from '../types/hooks/index.js';

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

		expect(frame).toContain('PreToolUse:');
		expect(frame).toContain('Bash');
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
				message: 'Task completed',
			},
		};
		const {lastFrame} = render(<HookEvent event={event} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('Notification');
		expect(frame).not.toContain(':undefined');
	});

	it('shows PreToolUse key-value pairs for tool_input', () => {
		const event: HookEventDisplay = {
			...baseEvent,
			payload: {
				...basePayload,
				tool_input: {command: 'ls -la', timeout: 5000},
			},
		};
		const {lastFrame} = render(<HookEvent event={event} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('command:');
		expect(frame).toContain('ls -la');
		expect(frame).toContain('timeout:');
		expect(frame).toContain('5000');
	});

	it('truncates long tool_input values', () => {
		const longValue = 'x'.repeat(200);
		const event: HookEventDisplay = {
			...baseEvent,
			payload: {
				...basePayload,
				tool_input: {command: longValue},
			},
		};
		const {lastFrame} = render(<HookEvent event={event} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('...');
		expect(frame).not.toContain(longValue);
	});

	it('shows PostToolUse response preview', () => {
		const postPayload: PostToolUseEvent = {
			session_id: 'session-1',
			transcript_path: '/tmp/transcript.jsonl',
			cwd: '/project',
			hook_event_name: 'PostToolUse',
			tool_name: 'Bash',
			tool_input: {command: 'echo hi'},
			tool_response: 'hi\n',
		};
		const event: HookEventDisplay = {
			...baseEvent,
			hookName: 'PostToolUse',
			payload: postPayload,
			status: 'passthrough',
			result: {action: 'passthrough'},
		};
		const {lastFrame} = render(<HookEvent event={event} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('hi');
	});

	it('shows PostToolUseFailure response in red', () => {
		const failPayload: PostToolUseFailureEvent = {
			session_id: 'session-1',
			transcript_path: '/tmp/transcript.jsonl',
			cwd: '/project',
			hook_event_name: 'PostToolUseFailure',
			tool_name: 'Bash',
			tool_input: {command: 'bad-cmd'},
			tool_response: 'command not found',
		};
		const event: HookEventDisplay = {
			...baseEvent,
			hookName: 'PostToolUseFailure',
			payload: failPayload,
			status: 'passthrough',
			result: {action: 'passthrough'},
		};
		const {lastFrame} = render(<HookEvent event={event} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('command not found');
	});

	it('extracts text from content-block array response (MCP tools)', () => {
		const postPayload: PostToolUseEvent = {
			session_id: 'session-1',
			transcript_path: '/tmp/transcript.jsonl',
			cwd: '/project',
			hook_event_name: 'PostToolUse',
			tool_name: 'mcp__agent-web-interface__navigate',
			tool_input: {url: 'https://example.com'},
			tool_response: [
				{
					type: 'text',
					text: '<node eid="abc123" kind="link">Example Link</node>',
				},
			],
		};
		const event: HookEventDisplay = {
			...baseEvent,
			hookName: 'PostToolUse',
			toolName: 'mcp__agent-web-interface__navigate',
			payload: postPayload,
			status: 'passthrough',
			result: {action: 'passthrough'},
		};
		const {lastFrame} = render(<HookEvent event={event} />);
		const frame = lastFrame() ?? '';

		// Should show the extracted text, not the JSON wrapper
		expect(frame).toContain('Example Link');
		expect(frame).not.toContain('"type"');
	});

	it('shows JSON object response as key-value pairs (Write tool)', () => {
		const postPayload: PostToolUseEvent = {
			session_id: 'session-1',
			transcript_path: '/tmp/transcript.jsonl',
			cwd: '/project',
			hook_event_name: 'PostToolUse',
			tool_name: 'Write',
			tool_input: {file_path: '/tmp/file.txt', content: 'hello'},
			tool_response: {filePath: '/tmp/file.txt', success: true},
		};
		const event: HookEventDisplay = {
			...baseEvent,
			hookName: 'PostToolUse',
			toolName: 'Write',
			payload: postPayload,
			status: 'passthrough',
			result: {action: 'passthrough'},
		};
		const {lastFrame} = render(<HookEvent event={event} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('filePath:');
		expect(frame).toContain('/tmp/file.txt');
		expect(frame).toContain('success:');
		expect(frame).toContain('true');
	});

	it('handles null tool_response gracefully', () => {
		const postPayload: PostToolUseEvent = {
			session_id: 'session-1',
			transcript_path: '/tmp/transcript.jsonl',
			cwd: '/project',
			hook_event_name: 'PostToolUse',
			tool_name: 'Bash',
			tool_input: {command: 'echo'},
			tool_response: null,
		};
		const event: HookEventDisplay = {
			...baseEvent,
			hookName: 'PostToolUse',
			payload: postPayload,
			status: 'passthrough',
			result: {action: 'passthrough'},
		};
		const {lastFrame} = render(<HookEvent event={event} />);
		const frame = lastFrame() ?? '';

		// Should render without crashing
		expect(frame).toContain('PostToolUse');
	});

	it('handles undefined tool_response gracefully', () => {
		const postPayload: PostToolUseEvent = {
			session_id: 'session-1',
			transcript_path: '/tmp/transcript.jsonl',
			cwd: '/project',
			hook_event_name: 'PostToolUse',
			tool_name: 'Bash',
			tool_input: {command: 'echo'},
			tool_response: undefined,
		};
		const event: HookEventDisplay = {
			...baseEvent,
			hookName: 'PostToolUse',
			payload: postPayload,
			status: 'passthrough',
			result: {action: 'passthrough'},
		};
		const {lastFrame} = render(<HookEvent event={event} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('PostToolUse');
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
				message: 'Build complete',
				notification_type: 'permission_prompt',
			},
		};
		const {lastFrame} = render(<HookEvent event={event} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('Build complete');
	});

	it('truncates long notification messages', () => {
		const longMessage = 'A'.repeat(250);
		const event: HookEventDisplay = {
			...baseEvent,
			hookName: 'Notification',
			toolName: undefined,
			payload: {
				session_id: 'session-1',
				transcript_path: '/tmp/transcript.jsonl',
				cwd: '/project',
				hook_event_name: 'Notification',
				message: longMessage,
			},
		};
		const {lastFrame} = render(<HookEvent event={event} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('...');
		expect(frame).not.toContain(longMessage);
	});

	it('renders full JSON payload when debug is true', () => {
		const {lastFrame} = render(<HookEvent event={baseEvent} debug={true} />);
		const frame = lastFrame() ?? '';

		// Should contain fields from the full payload
		expect(frame).toContain('session-1');
		expect(frame).toContain('/tmp/transcript.jsonl');
		expect(frame).toContain('/project');
		expect(frame).toContain('PreToolUse');
		expect(frame).toContain('ls -la');
	});

	it('does not show full payload when debug prop is omitted', () => {
		const {lastFrame} = render(<HookEvent event={baseEvent} />);
		const frame = lastFrame() ?? '';

		// Should show the key-value preview, not full payload
		expect(frame).not.toContain('transcript_path');
		expect(frame).not.toContain('/tmp/transcript.jsonl');
	});

	it('shows no preview for non-tool non-notification events', () => {
		const event: HookEventDisplay = {
			...baseEvent,
			hookName: 'Stop',
			toolName: undefined,
			payload: {
				session_id: 'session-1',
				transcript_path: '/tmp/transcript.jsonl',
				cwd: '/project',
				hook_event_name: 'Stop',
				stop_hook_active: false,
			},
		};
		const {lastFrame} = render(<HookEvent event={event} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('Stop');
		// Should not leak internal payload fields
		expect(frame).not.toContain('session-1');
		expect(frame).not.toContain('transcript_path');
	});

	it('renders bold tool name in label', () => {
		const {lastFrame} = render(<HookEvent event={baseEvent} />);
		const frame = lastFrame() ?? '';

		// Tool name should appear in the output
		expect(frame).toContain('Bash');
	});
});
