import {describe, it, expect} from 'vitest';
import {mapEnvelopeToRuntimeEvent} from '../mapper';
import type {HookEventEnvelope} from '../../protocol/envelope';

function makeEnvelope(
	overrides: Partial<Omit<HookEventEnvelope, 'payload'>> & {
		payload?: Record<string, unknown>;
	} = {},
): HookEventEnvelope {
	const {payload: payloadOverrides, ...rest} = overrides;
	return {
		request_id: 'req-1',
		ts: 1000,
		session_id: 'sess-1',
		hook_event_name: 'PreToolUse' as HookEventEnvelope['hook_event_name'],
		...rest,
		payload: {
			hook_event_name: 'PreToolUse',
			session_id: 'sess-1',
			transcript_path: '/tmp/t.jsonl',
			cwd: '/project',
			tool_name: 'Bash',
			tool_input: {command: 'ls'},
			tool_use_id: 'tu-1',
			...payloadOverrides,
		} as HookEventEnvelope['payload'],
	};
}

describe('mapEnvelopeToRuntimeEvent', () => {
	it('maps basic fields correctly', () => {
		const envelope = makeEnvelope();
		const event = mapEnvelopeToRuntimeEvent(envelope);

		expect(event.id).toBe('req-1');
		expect(event.timestamp).toBe(1000);
		expect(event.hookName).toBe('PreToolUse');
		expect(event.sessionId).toBe('sess-1');
	});

	it('extracts tool-related derived fields', () => {
		const envelope = makeEnvelope();
		const event = mapEnvelopeToRuntimeEvent(envelope);

		expect(event.toolName).toBe('Bash');
		expect(event.toolUseId).toBe('tu-1');
	});

	it('extracts subagent derived fields', () => {
		const envelope = makeEnvelope({
			hook_event_name: 'SubagentStart' as HookEventEnvelope['hook_event_name'],
			payload: {
				hook_event_name: 'SubagentStart',
				session_id: 'sess-1',
				transcript_path: '/tmp/t.jsonl',
				cwd: '/project',
				agent_id: 'agent-1',
				agent_type: 'Explore',
			},
		});
		const event = mapEnvelopeToRuntimeEvent(envelope);

		expect(event.agentId).toBe('agent-1');
		expect(event.agentType).toBe('Explore');
	});

	it('builds context from base fields', () => {
		const envelope = makeEnvelope();
		const event = mapEnvelopeToRuntimeEvent(envelope);

		expect(event.context.cwd).toBe('/project');
		expect(event.context.transcriptPath).toBe('/tmp/t.jsonl');
	});

	it('includes interaction hints', () => {
		const envelope = makeEnvelope();
		const event = mapEnvelopeToRuntimeEvent(envelope);

		expect(event.interaction.expectsDecision).toBe(true);
		expect(event.interaction.canBlock).toBe(true);
	});

	it('wraps non-object payloads', () => {
		const envelope = makeEnvelope();
		// Force a non-object payload for edge case
		(envelope as Record<string, unknown>).payload = 'raw-string';
		const event = mapEnvelopeToRuntimeEvent(envelope);

		expect(event.payload).toEqual({value: 'raw-string'});
	});

	it('handles unknown hook names with safe defaults', () => {
		const envelope = makeEnvelope({
			hook_event_name: 'FutureEvent' as HookEventEnvelope['hook_event_name'],
			payload: {
				hook_event_name: 'FutureEvent',
				session_id: 'sess-1',
				transcript_path: '/tmp/t.jsonl',
				cwd: '/project',
			},
		});
		const event = mapEnvelopeToRuntimeEvent(envelope);

		expect(event.hookName).toBe('FutureEvent');
		expect(event.interaction.expectsDecision).toBe(false);
		expect(event.interaction.canBlock).toBe(false);
	});
});
