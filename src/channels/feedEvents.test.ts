import {describe, it, expect} from 'vitest';
import type {ChannelFeedEventInput} from './feedEvents';

/**
 * Drift guard: this file is the channels-layer view of core/feed payload
 * shapes. If a `core/feed/types.ts` data type changes (rename, removal,
 * required-field added), these constructions fail to typecheck and the
 * compile errors point here.
 *
 * Tests are runtime no-ops; the assertions are the construction expressions.
 */
describe('ChannelFeedEventInput shape compatibility with core/feed', () => {
	it('builds channel.permission.relayed', () => {
		const ev: ChannelFeedEventInput = {
			kind: 'channel.permission.relayed',
			data: {
				channel_name: 'telegram',
				channel_request_id: 'abcde',
				tool_name: 'Bash',
			},
		};
		expect(ev.kind).toBe('channel.permission.relayed');
	});

	it('builds channel.permission.resolved with all sources', () => {
		const sources = ['local', 'channel', 'rule', 'timeout'] as const;
		for (const source of sources) {
			const ev: ChannelFeedEventInput = {
				kind: 'channel.permission.resolved',
				data: {
					channel_name: source === 'channel' ? 'telegram' : '',
					channel_request_id: 'abcde',
					source,
					tool_name: 'Bash',
					behavior: source === 'timeout' ? null : 'allow',
				},
			};
			expect(ev.data.source).toBe(source);
		}
	});

	it('builds channel.question.relayed', () => {
		const ev: ChannelFeedEventInput = {
			kind: 'channel.question.relayed',
			data: {
				channel_name: 'telegram',
				channel_request_id: 'abcde',
				title: 'Confirm?',
			},
		};
		expect(ev.data.title).toBe('Confirm?');
	});

	it('builds channel.question.resolved with answers map', () => {
		const ev: ChannelFeedEventInput = {
			kind: 'channel.question.resolved',
			data: {
				channel_name: 'telegram',
				channel_request_id: 'abcde',
				source: 'channel',
				title: 'Confirm?',
				answers: {confirm: 'yes'},
			},
		};
		expect(ev.data.answers).toEqual({confirm: 'yes'});
	});

	it('builds channel.chat.inbound', () => {
		const ev: ChannelFeedEventInput = {
			kind: 'channel.chat.inbound',
			data: {
				channel_name: 'telegram',
				sender_id: '12345',
				content: 'hello',
			},
		};
		expect(ev.data.sender_id).toBe('12345');
	});
});
