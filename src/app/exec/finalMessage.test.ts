import {describe, it, expect} from 'vitest';
import {
	createAssistantMessageAccumulator,
	findLastMappedAgentMessage,
	resolveFinalMessage,
} from './finalMessage';
import type {FeedEvent} from '../../core/feed/types';

describe('createAssistantMessageAccumulator', () => {
	it('extracts assistant text from message events', () => {
		const acc = createAssistantMessageAccumulator();
		acc.feed(
			JSON.stringify({
				type: 'message',
				role: 'assistant',
				content: [{type: 'text', text: 'hello world'}],
			}) + '\n',
		);

		expect(acc.getLastMessage()).toBe('hello world');
	});

	it('extracts assistant text from assistant envelope events', () => {
		const acc = createAssistantMessageAccumulator();
		acc.feed(
			JSON.stringify({
				type: 'assistant',
				message: {
					type: 'message',
					role: 'assistant',
					content: [{type: 'text', text: 'from envelope'}],
				},
			}) + '\n',
		);

		expect(acc.getLastMessage()).toBe('from envelope');
	});

	it('ignores subagent assistant messages', () => {
		const acc = createAssistantMessageAccumulator();
		acc.feed(
			JSON.stringify({
				type: 'message',
				role: 'assistant',
				parent_tool_use_id: 'toolu_123',
				content: [{type: 'text', text: 'subagent'}],
			}) + '\n',
		);

		expect(acc.getLastMessage()).toBeNull();
	});

	it('supports chunked input and flush', () => {
		const acc = createAssistantMessageAccumulator();
		const line = JSON.stringify({
			type: 'message',
			role: 'assistant',
			content: [{type: 'text', text: 'chunked'}],
		});

		acc.feed(line.slice(0, 10));
		acc.feed(line.slice(10));
		expect(acc.getLastMessage()).toBeNull();

		acc.feed('\n');
		expect(acc.getLastMessage()).toBe('chunked');
	});
});

describe('findLastMappedAgentMessage', () => {
	it('returns latest mapped agent message', () => {
		const feed = [
			{
				kind: 'notification',
				data: {message: 'x'},
			} as unknown as FeedEvent,
			{
				kind: 'agent.message',
				data: {message: 'first', source: 'hook', scope: 'root'},
			} as unknown as FeedEvent,
			{
				kind: 'agent.message',
				data: {message: 'second', source: 'hook', scope: 'root'},
			} as unknown as FeedEvent,
		];

		expect(findLastMappedAgentMessage(feed)).toBe('second');
	});
});

describe('resolveFinalMessage', () => {
	it('prefers stream-derived message', () => {
		expect(
			resolveFinalMessage({
				streamMessage: 'stream',
				mappedMessage: 'mapped',
			}),
		).toEqual({message: 'stream', source: 'stream'});
	});

	it('falls back to mapped message', () => {
		expect(
			resolveFinalMessage({
				streamMessage: null,
				mappedMessage: 'mapped',
			}),
		).toEqual({message: 'mapped', source: 'mapped'});
	});

	it('returns empty when nothing is available', () => {
		expect(
			resolveFinalMessage({
				streamMessage: null,
				mappedMessage: null,
			}),
		).toEqual({message: '', source: 'empty'});
	});
});
