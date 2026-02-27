import type {FeedEvent} from './types';

/**
 * Build the agent chain from event history.
 * Returns array like ['main', 'web-explorer'] for a subagent context.
 */
export function getAgentChain(
	events: FeedEvent[],
	parentActorId: string | undefined,
): string[] {
	if (!parentActorId || !parentActorId.startsWith('subagent:')) return [];

	const chain: string[] = ['main'];
	const agentId = parentActorId.replace('subagent:', '');

	const startEvent = events.find(
		e => e.kind === 'subagent.start' && e.data.agent_id === agentId,
	);

	if (startEvent && startEvent.kind === 'subagent.start') {
		chain.push(startEvent.data.agent_type);
	}

	return chain;
}
