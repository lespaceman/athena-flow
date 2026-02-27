import React from 'react';
import {describe, it, expect} from 'vitest';
import {render} from 'ink-testing-library';
import SessionEndEvent from './SessionEndEvent';
import type {FeedEvent} from '../feed/types';

function makeSessionEndEvent(
	overrides: Partial<Record<string, unknown>> = {},
): FeedEvent {
	return {
		event_id: 'test-id',
		seq: 1,
		ts: new Date('2025-01-25T10:30:00Z').getTime(),
		session_id: 's1',
		run_id: 's1:R1',
		kind: 'session.end',
		level: 'info',
		actor_id: 'agent:root',
		title: 'Session ended',
		data: {
			reason: 'other',
			...overrides,
		},
	} as FeedEvent;
}

describe('SessionEndEvent', () => {
	it('renders session end header', () => {
		const event = makeSessionEndEvent();
		const {lastFrame} = render(<SessionEndEvent event={event} />);

		expect(lastFrame()).toContain('SessionEnd');
	});

	it('displays session end reason', () => {
		const event = makeSessionEndEvent({reason: 'logout'});
		const {lastFrame} = render(<SessionEndEvent event={event} />);

		expect(lastFrame()).toContain('Reason:');
		expect(lastFrame()).toContain('logout');
	});

	it('displays unknown reason when not a session.end event', () => {
		const event = {
			event_id: 'test-id',
			seq: 1,
			ts: Date.now(),
			session_id: 's1',
			run_id: 's1:R1',
			kind: 'user.prompt',
			level: 'info',
			actor_id: 'agent:root',
			title: 'test',
			data: {prompt: 'hello', cwd: '/'},
		} as FeedEvent;
		const {lastFrame} = render(<SessionEndEvent event={event} />);

		expect(lastFrame()).toContain('unknown');
	});
});
