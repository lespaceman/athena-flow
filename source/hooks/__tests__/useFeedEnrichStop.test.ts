import {describe, it, expect, vi, beforeEach} from 'vitest';
import {enrichStopEvent} from '../useFeed.js';
import type {FeedEvent} from '../../feed/types.js';

vi.mock('../../utils/parseTranscriptTail.js', () => ({
	parseTranscriptTail: vi.fn(),
}));

import {parseTranscriptTail} from '../../utils/parseTranscriptTail.js';

describe('enrichStopEvent', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('creates agent.message from stop.request with transcript', async () => {
		vi.mocked(parseTranscriptTail).mockResolvedValue('Final answer text');

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
			data: {stop_hook_active: false, scope: 'root'},
		} as unknown as FeedEvent;

		const result = await enrichStopEvent(stopEvent);
		expect(result).not.toBeNull();
		expect(result!.kind).toBe('agent.message');
		expect(result!.data.message).toBe('Final answer text');
		expect(result!.data.scope).toBe('root');
		expect(result!.actor_id).toBe('agent:root');
		expect(result!.cause?.parent_event_id).toBe('R1:E5');
	});

	it('returns null when transcript parsing finds nothing', async () => {
		vi.mocked(parseTranscriptTail).mockResolvedValue(null);

		const stopEvent = {
			event_id: 'R1:E5',
			kind: 'stop.request',
			cause: {transcript_path: '/tmp/t.jsonl'},
			data: {stop_hook_active: false, scope: 'root'},
		} as unknown as FeedEvent;

		const result = await enrichStopEvent(stopEvent);
		expect(result).toBeNull();
	});

	it('returns null when no transcript path', async () => {
		const stopEvent = {
			event_id: 'R1:E5',
			kind: 'stop.request',
			cause: {},
			data: {stop_hook_active: false, scope: 'root'},
		} as unknown as FeedEvent;

		const result = await enrichStopEvent(stopEvent);
		expect(result).toBeNull();
		expect(parseTranscriptTail).not.toHaveBeenCalled();
	});
});
