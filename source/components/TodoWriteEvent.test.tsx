import React from 'react';
import {describe, it, expect} from 'vitest';
import {render} from 'ink-testing-library';
import TodoWriteEvent from './TodoWriteEvent.js';
import type {HookEventDisplay, PreToolUseEvent} from '../types/hooks/index.js';

describe('TodoWriteEvent', () => {
	const basePayload: PreToolUseEvent = {
		session_id: 'session-1',
		transcript_path: '/tmp/transcript.jsonl',
		cwd: '/project',
		hook_event_name: 'PreToolUse',
		tool_name: 'TodoWrite',
		tool_input: {
			todos: [
				{content: 'Install dependencies', status: 'completed'},
				{
					content: 'Write tests',
					status: 'in_progress',
					activeForm: 'Writing tests',
				},
				{content: 'Deploy', status: 'pending'},
			],
		},
	};

	const baseEvent: HookEventDisplay = {
		id: 'todo-1',
		requestId: 'req-1',
		timestamp: new Date('2024-01-15T10:30:45.000Z'),
		hookName: 'PreToolUse',
		toolName: 'TodoWrite',
		payload: basePayload,
		status: 'passthrough',
	};

	it('renders "Tasks" header with status symbol', () => {
		const {lastFrame} = render(<TodoWriteEvent event={baseEvent} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('Tasks');
		expect(frame).toContain('\u25cf'); // ● symbol for passthrough
	});

	it('renders each todo item content text', () => {
		const {lastFrame} = render(<TodoWriteEvent event={baseEvent} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('Install dependencies');
		expect(frame).toContain('Write tests');
		expect(frame).toContain('Deploy');
	});

	it('handles empty todos array with "(no tasks)" fallback', () => {
		const emptyPayload: PreToolUseEvent = {
			...basePayload,
			tool_input: {todos: []},
		};
		const event: HookEventDisplay = {
			...baseEvent,
			payload: emptyPayload,
		};
		const {lastFrame} = render(<TodoWriteEvent event={event} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('Tasks');
		expect(frame).toContain('(no tasks)');
	});

	it('handles missing todos field with "(no tasks)" fallback', () => {
		const noTodosPayload: PreToolUseEvent = {
			...basePayload,
			tool_input: {},
		};
		const event: HookEventDisplay = {
			...baseEvent,
			payload: noTodosPayload,
		};
		const {lastFrame} = render(<TodoWriteEvent event={event} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('Tasks');
		expect(frame).toContain('(no tasks)');
	});

	it('renders mixed statuses (pending + in_progress + completed)', () => {
		const {lastFrame} = render(<TodoWriteEvent event={baseEvent} />);
		const frame = lastFrame() ?? '';

		// All three items should be present
		expect(frame).toContain('Install dependencies');
		expect(frame).toContain('Write tests');
		expect(frame).toContain('Deploy');
	});

	it('shows activeForm text for in_progress items', () => {
		const {lastFrame} = render(<TodoWriteEvent event={baseEvent} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('Writing tests');
	});

	it('renders pending status with yellow symbol', () => {
		const event: HookEventDisplay = {
			...baseEvent,
			status: 'pending',
		};
		const {lastFrame} = render(<TodoWriteEvent event={event} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('\u25cb'); // ○ symbol for pending
		expect(frame).toContain('Tasks');
	});

	it('returns null for non-PreToolUse payload', () => {
		const event: HookEventDisplay = {
			...baseEvent,
			payload: {
				session_id: 'session-1',
				transcript_path: '/tmp/transcript.jsonl',
				cwd: '/project',
				hook_event_name: 'Notification',
				message: 'not a tool event',
			},
		};
		const {lastFrame} = render(<TodoWriteEvent event={event} />);
		const frame = lastFrame() ?? '';

		expect(frame).toBe('');
	});

	it('handles todos with invalid (non-array) value as "(no tasks)"', () => {
		const badPayload: PreToolUseEvent = {
			...basePayload,
			tool_input: {todos: 'not-an-array'},
		};
		const event: HookEventDisplay = {
			...baseEvent,
			payload: badPayload,
		};
		const {lastFrame} = render(<TodoWriteEvent event={event} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('(no tasks)');
	});
});
