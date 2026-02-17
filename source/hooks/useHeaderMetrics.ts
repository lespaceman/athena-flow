import {useMemo, useRef} from 'react';
import type {HookEventDisplay} from '../types/hooks/index.js';
import type {SessionMetrics, TokenUsage} from '../types/headerMetrics.js';
import {
	isSessionStartEvent,
	isSubagentStartEvent,
} from '../types/hooks/index.js';

const NULL_TOKENS: TokenUsage = {
	input: null,
	output: null,
	cacheRead: null,
	cacheWrite: null,
	total: null,
	contextSize: null,
};

/**
 * Derives SessionMetrics from an array of hook events.
 *
 * Pure computation (useMemo only) — no side effects.
 * Token fields are always null until a data source becomes available.
 */
const THROTTLE_MS = 1000;

export function useHeaderMetrics(events: HookEventDisplay[]): SessionMetrics {
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
			// Extract session start time from first SessionStart event
			if (sessionStartTime === null && isSessionStartEvent(event.payload)) {
				sessionStartTime = event.timestamp;
			}

			// Extract model from first SessionStart event with model field
			if (
				modelName === null &&
				isSessionStartEvent(event.payload) &&
				event.payload.model
			) {
				modelName = event.payload.model;
			}

			// Count top-level tool uses (PreToolUse, not child events)
			if (event.hookName === 'PreToolUse' && !event.parentSubagentId) {
				toolCallCount++;
			}

			// Count child tool calls per subagent
			if (event.hookName === 'PreToolUse' && event.parentSubagentId) {
				const existing = subagentMap.get(event.parentSubagentId);
				if (existing) {
					existing.toolCallCount++;
				}
			}

			// Track subagents from SubagentStart (top-level only)
			if (isSubagentStartEvent(event.payload) && !event.parentSubagentId) {
				if (!subagentMap.has(event.payload.agent_id)) {
					subagentMap.set(event.payload.agent_id, {
						agentType: event.payload.agent_type,
						toolCallCount: 0,
					});
				}
			}

			// Count permission outcomes
			if (event.hookName === 'PermissionRequest') {
				if (event.status === 'blocked') {
					permissionsDenied++;
				} else if (event.status !== 'pending') {
					permissionsAllowed++;
				}
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
