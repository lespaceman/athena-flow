import {describe, it, expect} from 'vitest';
import {getAgentChain} from './agentChain.js';
import {type FeedEvent} from '../feed/types.js';

const mkSubagentStart = (agentId: string, agentType: string): FeedEvent => ({
	event_id: `e-${agentId}`,
	seq: 1,
	ts: Date.now(),
	session_id: 's1',
	run_id: 's1:R1',
	kind: 'subagent.start',
	level: 'info',
	actor_id: 'agent:root',
	title: `⚡ Subagent: ${agentType}`,
	data: {agent_id: agentId, agent_type: agentType},
});

describe('getAgentChain', () => {
	it('returns empty array when parentActorId is undefined', () => {
		expect(getAgentChain([], undefined)).toEqual([]);
	});

	it('returns empty array when parentActorId does not start with subagent:', () => {
		expect(getAgentChain([], 'agent:root')).toEqual([]);
	});

	it('returns ["main"] when subagent not found in events', () => {
		expect(getAgentChain([], 'subagent:agent-123')).toEqual(['main']);
	});

	it('returns chain with agent type when subagent.start event found', () => {
		const events: FeedEvent[] = [mkSubagentStart('agent-123', 'web-explorer')];
		expect(getAgentChain(events, 'subagent:agent-123')).toEqual([
			'main',
			'web-explorer',
		]);
	});

	it('finds correct subagent.start among multiple events', () => {
		const events: FeedEvent[] = [
			mkSubagentStart('agent-456', 'code-reviewer'),
			mkSubagentStart('agent-789', 'web-explorer'),
		];
		expect(getAgentChain(events, 'subagent:agent-789')).toEqual([
			'main',
			'web-explorer',
		]);
		expect(getAgentChain(events, 'subagent:agent-456')).toEqual([
			'main',
			'code-reviewer',
		]);
	});
});
