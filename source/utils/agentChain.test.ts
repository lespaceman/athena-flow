import {describe, it, expect} from 'vitest';
import {getAgentChain} from './agentChain.js';
import {type HookEventDisplay} from '../types/hooks/display.js';

describe('getAgentChain', () => {
	it('returns empty array when parentSubagentId is undefined', () => {
		expect(getAgentChain([], undefined)).toEqual([]);
	});

	it('returns ["main"] when subagent not found in events', () => {
		expect(getAgentChain([], 'agent-123')).toEqual(['main']);
	});

	it('returns chain with agent type when SubagentStart event found', () => {
		const events: HookEventDisplay[] = [
			{
				id: '1',
				requestId: 'r1',
				timestamp: new Date(),
				hookName: 'SubagentStart',
				payload: {
					hook_event_name: 'SubagentStart',
					agent_id: 'agent-123',
					agent_type: 'web-explorer',
					session_id: 's1',
					transcript_path: '/t',
					cwd: '/',
				},
				status: 'passthrough',
			},
		];
		expect(getAgentChain(events, 'agent-123')).toEqual([
			'main',
			'web-explorer',
		]);
	});

	it('returns ["main"] when SubagentStart event has no agent_type', () => {
		const events: HookEventDisplay[] = [
			{
				id: '1',
				requestId: 'r1',
				timestamp: new Date(),
				hookName: 'SubagentStart',
				payload: {
					hook_event_name: 'SubagentStart',
					agent_id: 'agent-123',
					session_id: 's1',
					transcript_path: '/t',
					cwd: '/',
				} as HookEventDisplay['payload'],
				status: 'passthrough',
			},
		];
		expect(getAgentChain(events, 'agent-123')).toEqual(['main']);
	});

	it('finds correct SubagentStart among multiple events', () => {
		const events: HookEventDisplay[] = [
			{
				id: '1',
				requestId: 'r1',
				timestamp: new Date(),
				hookName: 'PreToolUse',
				toolName: 'Bash',
				payload: {
					hook_event_name: 'PreToolUse',
					tool_name: 'Bash',
					tool_input: {command: 'ls'},
					session_id: 's1',
					transcript_path: '/t',
					cwd: '/',
				},
				status: 'passthrough',
			},
			{
				id: '2',
				requestId: 'r2',
				timestamp: new Date(),
				hookName: 'SubagentStart',
				payload: {
					hook_event_name: 'SubagentStart',
					agent_id: 'agent-456',
					agent_type: 'code-reviewer',
					session_id: 's1',
					transcript_path: '/t',
					cwd: '/',
				},
				status: 'passthrough',
			},
			{
				id: '3',
				requestId: 'r3',
				timestamp: new Date(),
				hookName: 'SubagentStart',
				payload: {
					hook_event_name: 'SubagentStart',
					agent_id: 'agent-789',
					agent_type: 'web-explorer',
					session_id: 's1',
					transcript_path: '/t',
					cwd: '/',
				},
				status: 'passthrough',
			},
		];
		expect(getAgentChain(events, 'agent-789')).toEqual([
			'main',
			'web-explorer',
		]);
		expect(getAgentChain(events, 'agent-456')).toEqual([
			'main',
			'code-reviewer',
		]);
	});
});
