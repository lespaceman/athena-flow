/**
 * Hook that derives the ordered list of display items from raw messages
 * and hook events.
 *
 * Extracted from app.tsx to keep rendering logic separate from content
 * ordering and to make the ordering rules independently testable.
 */

import {type Message} from '../types/common.js';
import {
	type HookEventDisplay,
	isPreToolUseEvent,
} from '../types/hooks/index.js';
import {
	type TodoItem,
	type TodoStatus,
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
 * - PostToolUse for Task: content already shown in subagent box
 * - Task tool events (TodoWrite, TaskCreate, TaskUpdate, TaskList, TaskGet):
 *   aggregated into the sticky bottom task widget
 */
function shouldExcludeFromMainStream(event: HookEventDisplay): boolean {
	if (event.hookName === 'SessionEnd') return true;
	// PostToolUse for Task is hidden — SubagentStop shows the response
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
 * Determines if a content item is "complete" — meaning it has its final
 * state and is safe for Ink's write-once <Static> component.
 */
export function isItemComplete(item: ContentItem): boolean {
	if (item.type === 'message') return true;
	const e = item.data;
	// Pending events haven't been resolved yet
	if (e.status === 'pending') return false;
	// PreToolUse/PermissionRequest needs its postToolEvent to be complete
	// (unless it was blocked, which is a terminal state)
	if (
		(e.hookName === 'PreToolUse' || e.hookName === 'PermissionRequest') &&
		e.toolUseId &&
		!e.postToolEvent &&
		e.status !== 'blocked'
	)
		return false;
	// SubagentStop needs transcript to be loaded
	if (e.hookName === 'SubagentStop' && e.transcriptSummary === undefined)
		return false;
	return true;
}

// ── Hook ─────────────────────────────────────────────────────────────

type UseContentOrderingOptions = {
	messages: Message[];
	events: HookEventDisplay[];
};

type UseContentOrderingResult = {
	/** Completed items — safe for Ink <Static>. Render once, never update. */
	stableItems: ContentItem[];
	/** The single in-progress item (if any) — renders in dynamic area. */
	dynamicItem: ContentItem | null;
/** Aggregated task list from TaskCreate/TaskUpdate or legacy TodoWrite events. */
	tasks: TodoItem[];
};

export function useContentOrdering({
	messages,
	events,
}: UseContentOrderingOptions): UseContentOrderingResult {
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
	for (const item of hookItems) {
		if (item.type === 'hook' && item.data.toolUseId) {
			const postEvent = postToolByUseId.get(item.data.toolUseId);
			if (postEvent) {
				item.data = {...item.data, postToolEvent: postEvent};
			}
		}
	}

	// Aggregate TaskCreate/TaskUpdate events into the task list.
	const tasks = aggregateTaskEvents(events);

	const allItems: ContentItem[] = [
		...messages.map(m => ({type: 'message' as const, data: m})),
		...hookItems,
		...sessionEndMessages,
	].sort((a, b) => getItemTime(a) - getItemTime(b));

	const stableItems = allItems.filter(isItemComplete);
	const pendingItems = allItems.filter(i => !isItemComplete(i));
	const dynamicItem =
		pendingItems.length > 0 ? pendingItems[pendingItems.length - 1]! : null;

	return {
		stableItems,
		dynamicItem,
		tasks,
	};
}
