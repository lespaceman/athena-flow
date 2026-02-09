/** @vitest-environment jsdom */
import {describe, it, expect} from 'vitest';
import {renderHook} from '@testing-library/react';
import {useHeaderMetrics} from './useHeaderMetrics.js';
import type {HookEventDisplay} from '../types/hooks/index.js';

function makeEvent(
	overrides: Partial<HookEventDisplay> & {
		hookName: HookEventDisplay['hookName'];
	},
): HookEventDisplay {
	return {
		id: overrides.id ?? 'evt-1',
		requestId: overrides.requestId ?? 'req-1',
		timestamp: overrides.timestamp ?? new Date('2024-01-15T10:00:00Z'),
		hookName: overrides.hookName,
		toolName: overrides.toolName,
		payload: overrides.payload ?? {
			session_id: 's1',
			transcript_path: '/tmp/t.jsonl',
			cwd: '/project',
			hook_event_name: overrides.hookName,
		},
		status: overrides.status ?? 'passthrough',
		parentSubagentId: overrides.parentSubagentId,
	};
}

describe('useHeaderMetrics', () => {
	it('returns default values for empty events', () => {
		const {result} = renderHook(() => useHeaderMetrics([]));
		expect(result.current).toEqual({
			modelName: null,
			toolCallCount: 0,
			subagentCount: 0,
			subagentMetrics: [],
			permissions: {allowed: 0, denied: 0},
			sessionStartTime: null,
			tokens: {
				input: null,
				output: null,
				cacheRead: null,
				cacheWrite: null,
				total: null,
				contextPercent: null,
			},
		});
	});

	it('extracts model name from SessionStart event', () => {
		const events = [
			makeEvent({
				hookName: 'SessionStart',
				payload: {
					session_id: 's1',
					transcript_path: '/tmp/t.jsonl',
					cwd: '/project',
					hook_event_name: 'SessionStart',
					source: 'startup',
					model: 'claude-opus-4-6',
				},
			}),
		];

		const {result} = renderHook(() => useHeaderMetrics(events));
		expect(result.current.modelName).toBe('claude-opus-4-6');
		expect(result.current.sessionStartTime).toEqual(
			new Date('2024-01-15T10:00:00Z'),
		);
	});

	it('counts top-level PreToolUse events', () => {
		const events = [
			makeEvent({id: 't1', hookName: 'PreToolUse', toolName: 'Bash'}),
			makeEvent({id: 't2', hookName: 'PreToolUse', toolName: 'Read'}),
			makeEvent({
				id: 't3',
				hookName: 'PreToolUse',
				toolName: 'Grep',
				parentSubagentId: 'agent-1',
			}),
		];

		const {result} = renderHook(() => useHeaderMetrics(events));
		// Only top-level (t1, t2) — t3 is a child
		expect(result.current.toolCallCount).toBe(2);
	});

	it('tracks subagent metrics', () => {
		const events = [
			makeEvent({
				id: 'sub-1',
				hookName: 'SubagentStart',
				payload: {
					session_id: 's1',
					transcript_path: '/tmp/t.jsonl',
					cwd: '/project',
					hook_event_name: 'SubagentStart',
					agent_id: 'a1',
					agent_type: 'Explore',
				},
			}),
			makeEvent({
				id: 'child-1',
				hookName: 'PreToolUse',
				toolName: 'Bash',
				parentSubagentId: 'a1',
			}),
			makeEvent({
				id: 'child-2',
				hookName: 'PreToolUse',
				toolName: 'Read',
				parentSubagentId: 'a1',
			}),
		];

		const {result} = renderHook(() => useHeaderMetrics(events));
		expect(result.current.subagentCount).toBe(1);
		expect(result.current.subagentMetrics).toEqual([
			{agentId: 'a1', agentType: 'Explore', toolCallCount: 2, tokenCount: null},
		]);
	});

	it('counts permission outcomes', () => {
		const events = [
			makeEvent({
				id: 'p1',
				hookName: 'PermissionRequest',
				toolName: 'Bash',
				status: 'passthrough',
			}),
			makeEvent({
				id: 'p2',
				hookName: 'PermissionRequest',
				toolName: 'Write',
				status: 'blocked',
			}),
			makeEvent({
				id: 'p3',
				hookName: 'PermissionRequest',
				toolName: 'Edit',
				status: 'json_output',
			}),
			makeEvent({
				id: 'p4',
				hookName: 'PermissionRequest',
				toolName: 'Bash',
				status: 'pending',
			}),
		];

		const {result} = renderHook(() => useHeaderMetrics(events));
		// p1 = allowed, p2 = denied, p3 = allowed, p4 = pending (not counted)
		expect(result.current.permissions).toEqual({allowed: 2, denied: 1});
	});

	it('ignores child SubagentStart events', () => {
		const events = [
			makeEvent({
				id: 'nested-sub',
				hookName: 'SubagentStart',
				parentSubagentId: 'parent-agent',
				payload: {
					session_id: 's1',
					transcript_path: '/tmp/t.jsonl',
					cwd: '/project',
					hook_event_name: 'SubagentStart',
					agent_id: 'nested-1',
					agent_type: 'Plan',
				},
			}),
		];

		const {result} = renderHook(() => useHeaderMetrics(events));
		expect(result.current.subagentCount).toBe(0);
	});

	it('all token fields are null (data not yet available)', () => {
		const events = [makeEvent({hookName: 'PreToolUse', toolName: 'Bash'})];

		const {result} = renderHook(() => useHeaderMetrics(events));
		expect(result.current.tokens.input).toBeNull();
		expect(result.current.tokens.output).toBeNull();
		expect(result.current.tokens.total).toBeNull();
		expect(result.current.tokens.contextPercent).toBeNull();
	});
});
