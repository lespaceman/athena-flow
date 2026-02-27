import {describe, it, expect} from 'vitest';
import {mergeFeedItems} from '../../core/feed/items';
import type {FeedEvent} from '../../core/feed/types';
import type {Message} from '../../shared/types/common';

// invariant-waiver: #2 (mapper is sole constructor) — test helper for ordering tests
function makeFeedEvent(
	seq: number,
	kind: FeedEvent['kind'] = 'notification',
): FeedEvent {
	return {
		event_id: `evt-${seq}`,
		seq,
		ts: Date.now(),
		session_id: 's1',
		run_id: 's1:R1',
		kind,
		level: 'info',
		actor_id: 'agent:root',
		title: 'test',
		data: {message: `event ${seq}`},
	} as FeedEvent;
}

function makeMessage(seq: number, content: string): Message {
	return {
		id: `msg-${seq}`,
		role: 'user',
		content,
		timestamp: new Date(),
		seq,
	};
}

describe('mergeFeedItems', () => {
	it('interleaves messages and feed events by seq', () => {
		const messages: Message[] = [
			makeMessage(1, 'hello'),
			makeMessage(5, 'world'),
		];
		const feedEvents: FeedEvent[] = [
			makeFeedEvent(2),
			makeFeedEvent(3),
			makeFeedEvent(4),
			makeFeedEvent(6),
		];

		const items = mergeFeedItems(messages, feedEvents);

		// Expected order: msg(1), feed(2), feed(3), feed(4), msg(5), feed(6)
		expect(
			items.map(i =>
				i.type === 'message' ? `msg:${i.data.seq}` : `feed:${i.data.seq}`,
			),
		).toEqual(['msg:1', 'feed:2', 'feed:3', 'feed:4', 'msg:5', 'feed:6']);
	});

	it('places messages before feed events with same seq', () => {
		const messages: Message[] = [makeMessage(1, 'prompt')];
		const feedEvents: FeedEvent[] = [makeFeedEvent(1)];

		const items = mergeFeedItems(messages, feedEvents);
		expect(items[0]!.type).toBe('message');
		expect(items[1]!.type).toBe('feed');
	});

	it('returns empty array when both inputs empty', () => {
		expect(mergeFeedItems([], [])).toEqual([]);
	});
});
