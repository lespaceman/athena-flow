/** @vitest-environment jsdom */
import {describe, it, expect, vi} from 'vitest';
import {renderHook, act} from '@testing-library/react';
import {useFeed} from '../../../hooks/useFeed';
import type {
	Runtime,
	RuntimeEvent,
	RuntimeDecision,
	RuntimeEventHandler,
	RuntimeDecisionHandler,
} from '../../../core/runtime/types';

function createMockRuntime(): Runtime & {
	emitEvent: (event: RuntimeEvent) => void;
	emitDecision: (eventId: string, decision: RuntimeDecision) => void;
} {
	const eventListeners: RuntimeEventHandler[] = [];
	const decisionListeners: RuntimeDecisionHandler[] = [];

	return {
		onEvent: cb => {
			eventListeners.push(cb);
			return () => {
				eventListeners.splice(eventListeners.indexOf(cb), 1);
			};
		},
		onDecision: cb => {
			decisionListeners.push(cb);
			return () => {
				decisionListeners.splice(decisionListeners.indexOf(cb), 1);
			};
		},
		sendDecision: vi.fn(),
		start: vi.fn(),
		stop: vi.fn(),
		getStatus: () => 'running' as const,
		emitEvent: event => eventListeners.forEach(cb => cb(event)),
		emitDecision: (eventId, decision) =>
			decisionListeners.forEach(cb => cb(eventId, decision)),
	};
}

function makePermissionEvent(requestId: string): RuntimeEvent {
	return {
		id: requestId,
		timestamp: Date.now(),
		hookName: 'PermissionRequest',
		sessionId: 'test-session',
		toolName: 'Bash',
		context: {cwd: '/test', transcriptPath: '/test/transcript.jsonl'},
		interaction: {expectsDecision: true},
		payload: {
			hook_event_name: 'PermissionRequest',
			session_id: 'test-session',
			transcript_path: '/test/transcript.jsonl',
			cwd: '/test',
			tool_name: 'Bash',
			tool_input: {command: 'ls'},
		},
	};
}

describe('useFeed permission auto-dequeue', () => {
	it('dequeues permission when decision event arrives via onDecision', () => {
		const runtime = createMockRuntime();
		const {result} = renderHook(() => useFeed(runtime));

		// Emit a permission request event
		act(() => {
			runtime.emitEvent(makePermissionEvent('req-1'));
		});

		// Should have 1 permission in queue
		expect(result.current.permissionQueueCount).toBe(1);

		// Emit a decision for this request
		act(() => {
			runtime.emitDecision('req-1', {
				type: 'passthrough',
				source: 'timeout',
			});
		});

		// Queue should be empty now
		expect(result.current.permissionQueueCount).toBe(0);
	});
});
