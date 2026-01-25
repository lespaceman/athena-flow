import React from 'react';
import {describe, it, expect} from 'vitest';
import {render} from 'ink-testing-library';
import SessionEndEvent from './SessionEndEvent.js';
import {type HookEventDisplay} from '../types/hooks.js';

const createSessionEndEvent = (
	overrides: Partial<HookEventDisplay> = {},
): HookEventDisplay => ({
	id: 'test-id',
	requestId: 'req-123',
	timestamp: new Date('2025-01-25T10:30:00Z'),
	hookName: 'SessionEnd',
	payload: {
		session_id: 'session-123',
		transcript_path: '/path/to/transcript.jsonl',
		cwd: '/home/user/project',
		hook_event_name: 'SessionEnd',
		session_type: 'interactive',
	},
	status: 'passthrough',
	...overrides,
});

describe('SessionEndEvent', () => {
	it('renders session end header with status', () => {
		const event = createSessionEndEvent();
		const {lastFrame} = render(<SessionEndEvent event={event} />);

		expect(lastFrame()).toContain('SessionEnd');
		expect(lastFrame()).toContain('passthrough');
	});

	it('displays session type', () => {
		const event = createSessionEndEvent({
			payload: {
				session_id: 'session-123',
				transcript_path: '/path/to/transcript.jsonl',
				cwd: '/home/user/project',
				hook_event_name: 'SessionEnd',
				session_type: 'headless',
			},
		});
		const {lastFrame} = render(<SessionEndEvent event={event} />);

		expect(lastFrame()).toContain('Session type:');
		expect(lastFrame()).toContain('headless');
	});

	it('displays loading state when transcript summary is not available', () => {
		const event = createSessionEndEvent({
			transcriptSummary: undefined,
		});
		const {lastFrame} = render(<SessionEndEvent event={event} />);

		expect(lastFrame()).toContain('Loading transcript...');
	});

	it('displays message and tool call counts', () => {
		const event = createSessionEndEvent({
			transcriptSummary: {
				lastAssistantText: 'Hello!',
				lastAssistantTimestamp: new Date(),
				messageCount: 5,
				toolCallCount: 3,
			},
		});
		const {lastFrame} = render(<SessionEndEvent event={event} />);

		expect(lastFrame()).toContain('Messages: 5');
		expect(lastFrame()).toContain('Tool calls: 3');
	});

	it('displays Claude last response when available', () => {
		const event = createSessionEndEvent({
			transcriptSummary: {
				lastAssistantText: 'This is the final response from Claude.',
				lastAssistantTimestamp: new Date(),
				messageCount: 2,
				toolCallCount: 0,
			},
		});
		const {lastFrame} = render(<SessionEndEvent event={event} />);

		expect(lastFrame()).toContain("Claude's last response:");
		expect(lastFrame()).toContain('This is the final response from Claude.');
	});

	it('displays error message when transcript parsing fails', () => {
		const event = createSessionEndEvent({
			transcriptSummary: {
				lastAssistantText: null,
				lastAssistantTimestamp: null,
				messageCount: 0,
				toolCallCount: 0,
				error: 'Transcript not available',
			},
		});
		const {lastFrame} = render(<SessionEndEvent event={event} />);

		expect(lastFrame()).toContain('Transcript not available');
	});

	it('does not display stats when there is an error', () => {
		const event = createSessionEndEvent({
			transcriptSummary: {
				lastAssistantText: null,
				lastAssistantTimestamp: null,
				messageCount: 0,
				toolCallCount: 0,
				error: 'Could not parse transcript',
			},
		});
		const {lastFrame} = render(<SessionEndEvent event={event} />);

		// Should not show "Messages: 0" when there's an error
		expect(lastFrame()).not.toContain('Messages:');
	});

	it('handles pending status', () => {
		const event = createSessionEndEvent({
			status: 'pending',
		});
		const {lastFrame} = render(<SessionEndEvent event={event} />);

		expect(lastFrame()).toContain('SessionEnd');
		// Pending status does not show "(pending)" text after event name
		expect(lastFrame()).not.toContain('(pending)');
	});

	it('displays unknown session type when not provided', () => {
		const event = createSessionEndEvent({
			payload: {
				session_id: 'session-123',
				transcript_path: '/path/to/transcript.jsonl',
				cwd: '/home/user/project',
				hook_event_name: 'SessionEnd',
				// session_type omitted
			},
		});
		const {lastFrame} = render(<SessionEndEvent event={event} />);

		expect(lastFrame()).toContain('unknown');
	});

	it('handles multiline last response', () => {
		const event = createSessionEndEvent({
			transcriptSummary: {
				lastAssistantText: 'Line 1\nLine 2\nLine 3',
				lastAssistantTimestamp: new Date(),
				messageCount: 1,
				toolCallCount: 0,
			},
		});
		const {lastFrame} = render(<SessionEndEvent event={event} />);

		expect(lastFrame()).toContain('Line 1');
		expect(lastFrame()).toContain('Line 2');
		expect(lastFrame()).toContain('Line 3');
	});
});
