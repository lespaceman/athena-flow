import {type HookEventDisplay} from '../types/hooks/display.js';

/**
 * Build the agent chain from event history.
 * Returns array like ['main', 'web-explorer'] for a subagent context.
 */
export function getAgentChain(
	events: HookEventDisplay[],
	parentSubagentId: string | undefined,
): string[] {
	if (!parentSubagentId) return [];

	const chain: string[] = ['main'];

	// Find the SubagentStart event for this parent
	const startEvent = events.find(
		e =>
			e.hookName === 'SubagentStart' &&
			(e.payload as {agent_id?: string}).agent_id === parentSubagentId,
	);

	if (startEvent) {
		const agentType = (startEvent.payload as {agent_type?: string}).agent_type;
		if (agentType) {
			chain.push(agentType);
		}
	}

	return chain;
}
