import React from 'react';
import {render} from 'ink-testing-library';
import {describe, it, expect} from 'vitest';
import UnifiedToolCallEvent from '../UnifiedToolCallEvent.js';
import type {FeedEvent} from '../../feed/types.js';

function stubToolPre(toolInput: Record<string, unknown>): FeedEvent {
	return {
		event_id: 'E1',
		seq: 1,
		ts: Date.now(),
		session_id: 's',
		run_id: 'r',
		kind: 'tool.pre',
		level: 'info',
		actor_id: 'agent:root',
		title: 'Bash(cmd)',
		data: {tool_name: 'Bash', tool_input: toolInput},
	} as unknown as FeedEvent;
}

describe('UnifiedToolCallEvent', () => {
	it('caps expanded JSON output to MAX_EXPANDED_LINES', () => {
		const bigInput: Record<string, string> = {};
		for (let i = 0; i < 100; i++) {
			bigInput[`key_${i}`] = `value_${i}`;
		}
		const event = stubToolPre(bigInput);

		const {lastFrame} = render(
			<UnifiedToolCallEvent event={event} expanded={true} />,
		);
		const frame = lastFrame() ?? '';
		const lines = frame.split('\n');

		expect(frame).toContain('more lines');
		expect(lines.length).toBeLessThan(60);
	});

	it('shows full JSON when within line limit', () => {
		const event = stubToolPre({command: 'ls -la'});

		const {lastFrame} = render(
			<UnifiedToolCallEvent event={event} expanded={true} />,
		);
		const frame = lastFrame() ?? '';
		expect(frame).not.toContain('more lines');
		expect(frame).toContain('ls -la');
	});
});
