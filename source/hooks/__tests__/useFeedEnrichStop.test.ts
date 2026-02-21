import {describe, it, expect} from 'vitest';
import {enrichStopEvent} from '../useFeed.js';
import type {FeedEvent} from '../../feed/types.js';

describe('enrichStopEvent', () => {
	it('creates agent.message from stop.request with last_assistant_message', () => {
		const stopEvent = {
			event_id: 'R1:E5',
			seq: 5,
			ts: 1000,
			session_id: 'sess-1',
			run_id: 'R1',
			kind: 'stop.request',
			level: 'info',
			actor_id: 'system',
			title: 'Stop requested',
			cause: {transcript_path: '/tmp/t.jsonl'},
			data: {
				stop_hook_active: false,
				scope: 'root',
				last_assistant_message: 'Final answer text',
			},
		} as unknown as FeedEvent;

		const result = enrichStopEvent(stopEvent);
		expect(result).not.toBeNull();
		expect(result!.kind).toBe('agent.message');
		expect(result!.data.message).toBe('Final answer text');
		expect(result!.data.source).toBe('hook');
		expect(result!.data.scope).toBe('root');
		expect(result!.actor_id).toBe('agent:root');
		expect(result!.cause?.parent_event_id).toBe('R1:E5');
	});

	it('creates agent.message from subagent.stop with last_assistant_message', () => {
		const stopEvent = {
			event_id: 'R1:E8',
			seq: 8,
			ts: 2000,
			session_id: 'sess-1',
			run_id: 'R1',
			kind: 'subagent.stop',
			level: 'info',
			actor_id: 'subagent:abc',
			title: 'Subagent stopped',
			cause: {transcript_path: '/tmp/sub.jsonl'},
			data: {
				agent_id: 'abc',
				agent_type: 'task',
				stop_hook_active: false,
				last_assistant_message: 'Subagent result',
			},
		} as unknown as FeedEvent;

		const result = enrichStopEvent(stopEvent);
		expect(result).not.toBeNull();
		expect(result!.kind).toBe('agent.message');
		expect(result!.data.message).toBe('Subagent result');
		expect(result!.data.source).toBe('hook');
		expect(result!.data.scope).toBe('subagent');
		expect(result!.actor_id).toBe('subagent:abc');
	});

	it('returns null when no last_assistant_message', () => {
		const stopEvent = {
			event_id: 'R1:E5',
			kind: 'stop.request',
			cause: {transcript_path: '/tmp/t.jsonl'},
			data: {stop_hook_active: false, scope: 'root'},
		} as unknown as FeedEvent;

		const result = enrichStopEvent(stopEvent);
		expect(result).toBeNull();
	});
});
