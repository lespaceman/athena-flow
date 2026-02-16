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

// ── Hook ─────────────────────────────────────────────────────────────

type UseContentOrderingOptions = {
	messages: Message[];
	events: HookEventDisplay[];
};

type UseContentOrderingResult = {
	stableItems: ContentItem[];
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

	const hookItems: ContentItem[] = events
		.filter(e => !shouldExcludeFromMainStream(e))
		.map(e => ({type: 'hook' as const, data: e}));

	// Aggregate TaskCreate/TaskUpdate events into the task list.
	const tasks = aggregateTaskEvents(events);

	const stableItems: ContentItem[] = [
		...messages.map(m => ({type: 'message' as const, data: m})),
		...hookItems,
		...sessionEndMessages,
	].sort((a, b) => getItemTime(a) - getItemTime(b));

	return {
		stableItems,
		tasks,
	};
}
