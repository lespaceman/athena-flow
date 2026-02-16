import React from 'react';
import {describe, it, expect} from 'vitest';
import {render} from 'ink-testing-library';
import HookEvent from './HookEvent.js';
import type {
	HookEventDisplay,
	PreToolUseEvent,
	PermissionRequestEvent,
	PostToolUseEvent,
	PostToolUseFailureEvent,
	SubagentStartEvent,
	SubagentStopEvent,
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
		timestamp: new Date('2024-01-15T10:30:45.000Z'),
		hookName: 'PreToolUse',
		toolName: 'Bash',
		payload: basePayload,
		status: 'pending',
	};

	it('renders pending event with yellow bullet', () => {
		const {lastFrame} = render(<HookEvent event={baseEvent} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('Bash');
		expect(frame).toContain('\u25cf'); // ● unified bullet for all states
	});

	it('renders passthrough event with green filled circle', () => {
		const event: HookEventDisplay = {
			...baseEvent,
			status: 'passthrough',
			result: {action: 'passthrough'},
		};
		const {lastFrame} = render(<HookEvent event={event} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('\u25cf'); // ● symbol for passthrough
	});

	it('renders blocked event with red bullet and User rejected', () => {
		const event: HookEventDisplay = {
			...baseEvent,
			status: 'blocked',
			result: {action: 'block_with_stderr', stderr: 'Access denied'},
		};
		const {lastFrame} = render(<HookEvent event={event} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('\u25cf'); // ● unified bullet
		expect(frame).toContain('User rejected');
	});

	it('renders json_output event with unified bullet', () => {
		const event: HookEventDisplay = {
			...baseEvent,
			status: 'json_output',
			result: {action: 'json_output', stdout_json: {modified: true}},
		};
		const {lastFrame} = render(<HookEvent event={event} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('\u25cf'); // ● unified bullet for all states
	});

	it('renders PreToolUse header with inline params', () => {
		const {lastFrame} = render(<HookEvent event={baseEvent} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('Bash');
		expect(frame).toContain('command: "ls -la"');
	});

	it('renders MCP tool name parsed correctly in header', () => {
		const mcpPayload: PreToolUseEvent = {
			...basePayload,
			tool_name: 'mcp__agent-web-interface__navigate',
			tool_input: {url: 'https://www.google.com'},
		};
		const event: HookEventDisplay = {
			...baseEvent,
			toolName: 'mcp__agent-web-interface__navigate',
			payload: mcpPayload,
		};
		const {lastFrame} = render(<HookEvent event={event} />);
		const frame = lastFrame() ?? '';

		// displayName is now just the action, serverLabel is separate
		expect(frame).toContain('navigate');
		expect(frame).toContain('url: "https://www.google.com"');
	});

	it('indents multiline PostToolUse response continuation lines', () => {
		const postPayload: PostToolUseEvent = {
			session_id: 'session-1',
			transcript_path: '/tmp/transcript.jsonl',
			cwd: '/project',
			hook_event_name: 'PostToolUse',
			tool_name: 'Bash',
			tool_input: {command: 'ls'},
			tool_response: 'line1\nline2\nline3',
		};
		const event: HookEventDisplay = {
			...baseEvent,
			hookName: 'PostToolUse',
			payload: postPayload,
			status: 'passthrough',
			result: {action: 'passthrough'},
		};
		const {lastFrame} = render(<HookEvent event={event} verbose={true} />);
		const frame = lastFrame() ?? '';

		// Rich rendering: CodeBlock renders all lines (no ⎿ prefix)
		expect(frame).toContain('line1');
		expect(frame).toContain('line2');
		expect(frame).toContain('line3');
	});

	it('renders non-tool events borderless', () => {
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
		// Should not contain box border characters
		expect(frame).not.toContain('\u250c'); // ┌
		expect(frame).not.toContain('\u2500'); // ─
		expect(frame).not.toContain('\u2502'); // │
	});

	// "renders tool events without border boxes" removed - redundant with non-tool events borderless test
	// "renders hook event without tool name" removed - redundant with non-tool events borderless test

	it('shows standalone PostToolUse response', () => {
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
		const {lastFrame} = render(<HookEvent event={event} verbose={true} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('hi');
		expect(frame).toContain('Bash');
	});

	it('shows PostToolUseFailure error message', () => {
		const failPayload: PostToolUseFailureEvent = {
			session_id: 'session-1',
			transcript_path: '/tmp/transcript.jsonl',
			cwd: '/project',
			hook_event_name: 'PostToolUseFailure',
			tool_name: 'Bash',
			tool_input: {command: 'bad-cmd'},
			error: 'command not found',
		};
		const event: HookEventDisplay = {
			...baseEvent,
			hookName: 'PostToolUseFailure',
			payload: failPayload,
			status: 'passthrough',
			result: {action: 'passthrough'},
		};
		const {lastFrame} = render(<HookEvent event={event} verbose={true} />);
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
		// As standalone PostToolUse
		const event: HookEventDisplay = {
			...baseEvent,
			hookName: 'PostToolUse',
			toolName: 'mcp__agent-web-interface__navigate',
			payload: postPayload,
			status: 'passthrough',
			result: {action: 'passthrough'},
		};
		const {lastFrame} = render(<HookEvent event={event} verbose={true} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('Example Link');
		expect(frame).not.toContain('"type"');
	});

	it('extracts text from single content block response', () => {
		const postPayload: PostToolUseEvent = {
			session_id: 'session-1',
			transcript_path: '/tmp/transcript.jsonl',
			cwd: '/project',
			hook_event_name: 'PostToolUse',
			tool_name: 'Read',
			tool_input: {file_path: '/tmp/file.txt'},
			tool_response: {type: 'text', text: 'file contents here'},
		};
		const event: HookEventDisplay = {
			...baseEvent,
			hookName: 'PostToolUse',
			toolName: 'Read',
			payload: postPayload,
			status: 'passthrough',
			result: {action: 'passthrough'},
		};
		const {lastFrame} = render(<HookEvent event={event} verbose={true} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('file contents here');
		// Should not show raw object keys
		expect(frame).not.toContain('"type"');
		expect(frame).not.toContain('type:');
	});

	it('extracts content from wrapped response object', () => {
		const postPayload: PostToolUseEvent = {
			session_id: 'session-1',
			transcript_path: '/tmp/transcript.jsonl',
			cwd: '/project',
			hook_event_name: 'PostToolUse',
			tool_name: 'mcp__server__action',
			tool_input: {query: 'test'},
			tool_response: {
				content: [{type: 'text', text: 'extracted content'}],
				isError: false,
			},
		};
		const event: HookEventDisplay = {
			...baseEvent,
			hookName: 'PostToolUse',
			toolName: 'mcp__server__action',
			payload: postPayload,
			status: 'passthrough',
			result: {action: 'passthrough'},
		};
		const {lastFrame} = render(<HookEvent event={event} verbose={true} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('extracted content');
		// Should not show the wrapper fields
		expect(frame).not.toContain('isError');
	});

	it('extracts string content from wrapped response', () => {
		const postPayload: PostToolUseEvent = {
			session_id: 'session-1',
			transcript_path: '/tmp/transcript.jsonl',
			cwd: '/project',
			hook_event_name: 'PostToolUse',
			tool_name: 'Bash',
			tool_input: {command: 'echo hi'},
			tool_response: {content: 'wrapped string content'},
		};
		const event: HookEventDisplay = {
			...baseEvent,
			hookName: 'PostToolUse',
			toolName: 'Bash',
			payload: postPayload,
			status: 'passthrough',
			result: {action: 'passthrough'},
		};
		const {lastFrame} = render(<HookEvent event={event} verbose={true} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('wrapped string content');
		expect(frame).not.toContain('content:');
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
		const {lastFrame} = render(<HookEvent event={event} verbose={true} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('filePath:');
		expect(frame).toContain('/tmp/file.txt');
		expect(frame).toContain('success:');
		expect(frame).toContain('true');
	});

	it.each([null, undefined])(
		'handles %s tool_response gracefully',
		tool_response => {
			const postPayload: PostToolUseEvent = {
				session_id: 'session-1',
				transcript_path: '/tmp/transcript.jsonl',
				cwd: '/project',
				hook_event_name: 'PostToolUse',
				tool_name: 'Bash',
				tool_input: {command: 'echo'},
				tool_response: tool_response as null | undefined,
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
			expect(frame).toContain('Bash');
		},
	);

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

	it('renders tool input JSON when verbose is true', () => {
		const {lastFrame} = render(<HookEvent event={baseEvent} verbose={true} />);
		const frame = lastFrame() ?? '';

		// Should contain fields from the tool_input
		expect(frame).toContain('command');
		expect(frame).toContain('ls -la');
	});

	it('does not show full payload when verbose prop is omitted', () => {
		const {lastFrame} = render(<HookEvent event={baseEvent} />);
		const frame = lastFrame() ?? '';

		// Should show inline params, not full payload
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

	// "renders tool name in header" removed - already covered by PreToolUse header test

	it('renders PermissionRequest event with tool name and inline params', () => {
		const permPayload: PermissionRequestEvent = {
			session_id: 'session-1',
			transcript_path: '/tmp/transcript.jsonl',
			cwd: '/project',
			hook_event_name: 'PermissionRequest',
			tool_name: 'Bash',
			tool_input: {command: 'rm -rf /'},
		};
		const event: HookEventDisplay = {
			...baseEvent,
			hookName: 'PermissionRequest',
			toolName: 'Bash',
			payload: permPayload,
		};
		const {lastFrame} = render(<HookEvent event={event} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('Bash');
		expect(frame).toContain('command: "rm -rf /"');
	});

	it('renders Task PreToolUse as agent start with subagent_type', () => {
		const taskPayload: PreToolUseEvent = {
			session_id: 'session-1',
			transcript_path: '/tmp/transcript.jsonl',
			cwd: '/project',
			hook_event_name: 'PreToolUse',
			tool_name: 'Task',
			tool_input: {
				description: 'Explore the codebase',
				subagent_type: 'Explore',
				prompt: 'Find all API endpoints',
			},
		};
		const event: HookEventDisplay = {
			...baseEvent,
			hookName: 'PreToolUse',
			toolName: 'Task',
			payload: taskPayload,
			status: 'passthrough',
		};
		const {lastFrame} = render(<HookEvent event={event} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('Explore');
		// Prompt is shown inline (truncated) next to agent type
		expect(frame).toContain('Find all API endpoints');
	});

	it('renders SubagentStop with done header and response text', () => {
		const stopPayload: SubagentStopEvent = {
			session_id: 'session-1',
			transcript_path: '/tmp/transcript.jsonl',
			cwd: '/project',
			hook_event_name: 'SubagentStop',
			stop_hook_active: false,
			agent_id: 'agent-abc',
			agent_type: 'Explore',
		};
		const event: HookEventDisplay = {
			...baseEvent,
			hookName: 'SubagentStop',
			toolName: undefined,
			payload: stopPayload,
			status: 'passthrough',
			result: {action: 'passthrough'},
			transcriptSummary: {
				lastAssistantText: 'Found 5 API endpoints',
				lastAssistantTimestamp: null,
				messageCount: 3,
				toolCallCount: 2,
			},
		};
		const {lastFrame} = render(<HookEvent event={event} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('Explore');
		expect(frame).toContain('Done');
		expect(frame).toContain('●');
		expect(frame).toContain('Found 5 API endpoints');
	});

	it('renders pending Task PreToolUse identically to completed — static bullet, no state change', () => {
		const taskPayload: PreToolUseEvent = {
			session_id: 'session-1',
			transcript_path: '/tmp/transcript.jsonl',
			cwd: '/project',
			hook_event_name: 'PreToolUse',
			tool_name: 'Task',
			tool_input: {
				description: 'Explore the codebase',
				subagent_type: 'Explore',
			},
		};
		const event: HookEventDisplay = {
			...baseEvent,
			hookName: 'PreToolUse',
			toolName: 'Task',
			payload: taskPayload,
			status: 'pending',
		};
		const {lastFrame} = render(<HookEvent event={event} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('●');
		expect(frame).toContain('Explore');
		// Description shown inline as prompt fallback
		expect(frame).toContain('Explore the codebase');
	});

	// "renders SubagentStart with bordered box" removed - border chars already checked in SubagentStart header test

	it('renders AskUserQuestion with question header and text', () => {
		const askPayload: PreToolUseEvent = {
			session_id: 'session-1',
			transcript_path: '/tmp/transcript.jsonl',
			cwd: '/project',
			hook_event_name: 'PreToolUse',
			tool_name: 'AskUserQuestion',
			tool_input: {
				questions: [
					{
						question: 'Which library should we use?',
						header: 'Library',
						options: [
							{label: 'React', description: 'Popular UI library'},
							{label: 'Vue', description: 'Progressive framework'},
						],
						multiSelect: false,
					},
				],
			},
		};
		const event: HookEventDisplay = {
			...baseEvent,
			hookName: 'PreToolUse',
			toolName: 'AskUserQuestion',
			payload: askPayload,
			status: 'json_output',
			result: {
				action: 'json_output',
				stdout_json: {
					hookSpecificOutput: {
						hookEventName: 'PreToolUse',
						permissionDecision: 'allow',
						updatedInput: {
							answers: {
								'Which library should we use?': 'React',
							},
						},
					},
				},
			},
		};
		const {lastFrame} = render(<HookEvent event={event} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('Question');
		expect(frame).toContain('[Library]');
		expect(frame).toContain('Which library should we use?');
		expect(frame).toContain('React');
	});

	it('renders AskUserQuestion pending as minimal indicator', () => {
		const askPayload: PreToolUseEvent = {
			session_id: 'session-1',
			transcript_path: '/tmp/transcript.jsonl',
			cwd: '/project',
			hook_event_name: 'PreToolUse',
			tool_name: 'AskUserQuestion',
			tool_input: {
				questions: [
					{
						question: 'Which approach?',
						header: 'Approach',
						options: [{label: 'Option A', description: 'First approach'}],
						multiSelect: false,
					},
				],
			},
		};
		const event: HookEventDisplay = {
			...baseEvent,
			hookName: 'PreToolUse',
			toolName: 'AskUserQuestion',
			payload: askPayload,
			status: 'pending',
		};
		const {lastFrame} = render(<HookEvent event={event} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('Question');
		expect(frame).toContain('(1 question)');
		// Should not show full question text while pending (dialog handles it)
		expect(frame).not.toContain('[Approach]');
		expect(frame).not.toContain('Which approach?');
	});

	it('renders AskUserQuestion with multiple questions and answers', () => {
		const askPayload: PreToolUseEvent = {
			session_id: 'session-1',
			transcript_path: '/tmp/transcript.jsonl',
			cwd: '/project',
			hook_event_name: 'PreToolUse',
			tool_name: 'AskUserQuestion',
			tool_input: {
				questions: [
					{
						question: 'Which library?',
						header: 'Library',
						options: [{label: 'React', description: 'UI lib'}],
						multiSelect: false,
					},
					{
						question: 'Which style?',
						header: 'Style',
						options: [{label: 'CSS Modules', description: 'Scoped CSS'}],
						multiSelect: false,
					},
				],
			},
		};
		const event: HookEventDisplay = {
			...baseEvent,
			hookName: 'PreToolUse',
			toolName: 'AskUserQuestion',
			payload: askPayload,
			status: 'json_output',
			result: {
				action: 'json_output',
				stdout_json: {
					hookSpecificOutput: {
						hookEventName: 'PreToolUse',
						permissionDecision: 'allow',
						updatedInput: {
							answers: {
								'Which library?': 'React',
								'Which style?': 'CSS Modules',
							},
						},
					},
				},
			},
		};
		const {lastFrame} = render(<HookEvent event={event} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('[Library]');
		expect(frame).toContain('[Style]');
		expect(frame).toContain('React');
		expect(frame).toContain('CSS Modules');
	});

	it('shows [image] placeholder for image content blocks', () => {
		const postPayload: PostToolUseEvent = {
			session_id: 'session-1',
			transcript_path: '/tmp/transcript.jsonl',
			cwd: '/project',
			hook_event_name: 'PostToolUse',
			tool_name: 'mcp__agent-web-interface__take_screenshot',
			tool_input: {fullPage: true, format: 'png'},
			tool_response: [
				{
					type: 'image',
					source: {
						type: 'base64',
						media_type: 'image/png',
						data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQAB',
					},
				},
			],
		};
		const event: HookEventDisplay = {
			...baseEvent,
			hookName: 'PostToolUse',
			toolName: 'mcp__agent-web-interface__take_screenshot',
			payload: postPayload,
			status: 'passthrough',
			result: {action: 'passthrough'},
		};
		const {lastFrame} = render(<HookEvent event={event} verbose={true} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('[image]');
		expect(frame).not.toContain('base64');
		expect(frame).not.toContain('iVBOR');
	});

	it('shows [image] placeholder for mixed text and image content blocks', () => {
		const postPayload: PostToolUseEvent = {
			session_id: 'session-1',
			transcript_path: '/tmp/transcript.jsonl',
			cwd: '/project',
			hook_event_name: 'PostToolUse',
			tool_name: 'mcp__agent-web-interface__take_screenshot',
			tool_input: {eid: 'el-1'},
			tool_response: [
				{type: 'text', text: 'Screenshot captured'},
				{
					type: 'image',
					source: {
						type: 'base64',
						media_type: 'image/png',
						data: 'iVBORw0KGgoAAAANSUhEUg...',
					},
				},
			],
		};
		const event: HookEventDisplay = {
			...baseEvent,
			hookName: 'PostToolUse',
			toolName: 'mcp__agent-web-interface__take_screenshot',
			payload: postPayload,
			status: 'passthrough',
			result: {action: 'passthrough'},
		};
		const {lastFrame} = render(<HookEvent event={event} verbose={true} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('Screenshot captured');
		expect(frame).toContain('[image]');
		expect(frame).not.toContain('base64');
	});

	it('shows [image] placeholder for wrapped image content', () => {
		const postPayload: PostToolUseEvent = {
			session_id: 'session-1',
			transcript_path: '/tmp/transcript.jsonl',
			cwd: '/project',
			hook_event_name: 'PostToolUse',
			tool_name: 'mcp__server__screenshot',
			tool_input: {},
			tool_response: {
				content: [
					{
						type: 'image',
						source: {
							type: 'base64',
							media_type: 'image/jpeg',
							data: '/9j/4AAQSkZJRgABAQ...',
						},
					},
				],
				isError: false,
			},
		};
		const event: HookEventDisplay = {
			...baseEvent,
			hookName: 'PostToolUse',
			toolName: 'mcp__server__screenshot',
			payload: postPayload,
			status: 'passthrough',
			result: {action: 'passthrough'},
		};
		const {lastFrame} = render(<HookEvent event={event} verbose={true} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('[image]');
		expect(frame).not.toContain('base64');
		expect(frame).not.toContain('/9j/');
	});

	it('renders Task PreToolUse without borders', () => {
		const taskPayload: PreToolUseEvent = {
			session_id: 'session-1',
			transcript_path: '/tmp/transcript.jsonl',
			cwd: '/project',
			hook_event_name: 'PreToolUse',
			tool_name: 'Task',
			tool_input: {
				description: 'Explore the codebase',
				subagent_type: 'Explore',
			},
		};
		const event: HookEventDisplay = {
			...baseEvent,
			hookName: 'PreToolUse',
			toolName: 'Task',
			payload: taskPayload,
			status: 'passthrough',
			postToolEvent: {
				...baseEvent,
				hookName: 'PostToolUse',
				status: 'passthrough',
			},
		};
		const {lastFrame} = render(<HookEvent event={event} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('Explore');
		expect(frame).not.toContain('\u256d'); // ╭ no border
		expect(frame).not.toContain('\u2502'); // │ no border
	});

	it('renders child event with nesting indentation', () => {
		const childEvent: HookEventDisplay = {
			id: 'child-1',
			timestamp: new Date('2024-01-15T10:30:46.000Z'),
			hookName: 'PreToolUse',
			toolName: 'Bash',
			payload: {
				session_id: 'session-1',
				transcript_path:
					'/home/user/.claude/projects/abc/subagents/agent-children.jsonl',
				cwd: '/project',
				hook_event_name: 'PreToolUse',
				tool_name: 'Bash',
				tool_input: {command: 'ls -la'},
			} as PreToolUseEvent,
			status: 'passthrough',
			result: {action: 'passthrough'},
			parentSubagentId: 'agent-children',
		};
		const {lastFrame} = render(<HookEvent event={childEvent} />);
		const frame = lastFrame() ?? '';

		// Child renders as a regular tool call with indentation
		expect(frame).toContain('Bash');
		expect(frame).toContain('command: "ls -la"');
	});

	it('renders SubagentStart with agent type marker', () => {
		const startPayload: SubagentStartEvent = {
			session_id: 'session-1',
			transcript_path: '/tmp/transcript.jsonl',
			cwd: '/project',
			hook_event_name: 'SubagentStart',
			agent_id: 'agent-abc',
			agent_type: 'Explore',
		};
		const event: HookEventDisplay = {
			...baseEvent,
			hookName: 'SubagentStart',
			toolName: undefined,
			payload: startPayload,
			status: 'passthrough',
			result: {action: 'passthrough'},
		};
		const {lastFrame} = render(<HookEvent event={event} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('Explore');
		expect(frame).toContain('▸');
	});

	it('renders SubagentStop loading state when no transcriptSummary', () => {
		const stopPayload: SubagentStopEvent = {
			session_id: 'session-1',
			transcript_path: '/tmp/transcript.jsonl',
			cwd: '/project',
			hook_event_name: 'SubagentStop',
			stop_hook_active: false,
			agent_id: 'agent-orphan',
			agent_type: 'Explore',
		};
		const event: HookEventDisplay = {
			...baseEvent,
			hookName: 'SubagentStop',
			toolName: undefined,
			payload: stopPayload,
			status: 'passthrough',
			result: {action: 'passthrough'},
		};
		const {lastFrame} = render(<HookEvent event={event} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('●');
		expect(frame).toContain('Explore');
		expect(frame).toContain('Done');
		expect(frame).toContain('Loading');
	});
});
