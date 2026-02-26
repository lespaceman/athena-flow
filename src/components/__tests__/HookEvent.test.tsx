import React from 'react';
import {render} from 'ink-testing-library';
import {describe, it, expect} from 'vitest';
import HookEvent from '../HookEvent.js';
import type {FeedEvent} from '../../feed/types.js';

describe('HookEvent expanded prop', () => {
	it('renders without expanded prop (default behavior)', () => {
		const event = {
			event_id: 'E1',
			seq: 1,
			ts: Date.now(),
			session_id: 's',
			run_id: 'r',
			kind: 'tool.post',
			level: 'info',
			actor_id: 'agent:root',
			title: '',
			data: {
				tool_name: 'Bash',
				tool_input: {command: 'echo hi'},
				tool_response: {stdout: 'hi'},
			},
		} as unknown as FeedEvent;
		const {lastFrame} = render(<HookEvent event={event} />);
		expect(lastFrame()).toBeDefined();
	});

	it('accepts expanded prop without error', () => {
		const event = {
			event_id: 'E1',
			seq: 1,
			ts: Date.now(),
			session_id: 's',
			run_id: 'r',
			kind: 'tool.post',
			level: 'info',
			actor_id: 'agent:root',
			title: '',
			data: {
				tool_name: 'Bash',
				tool_input: {command: 'echo hi'},
				tool_response: {stdout: 'hi'},
			},
		} as unknown as FeedEvent;
		const {lastFrame} = render(<HookEvent event={event} expanded={true} />);
		expect(lastFrame()).toBeDefined();
	});

	it('does not show full JSON input on tool.pre without expanded', () => {
		const event = {
			event_id: 'E1',
			seq: 1,
			ts: Date.now(),
			session_id: 's',
			run_id: 'r',
			kind: 'tool.pre',
			level: 'info',
			actor_id: 'agent:root',
			title: '',
			data: {
				tool_name: 'Bash',
				tool_input: {command: 'echo hi'},
			},
		} as unknown as FeedEvent;
		const {lastFrame} = render(<HookEvent event={event} />);
		// Without expanded or verbose, should not show the full JSON block
		expect(lastFrame()).not.toContain('"command"');
	});

	it('shows full JSON input when expanded on tool.pre', () => {
		const event = {
			event_id: 'E1',
			seq: 1,
			ts: Date.now(),
			session_id: 's',
			run_id: 'r',
			kind: 'tool.pre',
			level: 'info',
			actor_id: 'agent:root',
			title: '',
			data: {
				tool_name: 'Bash',
				tool_input: {command: 'echo expanded_test'},
			},
		} as unknown as FeedEvent;
		const {lastFrame} = render(<HookEvent event={event} expanded={true} />);
		// Expanded should show the full JSON with key name
		expect(lastFrame()).toContain('"command"');
	});
});
