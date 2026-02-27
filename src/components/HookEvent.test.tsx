import React from 'react';
import {describe, it, expect} from 'vitest';
import {render} from 'ink-testing-library';
import HookEvent from './HookEvent';
import type {FeedEvent} from '../feed/types';

function makeFeedEvent(
	kind: FeedEvent['kind'],
	data: Record<string, unknown>,
	overrides: Partial<FeedEvent> = {},
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
		...overrides,
	} as FeedEvent;
}

describe('HookEvent', () => {
	it('renders PreToolUse header with inline params', () => {
		const event = makeFeedEvent('tool.pre', {
			tool_name: 'Bash',
			tool_input: {command: 'ls -la'},
		});
		const {lastFrame} = render(<HookEvent event={event} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('Bash');
		expect(frame).toContain('command: "ls -la"');
	});

	it('renders MCP tool name parsed correctly in header', () => {
		const event = makeFeedEvent('tool.pre', {
			tool_name: 'mcp__agent-web-interface__navigate',
			tool_input: {url: 'https://www.google.com'},
		});
		const {lastFrame} = render(<HookEvent event={event} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('navigate');
		expect(frame).toContain('url: "https://www.google.com"');
	});

	it('indents multiline PostToolUse response continuation lines', () => {
		const event = makeFeedEvent('tool.post', {
			tool_name: 'Bash',
			tool_input: {command: 'ls'},
			tool_response: 'line1\nline2\nline3',
		});
		const {lastFrame} = render(<HookEvent event={event} verbose={true} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('line1');
		expect(frame).toContain('line2');
		expect(frame).toContain('line3');
	});

	it('renders non-tool events borderless', () => {
		const event = makeFeedEvent('notification', {
			message: 'Task completed',
			notification_type: 'permission_prompt',
		});
		const {lastFrame} = render(<HookEvent event={event} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('notification');
		expect(frame).not.toContain('\u250c'); // ┌
		expect(frame).not.toContain('\u2500'); // ─
		expect(frame).not.toContain('\u2502'); // │
	});

	it('shows standalone PostToolUse response', () => {
		const event = makeFeedEvent('tool.post', {
			tool_name: 'Bash',
			tool_input: {command: 'echo hi'},
			tool_response: 'hi\n',
		});
		const {lastFrame} = render(<HookEvent event={event} verbose={true} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('hi');
	});

	it('shows PostToolUseFailure error message', () => {
		const event = makeFeedEvent('tool.failure', {
			tool_name: 'Bash',
			tool_input: {command: 'bad-cmd'},
			error: 'command not found',
		});
		const {lastFrame} = render(<HookEvent event={event} verbose={true} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('command not found');
	});

	it('extracts text from content-block array response (MCP tools)', () => {
		const event = makeFeedEvent('tool.post', {
			tool_name: 'mcp__agent-web-interface__navigate',
			tool_input: {url: 'https://example.com'},
			tool_response: [
				{
					type: 'text',
					text: '<node eid="abc123" kind="link">Example Link</node>',
				},
			],
		});
		const {lastFrame} = render(<HookEvent event={event} verbose={true} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('Example Link');
		expect(frame).not.toContain('"type"');
	});

	it('extracts text from single content block response', () => {
		const event = makeFeedEvent('tool.post', {
			tool_name: 'Read',
			tool_input: {file_path: '/tmp/file.txt'},
			tool_response: {type: 'text', text: 'file contents here'},
		});
		const {lastFrame} = render(<HookEvent event={event} verbose={true} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('file contents here');
		expect(frame).not.toContain('"type"');
		expect(frame).not.toContain('type:');
	});

	it('extracts content from wrapped response object', () => {
		const event = makeFeedEvent('tool.post', {
			tool_name: 'mcp__server__action',
			tool_input: {query: 'test'},
			tool_response: {
				content: [{type: 'text', text: 'extracted content'}],
				isError: false,
			},
		});
		const {lastFrame} = render(<HookEvent event={event} verbose={true} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('extracted content');
		expect(frame).not.toContain('isError');
	});

	it('extracts string content from wrapped response', () => {
		const event = makeFeedEvent('tool.post', {
			tool_name: 'Bash',
			tool_input: {command: 'echo hi'},
			tool_response: {content: 'wrapped string content'},
		});
		const {lastFrame} = render(<HookEvent event={event} verbose={true} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('wrapped string content');
		expect(frame).not.toContain('content:');
	});

	it('shows JSON object response as key-value pairs (Write tool)', () => {
		const event = makeFeedEvent('tool.post', {
			tool_name: 'Write',
			tool_input: {file_path: '/tmp/file.txt', content: 'hello'},
			tool_response: {filePath: '/tmp/file.txt', success: true},
		});
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
			const event = makeFeedEvent('tool.post', {
				tool_name: 'Bash',
				tool_input: {command: 'echo'},
				tool_response: tool_response as null | undefined,
			});
			const {lastFrame} = render(<HookEvent event={event} />);
			const frame = lastFrame() ?? '';
			expect(frame).toContain('⎿');
		},
	);

	it('shows notification message preview', () => {
		const event = makeFeedEvent('notification', {
			message: 'Build complete',
			notification_type: 'permission_prompt',
		});
		const {lastFrame} = render(<HookEvent event={event} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('Build complete');
	});

	it('truncates long notification messages', () => {
		const longMessage = 'A'.repeat(250);
		const event = makeFeedEvent('notification', {
			message: longMessage,
		});
		const {lastFrame} = render(<HookEvent event={event} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('...');
		expect(frame).not.toContain(longMessage);
	});

	it('renders tool input JSON when verbose is true', () => {
		const event = makeFeedEvent('tool.pre', {
			tool_name: 'Bash',
			tool_input: {command: 'ls -la'},
		});
		const {lastFrame} = render(<HookEvent event={event} verbose={true} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('command');
		expect(frame).toContain('ls -la');
	});

	it('does not show full payload when verbose prop is omitted', () => {
		const event = makeFeedEvent('tool.pre', {
			tool_name: 'Bash',
			tool_input: {command: 'ls -la'},
		});
		const {lastFrame} = render(<HookEvent event={event} />);
		const frame = lastFrame() ?? '';

		expect(frame).not.toContain('session_id');
	});

	it('shows no preview for non-tool non-notification events', () => {
		const event = makeFeedEvent('stop.request', {
			stop_hook_active: false,
			scope: 'root',
		});
		const {lastFrame} = render(<HookEvent event={event} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('stop.request');
	});

	it('renders PermissionRequest event with tool name and inline params', () => {
		const event = makeFeedEvent('permission.request', {
			tool_name: 'Bash',
			tool_input: {command: 'rm -rf /'},
		});
		const {lastFrame} = render(<HookEvent event={event} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('Bash');
		expect(frame).toContain('command: "rm -rf /"');
	});

	it('renders Task PreToolUse as agent start with subagent_type', () => {
		const event = makeFeedEvent('tool.pre', {
			tool_name: 'Task',
			tool_input: {
				description: 'Explore the codebase',
				subagent_type: 'Explore',
				prompt: 'Find all API endpoints',
			},
		});
		const {lastFrame} = render(<HookEvent event={event} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('Explore');
		expect(frame).toContain('Find all API endpoints');
	});

	it('renders PostToolUse(Task) as combined Done header + result via SubagentResultEvent', () => {
		const event = makeFeedEvent('tool.post', {
			tool_name: 'Task',
			tool_input: {
				description: 'Count files',
				subagent_type: 'Explore',
			},
			tool_response: {
				status: 'completed',
				content: [{type: 'text', text: 'Found 23 files'}],
			},
		});
		const {lastFrame} = render(<HookEvent event={event} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('Explore');
		expect(frame).toContain('Done');
		expect(frame).toContain('●');
		expect(frame).toContain('Found 23 files');
	});

	it('renders pending Task PreToolUse with static bullet', () => {
		const event = makeFeedEvent('tool.pre', {
			tool_name: 'Task',
			tool_input: {
				description: 'Explore the codebase',
				subagent_type: 'Explore',
			},
		});
		const {lastFrame} = render(<HookEvent event={event} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('●');
		expect(frame).toContain('Explore');
		expect(frame).toContain('Explore the codebase');
	});

	it('renders AskUserQuestion with question count', () => {
		const event = makeFeedEvent('tool.pre', {
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
		});
		const {lastFrame} = render(<HookEvent event={event} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('Question');
		expect(frame).toContain('(1 question)');
	});

	it('shows [image] placeholder for image content blocks', () => {
		const event = makeFeedEvent('tool.post', {
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
		});
		const {lastFrame} = render(<HookEvent event={event} verbose={true} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('[image]');
		expect(frame).not.toContain('base64');
		expect(frame).not.toContain('iVBOR');
	});

	it('shows [image] placeholder for mixed text and image content blocks', () => {
		const event = makeFeedEvent('tool.post', {
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
		});
		const {lastFrame} = render(<HookEvent event={event} verbose={true} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('Screenshot captured');
		expect(frame).toContain('[image]');
		expect(frame).not.toContain('base64');
	});

	it('shows [image] placeholder for wrapped image content', () => {
		const event = makeFeedEvent('tool.post', {
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
		});
		const {lastFrame} = render(<HookEvent event={event} verbose={true} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('[image]');
		expect(frame).not.toContain('base64');
		expect(frame).not.toContain('/9j/');
	});

	it('renders Task PreToolUse without borders', () => {
		const event = makeFeedEvent('tool.pre', {
			tool_name: 'Task',
			tool_input: {
				description: 'Explore the codebase',
				subagent_type: 'Explore',
			},
		});
		const {lastFrame} = render(<HookEvent event={event} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('Explore');
		expect(frame).not.toContain('\u256d'); // ╭ no border
		expect(frame).not.toContain('\u2502'); // │ no border
	});

	it('renders SubagentStart with agent type marker', () => {
		const event = makeFeedEvent('subagent.start', {
			agent_id: 'agent-abc',
			agent_type: 'Explore',
		});
		const {lastFrame} = render(<HookEvent event={event} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('Explore');
		expect(frame).toContain('▸');
	});
});
