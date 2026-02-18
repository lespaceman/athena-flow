/** @vitest-environment jsdom */
import {describe, it, expect} from 'vitest';
import {renderHook} from '@testing-library/react';
import {useHeaderMetrics} from '../useHeaderMetrics.js';
import type {FeedEvent} from '../../feed/types.js';

function stub(kind: string, data?: Record<string, unknown>): FeedEvent {
	return {
		event_id: `e-${Math.random()}`,
		seq: 1,
		ts: Date.now(),
		session_id: 's',
		run_id: 'r',
		kind,
		level: 'info',
		actor_id: 'agent:root',
		title: '',
		data: {tool_name: 'Bash', tool_input: {}, ...data},
	} as unknown as FeedEvent;
}

describe('useHeaderMetrics', () => {
	it('counts failures from tool.failure events', () => {
		const events = [
			stub('tool.failure', {error: 'fail1'}),
			stub('tool.failure', {error: 'fail2'}),
		];
		const {result} = renderHook(() => useHeaderMetrics(events));
		expect(result.current.failures).toBe(2);
	});

	it('counts blocks from permission deny and stop block', () => {
		const events = [
			stub('permission.decision', {decision_type: 'deny'}),
			stub('stop.decision', {decision_type: 'block', reason: 'blocked'}),
		];
		const {result} = renderHook(() => useHeaderMetrics(events));
		expect(result.current.blocks).toBe(2);
	});

	it('returns zero for failures and blocks when none exist', () => {
		const events = [stub('tool.pre')];
		const {result} = renderHook(() => useHeaderMetrics(events));
		expect(result.current.failures).toBe(0);
		expect(result.current.blocks).toBe(0);
	});
});
