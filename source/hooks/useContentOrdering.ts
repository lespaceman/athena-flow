/**
 * Hook that derives the ordered, stable/dynamic split of display items
 * from raw messages and hook events.
 *
 * Extracted from app.tsx to keep rendering logic separate from content
 * ordering and to make the stability rules independently testable.
 */

import {useRef} from 'react';
import {type Message} from '../types/common.js';
import {
	type HookEventDisplay,
	isPreToolUseEvent,
	isSubagentStartEvent,
	isSubagentStopEvent,
} from '../types/hooks/index.js';
import {
	type TodoItem,
	type TodoStatus,
	type TodoWriteInput,
	type TaskCreateInput,
	type TaskUpdateInput,
	TASK_TOOL_NAMES,
} from '../types/todo.js';

// ── Types ────────────────────────────────────────────────────────────

export type ContentItem =
	| {type: 'message'; data: Message}
	| {type: 'hook'; data: HookEventDisplay};

// ── Pure helpers ─────────────────────────────────────────────────────

function getItemTime(item: ContentItem): number {
	return item.data.timestamp.getTime();
}

/**
 * Determines which events should be filtered out of the main content stream.
 *
 * Excluded events:
 * - SessionEnd: rendered as synthetic assistant messages instead
 * - SubagentStop: merged into SubagentStart as stopEvent
 * - PostToolUse for Task: content already shown in subagent box
 * - Task tool events (TodoWrite, TaskCreate, TaskUpdate, TaskList, TaskGet):
 *   aggregated into the sticky bottom task widget
 */
function shouldExcludeFromMainStream(event: HookEventDisplay): boolean {
	// Child events belong to their parent subagent's feed, not the main stream
	if (event.parentSubagentId) return true;

	if (event.hookName === 'SessionEnd') return true;
	if (event.hookName === 'SubagentStop') return true;
	if (
		(event.hookName === 'PreToolUse' || event.hookName === 'PostToolUse') &&
		event.toolName === 'Task'
	)
		return true;
	if (
		(event.hookName === 'PreToolUse' || event.hookName === 'PostToolUse') &&
		TASK_TOOL_NAMES.has(event.toolName ?? '')
	)
		return true;
	return false;
}

/**
 * Aggregate TaskCreate/TaskUpdate PreToolUse events into a TodoItem list.
 *
 * This implements event-sourcing: tasks are created sequentially (IDs assigned
 * 1, 2, 3, ...) by TaskCreate, then mutated by TaskUpdate referencing those IDs.
 * TaskUpdate with status "deleted" removes the task.
 */
function aggregateTaskEvents(events: HookEventDisplay[]): TodoItem[] {
	const tasks = new Map<string, TodoItem>();
	let nextId = 1;

	const taskEvents = events
		.filter(
			e =>
				e.hookName === 'PreToolUse' &&
				(e.toolName === 'TaskCreate' || e.toolName === 'TaskUpdate') &&
				!e.parentSubagentId,
		)
		.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

	for (const event of taskEvents) {
		if (!isPreToolUseEvent(event.payload)) continue;

		if (event.payload.tool_name === 'TaskCreate') {
			const input = event.payload.tool_input as unknown as TaskCreateInput;
			const id = String(nextId++);
			tasks.set(id, {
				content: input.subject,
				status: 'pending',
				activeForm: input.activeForm,
			});
		} else if (event.payload.tool_name === 'TaskUpdate') {
			const input = event.payload.tool_input as unknown as TaskUpdateInput;
			const existing = tasks.get(input.taskId);
			if (existing) {
				if (input.status === 'deleted') {
					tasks.delete(input.taskId);
				} else {
					if (input.status) existing.status = input.status as TodoStatus;
					if (input.subject) existing.content = input.subject;
					if (input.activeForm !== undefined)
						existing.activeForm = input.activeForm;
				}
			}
		}
	}

	return Array.from(tasks.values());
}

/**
 * Determine whether a content item has reached a terminal state and can
 * be moved into the Ink `<Static>` list (rendered once, never updated).
 *
 * @param stoppedAgentIds - Set of agent_ids that have a matching SubagentStop event.
 *   Used to determine SubagentStart stability without merged fields.
 */
export function isStableContent(
	item: ContentItem,
	stoppedAgentIds?: Set<string>,
	sessionEnded?: boolean,
): boolean {
	if (item.type === 'message') return true;

	switch (item.data.hookName) {
		case 'SessionEnd':
			// Stable once transcript data has loaded
			return item.data.transcriptSummary !== undefined;
		case 'PreToolUse':
		case 'PermissionRequest':
			// Blocked (user rejected) → stable immediately
			if (item.data.status === 'blocked') return true;
			// Pending → not stable
			if (item.data.status === 'pending') return false;
			// Non-pending with postToolEvent merged → stable
			if (item.data.postToolEvent !== undefined) return true;
			// Session ended or no toolUseId (can never pair) → stable
			if (sessionEnded || !item.data.toolUseId) return true;
			// Still waiting for PostToolUse to arrive
			return false;
		case 'SubagentStart': {
			// Stable when blocked or when a matching SubagentStop exists
			if (item.data.status === 'blocked') return true;
			if (!isSubagentStartEvent(item.data.payload)) return false;
			return stoppedAgentIds?.has(item.data.payload.agent_id) ?? false;
		}
		default:
			return item.data.status !== 'pending';
	}
}

// ── Hook ─────────────────────────────────────────────────────────────

type UseContentOrderingOptions = {
	messages: Message[];
	events: HookEventDisplay[];
};

type UseContentOrderingResult = {
	stableItems: ContentItem[];
	dynamicItems: ContentItem[];
	/** Aggregated task list from TaskCreate/TaskUpdate or legacy TodoWrite events. */
	tasks: TodoItem[];
};

export function useContentOrdering({
	messages,
	events,
}: UseContentOrderingOptions): UseContentOrderingResult {
	// Track IDs that have been emitted as stable, in order.
	// Once an item enters this list, its position is fixed.
	const stableOrderRef = useRef<string[]>([]);

	// Convert SessionEnd events with transcript text into synthetic assistant messages
	const sessionEndMessages: ContentItem[] = events
		.filter(
			e =>
				e.hookName === 'SessionEnd' && e.transcriptSummary?.lastAssistantText,
		)
		.map(e => ({
			type: 'message' as const,
			data: {
				id: `session-end-${e.id}`,
				role: 'assistant' as const,
				content: e.transcriptSummary!.lastAssistantText!,
				timestamp: e.timestamp,
			},
		}));

	// Build maps for subagent tracking:
	// - stoppedAgentIds: agent_ids that have a SubagentStop event
	// - stopEventsByAgent: SubagentStop events indexed by agent_id (for merging)
	const stoppedAgentIds = new Set<string>();
	const stopEventsByAgent = new Map<string, HookEventDisplay>();
	for (const e of events) {
		if (isSubagentStopEvent(e.payload)) {
			stoppedAgentIds.add(e.payload.agent_id);
			stopEventsByAgent.set(e.payload.agent_id, e);
		}
	}

	// Build pairing maps for PreToolUse ↔ PostToolUse/PostToolUseFailure.
	// Primary: pair by toolUseId (exact match).
	// Fallback: when PostToolUse lacks toolUseId (Claude Code bug — see
	// https://github.com/anthropics/claude-code/issues/13241), pair by tool_name
	// in temporal order: each unmatched PostToolUse pairs with the earliest
	// unmatched PreToolUse of the same tool_name that precedes it in time.
	const preToolUseIds = new Set<string>();
	const postToolByUseId = new Map<string, HookEventDisplay>();
	const pairedPreIds = new Set<string>();

	// Pass 1: exact toolUseId pairing
	for (const e of events) {
		if (
			(e.hookName === 'PreToolUse' || e.hookName === 'PermissionRequest') &&
			e.toolUseId
		) {
			preToolUseIds.add(e.toolUseId);
		}
		if (
			(e.hookName === 'PostToolUse' || e.hookName === 'PostToolUseFailure') &&
			e.toolUseId &&
			preToolUseIds.has(e.toolUseId)
		) {
			postToolByUseId.set(e.toolUseId, e);
			pairedPreIds.add(e.toolUseId);
		}
	}

	// Pass 2: temporal fallback for PostToolUse events missing toolUseId.
	// For each unmatched post, find the earliest unmatched pre with the same
	// tool_name that precedes it in time.
	const unmatchedPres = events.filter(
		e =>
			(e.hookName === 'PreToolUse' || e.hookName === 'PermissionRequest') &&
			e.toolUseId &&
			!pairedPreIds.has(e.toolUseId),
	);
	const unmatchedPosts = events.filter(
		e =>
			(e.hookName === 'PostToolUse' || e.hookName === 'PostToolUseFailure') &&
			!e.toolUseId,
	);
	const consumedPreIds = new Set<string>();
	for (const post of unmatchedPosts) {
		const match = unmatchedPres.find(
			pre =>
				!consumedPreIds.has(pre.toolUseId!) &&
				pre.toolName === post.toolName &&
				pre.timestamp.getTime() <= post.timestamp.getTime(),
		);
		if (match) {
			postToolByUseId.set(match.toolUseId!, post);
			pairedPreIds.add(match.toolUseId!);
			consumedPreIds.add(match.toolUseId!);
		}
	}

	// Build set of paired PostToolUse event IDs for filtering
	const pairedPostIds = new Set([...postToolByUseId.values()].map(e => e.id));

	// Interleave messages and hook events by timestamp.
	// See shouldExcludeFromMainStream for the list of excluded event types.
	// Also exclude PostToolUse/PostToolUseFailure when paired with a PreToolUse.
	const hookItems: ContentItem[] = events
		.filter(e => {
			if (shouldExcludeFromMainStream(e)) return false;
			if (
				(e.hookName === 'PostToolUse' || e.hookName === 'PostToolUseFailure') &&
				(pairedPostIds.has(e.id) ||
					(e.toolUseId && preToolUseIds.has(e.toolUseId)))
			)
				return false;
			return true;
		})
		.map(e => ({type: 'hook' as const, data: e}));

	// Merge postToolEvent onto matching PreToolUse/PermissionRequest items
	// and merge stopEvent onto SubagentStart items
	for (const item of hookItems) {
		if (item.type === 'hook') {
			if (item.data.toolUseId) {
				const postEvent = postToolByUseId.get(item.data.toolUseId);
				if (postEvent) {
					item.data = {...item.data, postToolEvent: postEvent};
				}
			}
			if (
				isSubagentStartEvent(item.data.payload) &&
				stoppedAgentIds.has(item.data.payload.agent_id)
			) {
				const agentId = item.data.payload.agent_id;
				const stopEvent = stopEventsByAgent.get(agentId);
				// Compute child metrics
				const childToolCount = events.filter(
					e =>
						e.parentSubagentId === agentId &&
						(e.hookName === 'PreToolUse' || e.hookName === 'PermissionRequest'),
				).length;
				const startTime = item.data.timestamp.getTime();
				const endTime = stopEvent?.timestamp.getTime() ?? Date.now();
				if (stopEvent) {
					item.data = {
						...item.data,
						stopEvent,
						childMetrics: {
							toolCount: childToolCount,
							duration: endTime - startTime,
						},
					};
				}
			}
		}
	}

	// Pair Task PreToolUse descriptions onto SubagentStart items.
	// Build list of top-level Task PreToolUse events sorted by time.
	const taskPreToolUseEvents = events
		.filter(
			e =>
				e.hookName === 'PreToolUse' &&
				e.toolName === 'Task' &&
				!e.parentSubagentId &&
				isPreToolUseEvent(e.payload),
		)
		.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

	const consumedTaskPreIds = new Set<string>();
	for (const item of hookItems) {
		if (item.type === 'hook' && isSubagentStartEvent(item.data.payload)) {
			const agentType = item.data.payload.agent_type;
			const itemTime = item.data.timestamp.getTime();
			// Find closest preceding Task PreToolUse with matching subagent_type
			let bestMatch: HookEventDisplay | undefined;
			for (const taskEvt of taskPreToolUseEvents) {
				if (consumedTaskPreIds.has(taskEvt.id)) continue;
				if (taskEvt.timestamp.getTime() > itemTime) break;
				if (!isPreToolUseEvent(taskEvt.payload)) continue;
				const input = taskEvt.payload.tool_input as Record<string, unknown>;
				if (input.subagent_type === agentType) {
					bestMatch = taskEvt;
				}
			}
			if (bestMatch && isPreToolUseEvent(bestMatch.payload)) {
				const input = bestMatch.payload.tool_input as Record<string, unknown>;
				const description = input.description;
				if (typeof description === 'string') {
					item.data = {...item.data, taskDescription: description};
				}
				consumedTaskPreIds.add(bestMatch.id);
			}
		}
	}

	// Extract the latest TodoWrite event for sticky bottom rendering (legacy).
	const todoWriteEvents = events.filter(
		e =>
			e.hookName === 'PreToolUse' &&
			e.toolName === 'TodoWrite' &&
			!e.parentSubagentId,
	);
	const activeTodoList = todoWriteEvents.at(-1) ?? null;

	// Aggregate new-style TaskCreate/TaskUpdate events, or fall back to legacy TodoWrite.
	const aggregatedTasks = aggregateTaskEvents(events);
	let tasks: TodoItem[];
	if (aggregatedTasks.length > 0) {
		tasks = aggregatedTasks;
	} else if (activeTodoList && isPreToolUseEvent(activeTodoList.payload)) {
		const input = activeTodoList.payload
			.tool_input as unknown as TodoWriteInput;
		tasks = Array.isArray(input.todos) ? input.todos : [];
	} else {
		tasks = [];
	}

	const contentItems: ContentItem[] = [
		...messages.map(m => ({type: 'message' as const, data: m})),
		...hookItems,
		...sessionEndMessages,
	].sort((a, b) => getItemTime(a) - getItemTime(b));

	// Build a lookup map from item ID → ContentItem for O(1) access
	const itemById = new Map<string, ContentItem>();
	for (const item of contentItems) {
		itemById.set(item.data.id, item);
	}

	// Detect if the CURRENT session has ended. A new SessionStart after the
	// last Stop/SessionEnd means a new session is active — sessionEnded must
	// be false so new PreToolUse events stay dynamic until their PostToolUse
	// arrives. Without this, events from the second message would be stamped
	// as stable immediately (rendered once in Ink's <Static> as "Running…"
	// and never updated).
	let sessionEnded = false;
	for (const e of events) {
		if (e.hookName === 'Stop' || e.hookName === 'SessionEnd') {
			sessionEnded = true;
		} else if (e.hookName === 'SessionStart') {
			sessionEnded = false;
		}
	}

	const isStable = (item: ContentItem) =>
		isStableContent(item, stoppedAgentIds, sessionEnded);

	// Build append-only stableItems:
	// 1. Keep existing stable items in their original order (skip removed ones)
	// 2. Append new stable items that weren't in the previous list
	const prevStableIds = new Set(stableOrderRef.current);
	const stableItems: ContentItem[] = [];

	// Retain existing order for previously-stable items
	for (const id of stableOrderRef.current) {
		const item = itemById.get(id);
		if (item && isStable(item)) {
			stableItems.push(item);
		}
	}

	// Immediately promote newly-stable items (no deferred cycle)
	for (const item of contentItems) {
		if (isStable(item) && !prevStableIds.has(item.data.id)) {
			stableItems.push(item);
		}
	}

	// Update the ref with the current stable ID order
	stableOrderRef.current = stableItems.map(i => i.data.id);

	// Dynamic items: everything not yet promoted to stable
	// (includes pending items so they remain visible during the delay)
	const stableIdSet = new Set(stableItems.map(i => i.data.id));
	const dynamicItems = contentItems.filter(
		item => !stableIdSet.has(item.data.id),
	);

	return {
		stableItems,
		dynamicItems,
		tasks,
	};
}
