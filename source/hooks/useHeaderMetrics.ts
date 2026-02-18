import {useMemo, useRef} from 'react';
import type {FeedEvent} from '../feed/types.js';
import type {SessionMetrics, TokenUsage} from '../types/headerMetrics.js';

const NULL_TOKENS: TokenUsage = {
	input: null,
	output: null,
	cacheRead: null,
	cacheWrite: null,
	total: null,
	contextSize: null,
};

/**
 * Derives SessionMetrics from an array of feed events.
 *
 * Pure computation (useMemo only) — no side effects.
 * Token fields are always null until a data source becomes available.
 */
const THROTTLE_MS = 1000;

export function useHeaderMetrics(events: FeedEvent[]): SessionMetrics {
	const lastComputeRef = useRef<number>(0);
	const cachedRef = useRef<SessionMetrics | null>(null);

	return useMemo(() => {
		const now = Date.now();
		if (
			cachedRef.current !== null &&
			now - lastComputeRef.current < THROTTLE_MS
		) {
			return cachedRef.current;
		}

		let modelName: string | null = null;
		let sessionStartTime: Date | null = null;
		let toolCallCount = 0;
		let permissionsAllowed = 0;
		let permissionsDenied = 0;

		// Track subagents by agent_id
		const subagentMap = new Map<
			string,
			{agentType: string; toolCallCount: number}
		>();

		for (const event of events) {
			// Extract session start time from first session.start event
			if (sessionStartTime === null && event.kind === 'session.start') {
				sessionStartTime = new Date(event.ts);
			}

			// Extract model from first session.start event with model field
			if (
				modelName === null &&
				event.kind === 'session.start' &&
				typeof event.data.model === 'string'
			) {
				modelName = event.data.model;
			}

			// Count top-level tool uses (tool.pre, not subagent events)
			if (
				event.kind === 'tool.pre' &&
				!event.actor_id.startsWith('subagent:')
			) {
				toolCallCount++;
			}

			// Count child tool calls per subagent
			if (event.kind === 'tool.pre' && event.actor_id.startsWith('subagent:')) {
				const subagentId = event.actor_id.replace(/^subagent:/, '');
				const existing = subagentMap.get(subagentId);
				if (existing) {
					existing.toolCallCount++;
				}
			}

			// Track subagents from subagent.start (top-level only)
			if (
				event.kind === 'subagent.start' &&
				!event.actor_id.startsWith('subagent:')
			) {
				const agentId = event.data.agent_id;
				const agentType = event.data.agent_type;
				if (agentId && !subagentMap.has(agentId)) {
					subagentMap.set(agentId, {
						agentType: agentType ?? 'Agent',
						toolCallCount: 0,
					});
				}
			}

			// Count permission decisions
			if (event.kind === 'permission.decision') {
				if (event.data.decision_type === 'deny') {
					permissionsDenied++;
				} else if (
					event.data.decision_type === 'allow' ||
					event.data.decision_type === 'no_opinion'
				) {
					permissionsAllowed++;
				}
				// 'ask' is like pending — not counted
			}
		}

		const subagentMetrics = Array.from(subagentMap.entries()).map(
			([agentId, data]) => ({
				agentId,
				agentType: data.agentType,
				toolCallCount: data.toolCallCount,
				tokenCount: null,
			}),
		);

		const subagentToolTotal = subagentMetrics.reduce(
			(sum, s) => sum + s.toolCallCount,
			0,
		);

		const result: SessionMetrics = {
			modelName,
			toolCallCount,
			totalToolCallCount: toolCallCount + subagentToolTotal,
			subagentCount: subagentMap.size,
			subagentMetrics,
			permissions: {
				allowed: permissionsAllowed,
				denied: permissionsDenied,
			},
			sessionStartTime,
			tokens: NULL_TOKENS,
		};
		cachedRef.current = result;
		lastComputeRef.current = now;
		return result;
	}, [events]);
}
