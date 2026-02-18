import React from 'react';
import {describe, it, expect} from 'vitest';
import {render} from 'ink-testing-library';
import stripAnsi from 'strip-ansi';
import stringWidth from 'string-width';
import UnifiedToolCallEvent from './UnifiedToolCallEvent.js';
import type {FeedEvent} from '../feed/types.js';

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

describe('UnifiedToolCallEvent', () => {
	it('renders header with bullet and tool name', () => {
		const event = makeFeedEvent('tool.pre', {
			tool_name: 'Bash',
			tool_input: {command: 'echo "hello world"'},
		});
		const {lastFrame} = render(<UnifiedToolCallEvent event={event} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('\u25cf'); // ● bullet
		expect(frame).toContain('Bash');
	});

	it('truncates header line to terminal width', () => {
		const originalColumns = process.stdout.columns;
		Object.defineProperty(process.stdout, 'columns', {
			value: 40,
			writable: true,
		});

		const event = makeFeedEvent('tool.pre', {
			tool_name: 'Bash',
			tool_input: {command: 'a'.repeat(200)},
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

	it('returns null for non-tool.pre/permission.request events', () => {
		const event = makeFeedEvent('tool.post', {
			tool_name: 'Bash',
			tool_input: {command: 'echo "hello"'},
			tool_response: 'hello',
		});
		const {lastFrame} = render(<UnifiedToolCallEvent event={event} />);
		expect(lastFrame()).toBe('');
	});

	it('shows raw JSON in verbose mode', () => {
		const event = makeFeedEvent('tool.pre', {
			tool_name: 'Bash',
			tool_input: {command: 'echo "hello world"'},
		});
		const {lastFrame} = render(<UnifiedToolCallEvent event={event} verbose />);
		const frame = lastFrame() ?? '';
		expect(frame).toContain('echo "hello world"');
	});
});
