import React from 'react';
import {render} from 'ink-testing-library';
import {describe, it, expect} from 'vitest';
import FeedList from '../FeedList';
import type {FeedEvent} from '../../../core/feed/types';
import type {FeedItem} from '../../../core/feed/items';

function stubFeedEvent(id: string, kind: string, title: string): FeedEvent {
	return {
		event_id: id,
		seq: 1,
		ts: Date.now(),
		session_id: 's',
		run_id: 'r',
		kind,
		level: 'info',
		actor_id: 'agent:root',
		title,
		data: {
			tool_name: 'Bash',
			tool_input: {command: 'ls'},
			tool_response: {stdout: 'ok'},
		},
	} as unknown as FeedEvent;
}

function toFeedItems(events: FeedEvent[]): FeedItem[] {
	return events.map(e => ({type: 'feed' as const, data: e}));
}

describe('FEEDLIST_ROW_OVERHEAD', () => {
	it('exports FEEDLIST_ROW_OVERHEAD constant', async () => {
		const {FEEDLIST_ROW_OVERHEAD} = await import('../FeedList');
		expect(FEEDLIST_ROW_OVERHEAD).toBe(4);
	});
});

describe('FeedList', () => {
	it('renders feed events', () => {
		const events = [
			stubFeedEvent('E1', 'tool.pre', 'Bash(ls)'),
			stubFeedEvent('E2', 'tool.post', 'ok'),
		];
		const {lastFrame} = render(
			<FeedList
				items={toFeedItems(events)}
				focusedId={undefined}
				expandedSet={new Set()}
				dialogActive={false}
			/>,
		);
		expect(lastFrame()).toContain('Bash');
	});

	it('suppresses cursor when dialogActive is true', () => {
		const events = [stubFeedEvent('E1', 'tool.pre', 'Bash(ls)')];
		const {lastFrame} = render(
			<FeedList
				items={toFeedItems(events)}
				focusedId="E1"
				expandedSet={new Set()}
				dialogActive={true}
			/>,
		);
		expect(lastFrame()).not.toContain('›');
	});

	it('shows cursor indicator on focused expandable row', () => {
		const events = [stubFeedEvent('E1', 'tool.pre', 'Bash(ls)')];
		const {lastFrame} = render(
			<FeedList
				items={toFeedItems(events)}
				focusedId="E1"
				expandedSet={new Set()}
				dialogActive={false}
			/>,
		);
		expect(lastFrame()).toContain('›');
	});

	it('shows expand affordance on expandable rows', () => {
		const events = [stubFeedEvent('E1', 'tool.pre', 'Bash(ls)')];
		const {lastFrame} = render(
			<FeedList
				items={toFeedItems(events)}
				focusedId={undefined}
				expandedSet={new Set()}
				dialogActive={false}
			/>,
		);
		expect(lastFrame()).toContain('▸');
	});

	it('shows collapse indicator when expanded', () => {
		const events = [stubFeedEvent('E1', 'tool.pre', 'Bash(ls)')];
		const {lastFrame} = render(
			<FeedList
				items={toFeedItems(events)}
				focusedId={undefined}
				expandedSet={new Set(['E1'])}
				dialogActive={false}
			/>,
		);
		expect(lastFrame()).toContain('▾');
	});

	it('does not show cursor indicator on non-expandable rows', () => {
		const events = [stubFeedEvent('E1', 'tool.post', 'ok')];
		const {lastFrame} = render(
			<FeedList
				items={toFeedItems(events)}
				focusedId="E1"
				expandedSet={new Set()}
				dialogActive={false}
			/>,
		);
		expect(lastFrame()).not.toContain('›');
	});
});
