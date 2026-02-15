/**
 * Pure functions for resolving and formatting subagent expansion targets.
 *
 * Ctrl+O expands all subagents — no completion check needed.
 */

import {type HookEventDisplay} from '../types/hooks/display.js';
import {isSubagentStartEvent} from '../types/hooks/index.js';

export type AgentExpansionTarget = {
	agentId: string;
	agentType: string;
	startEvent: HookEventDisplay;
	childEvents: HookEventDisplay[];
};

/**
 * Find all SubagentStart events and return expansion targets for each.
 */
export function findAllSubagents(
	events: HookEventDisplay[],
): AgentExpansionTarget[] {
	const targets: AgentExpansionTarget[] = [];
	for (const e of events) {
		if (e.hookName === 'SubagentStart' && isSubagentStartEvent(e.payload)) {
			const agentId = e.payload.agent_id;
			const childEvents = events.filter(ev => ev.parentSubagentId === agentId);
			targets.push({
				agentId,
				agentType: e.payload.agent_type,
				startEvent: e,
				childEvents,
			});
		}
	}
	return targets;
}

/**
 * Format an agent expansion target into a human-readable summary string.
 */
export function formatAgentSummary(target: AgentExpansionTarget): string {
	const childLines = target.childEvents.map(e => {
		const tool = e.toolName ?? e.hookName;
		const blocked = e.status === 'blocked' ? ' [blocked]' : '';
		return `  ${tool}${blocked}`;
	});
	return (
		`Agent ${target.agentType} (${target.agentId}) \u2014 ` +
		`${target.childEvents.length} child events:\n${childLines.join('\n')}`
	);
}

/**
 * Create a synthetic notification event for injecting into the event stream.
 */
export function createNotificationEvent(
	id: string,
	message: string,
): HookEventDisplay {
	return {
		id,
		requestId: id,
		timestamp: new Date(),
		hookName: 'Notification',
		payload: {
			session_id: '',
			transcript_path: '',
			cwd: '',
			hook_event_name: 'Notification',
			message,
		} as unknown as HookEventDisplay['payload'],
		status: 'passthrough',
	};
}
