import React from 'react';
import {describe, it, expect} from 'vitest';
import {render} from 'ink-testing-library';
import stripAnsi from 'strip-ansi';
import stringWidth from 'string-width';
import UnifiedToolCallEvent from './UnifiedToolCallEvent.js';
import type {
	HookEventDisplay,
	PreToolUseEvent,
	PostToolUseEvent,
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
		event_id: 'test-1',
		timestamp: new Date('2024-01-15T10:30:45.000Z'),
		hookName: 'PreToolUse',
		toolName: 'Bash',
		payload,
		status: 'passthrough',
		...overrides,
	};
}

describe('UnifiedToolCallEvent', () => {
	it('renders header with bullet and tool name', () => {
		const event = makePreToolEvent();
		const {lastFrame} = render(<UnifiedToolCallEvent event={event} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('\u25cf'); // ● bullet
		expect(frame).toContain('Bash');
	});

	it('renders blocked state with User rejected', () => {
		const event = makePreToolEvent({status: 'blocked'});
		const {lastFrame} = render(<UnifiedToolCallEvent event={event} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('\u25cf');
		expect(frame).toContain('User rejected');
	});

	it('truncates header line to terminal width', () => {
		const originalColumns = process.stdout.columns;
		Object.defineProperty(process.stdout, 'columns', {
			value: 40,
			writable: true,
		});

		const event = makePreToolEvent({
			payload: {
				session_id: 'session-1',
				transcript_path: '/tmp/transcript.jsonl',
				cwd: '/project',
				hook_event_name: 'PreToolUse',
				tool_name: 'Bash',
				tool_input: {command: 'a'.repeat(200)},
			} as PreToolUseEvent,
		});
		const {lastFrame} = render(<UnifiedToolCallEvent event={event} />);
		const lines = (lastFrame() ?? '').split('\n');
		const headerWidth = stringWidth(stripAnsi(lines[0]!));
		expect(headerWidth).toBeLessThanOrEqual(40);

		Object.defineProperty(process.stdout, 'columns', {
			value: originalColumns,
			writable: true,
		});
	});

	it('returns null for non-PreToolUse payloads', () => {
		const postPayload: PostToolUseEvent = {
			session_id: 'session-1',
			transcript_path: '/tmp/transcript.jsonl',
			cwd: '/project',
			hook_event_name: 'PostToolUse',
			tool_name: 'Bash',
			tool_input: {command: 'echo "hello"'},
			tool_response: 'hello',
		};
		const event: HookEventDisplay = {
			id: 'test-2',
			event_id: 'test-2',
			timestamp: new Date(),
			hookName: 'PostToolUse',
			toolName: 'Bash',
			payload: postPayload,
			status: 'passthrough',
		};
		const {lastFrame} = render(<UnifiedToolCallEvent event={event} />);
		// Should render nothing
		expect(lastFrame()).toBe('');
	});

	it('shows raw JSON in verbose mode', () => {
		const event = makePreToolEvent();
		const {lastFrame} = render(<UnifiedToolCallEvent event={event} verbose />);
		const frame = lastFrame() ?? '';
		expect(frame).toContain('echo "hello world"');
	});
});
