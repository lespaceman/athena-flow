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
 * - Child events (with parentSubagentId): render inside their parent subagent box
 * - SubagentStart/SubagentStop: handled separately for unified rendering
 * - PostToolUse for Task: content already shown in subagent box
 * - Task tool events (TodoWrite, TaskCreate, TaskUpdate, TaskList, TaskGet):
 *   aggregated into the sticky bottom task widget
 */
function shouldExcludeFromMainStream(event: HookEventDisplay): boolean {
	if (event.hookName === 'SessionEnd') return true;
	if (event.parentSubagentId) return true;
	if (event.hookName === 'SubagentStart') return true;
	if (event.hookName === 'SubagentStop') return true;
	if (event.hookName === 'PostToolUse' && event.toolName === 'Task')
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
	activeSubagents: HookEventDisplay[];
	childEventsByAgent: Map<string, HookEventDisplay[]>;
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
	// - childEventsByAgent: child events grouped by parent subagent
	const childEventsByAgent = new Map<string, HookEventDisplay[]>();
	const stoppedAgentIds = new Set<string>();
	const stopEventsByAgent = new Map<string, HookEventDisplay>();
	for (const e of events) {
		if (e.parentSubagentId) {
			const children = childEventsByAgent.get(e.parentSubagentId) ?? [];
			children.push(e);
			childEventsByAgent.set(e.parentSubagentId, children);
		}
		if (isSubagentStopEvent(e.payload)) {
			stoppedAgentIds.add(e.payload.agent_id);
			stopEventsByAgent.set(e.payload.agent_id, e);
		}
	}
	// Sort each group by timestamp so render order is deterministic
	for (const children of childEventsByAgent.values()) {
		children.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
	}

	// Build pairing maps for PreToolUse ↔ PostToolUse/PostToolUseFailure by toolUseId
	const preToolByUseId = new Map<string, number>();
	const postToolByUseId = new Map<string, HookEventDisplay>();
	for (const e of events) {
		if (
			(e.hookName === 'PreToolUse' || e.hookName === 'PermissionRequest') &&
			e.toolUseId
		) {
			// Store index placeholder — will be resolved after hookItems is built
			preToolByUseId.set(e.toolUseId, 0);
		}
		if (
			(e.hookName === 'PostToolUse' || e.hookName === 'PostToolUseFailure') &&
			e.toolUseId &&
			preToolByUseId.has(e.toolUseId)
		) {
			postToolByUseId.set(e.toolUseId, e);
		}
	}

	// Interleave messages and hook events by timestamp.
	// See shouldExcludeFromMainStream for the list of excluded event types.
	// Also exclude PostToolUse/PostToolUseFailure when paired with a PreToolUse.
	const hookItems: ContentItem[] = events
		.filter(e => {
			if (shouldExcludeFromMainStream(e)) return false;
			if (
				(e.hookName === 'PostToolUse' || e.hookName === 'PostToolUseFailure') &&
				e.toolUseId &&
				preToolByUseId.has(e.toolUseId)
			)
				return false;
			return true;
		})
		.map(e => ({type: 'hook' as const, data: e}));

	// Merge postToolEvent onto matching PreToolUse/PermissionRequest items
	for (const item of hookItems) {
		if (item.type === 'hook' && item.data.toolUseId) {
			const postEvent = postToolByUseId.get(item.data.toolUseId);
			if (postEvent) {
				item.data = {...item.data, postToolEvent: postEvent};
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

	// Running subagents: rendered in the dynamic section directly (never go through hookItems).
	const activeSubagents: HookEventDisplay[] = events.filter(
		e =>
			isSubagentStartEvent(e.payload) &&
			!e.parentSubagentId &&
			!stoppedAgentIds.has(e.payload.agent_id),
	);

	// Completed subagents: added to contentItems with merged stopEvent data.
	// This enables rendering the subagent response in a single unified box.
	const completedSubagentItems: ContentItem[] = events
		.filter(
			(e): e is HookEventDisplay & {payload: {agent_id: string}} =>
				isSubagentStartEvent(e.payload) &&
				!e.parentSubagentId &&
				stoppedAgentIds.has(e.payload.agent_id),
		)
		.map(e => {
			const stopEvent = stopEventsByAgent.get(e.payload.agent_id);
			return {
				type: 'hook' as const,
				data: stopEvent ? {...e, stopEvent} : e,
			};
		});

	const contentItems: ContentItem[] = [
		...messages.map(m => ({type: 'message' as const, data: m})),
		...hookItems,
		...completedSubagentItems,
		...sessionEndMessages,
	].sort((a, b) => getItemTime(a) - getItemTime(b));

	// Build a lookup map from item ID → ContentItem for O(1) access
	const itemById = new Map<string, ContentItem>();
	for (const item of contentItems) {
		itemById.set(item.data.id, item);
	}

	// Detect if the session has ended (Stop or SessionEnd event present)
	const sessionEnded = events.some(
		e => e.hookName === 'Stop' || e.hookName === 'SessionEnd',
	);

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

	// Append newly-stable items (in timestamp order among themselves)
	for (const item of contentItems) {
		if (isStable(item) && !prevStableIds.has(item.data.id)) {
			stableItems.push(item);
		}
	}

	// Update the ref with the current stable ID order
	stableOrderRef.current = stableItems.map(i => i.data.id);

	// Dynamic items: everything that's not stable
	const dynamicItems = contentItems.filter(item => !isStable(item));

	return {
		stableItems,
		dynamicItems,
		activeSubagents,
		childEventsByAgent,
		tasks,
	};
}
