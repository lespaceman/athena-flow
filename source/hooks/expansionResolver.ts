/**
 * Pure functions for resolving and formatting expansion targets.
 *
 * Given a toolId (which may be a tool_use_id, agent_id, or "last"),
 * determines what to expand and returns the relevant data.
 */

import {type HookEventDisplay} from '../types/hooks/display.js';
import {
	isSubagentStartEvent,
	isSubagentStopEvent,
} from '../types/hooks/index.js';

export type ToolExpansionTarget = {
	type: 'tool';
	toolUseId: string;
	preEvent?: HookEventDisplay;
	postEvent?: HookEventDisplay;
};

export type AgentExpansionTarget = {
	type: 'agent';
	agentId: string;
	agentType: string;
	startEvent: HookEventDisplay;
	childEvents: HookEventDisplay[];
};

export type ExpansionTarget = ToolExpansionTarget | AgentExpansionTarget;

export function resolveExpansionTarget(
	events: HookEventDisplay[],
	toolId: string,
): ExpansionTarget | null {
	// Resolve "last" to most recent toolUseId
	const resolvedId =
		toolId === 'last'
			? [...events].reverse().find(e => e.toolUseId)?.toolUseId
			: toolId;

	if (!resolvedId) return null;

	// Try tool match first (toolUseId)
	const preEvent = events.find(
		e =>
			(e.hookName === 'PreToolUse' || e.hookName === 'PermissionRequest') &&
			e.toolUseId === resolvedId,
	);
	const postEvent = events.find(
		e =>
			(e.hookName === 'PostToolUse' || e.hookName === 'PostToolUseFailure') &&
			e.toolUseId === resolvedId,
	);

	if (preEvent || postEvent) {
		return {
			type: 'tool',
			toolUseId: resolvedId,
			preEvent,
			postEvent,
		};
	}

	// Try agent match (agent_id on SubagentStart)
	const agentStart = events.find(
		e =>
			e.hookName === 'SubagentStart' &&
			isSubagentStartEvent(e.payload) &&
			e.payload.agent_id === resolvedId,
	);

	if (agentStart && isSubagentStartEvent(agentStart.payload)) {
		const childEvents = events.filter(e => e.parentSubagentId === resolvedId);
		return {
			type: 'agent',
			agentId: resolvedId,
			agentType: agentStart.payload.agent_type,
			startEvent: agentStart,
			childEvents,
		};
	}

	return null;
}

/**
 * Find the most recent completed subagent (has both SubagentStart and SubagentStop).
 */
export function findLastCompletedAgent(
	events: HookEventDisplay[],
): AgentExpansionTarget | null {
	const stoppedIds = new Set<string>();
	for (const e of events) {
		if (e.hookName === 'SubagentStop' && isSubagentStopEvent(e.payload)) {
			stoppedIds.add(e.payload.agent_id);
		}
	}

	// Walk backwards to find the most recent completed SubagentStart
	for (let i = events.length - 1; i >= 0; i--) {
		const e = events[i]!;
		if (
			e.hookName === 'SubagentStart' &&
			isSubagentStartEvent(e.payload) &&
			stoppedIds.has(e.payload.agent_id)
		) {
			const agentId = e.payload.agent_id;
			const childEvents = events.filter(ev => ev.parentSubagentId === agentId);
			return {
				type: 'agent',
				agentId,
				agentType: e.payload.agent_type,
				startEvent: e,
				childEvents,
			};
		}
	}

	return null;
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
