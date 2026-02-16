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
	type TodoWriteInput,
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
 * Excluded:
 * - SessionEnd: rendered as synthetic assistant messages instead
 * - PostToolUse for Task: content already shown in SubagentStop
 * - Task tool events (TodoWrite, TaskCreate, etc.): aggregated into sticky task widget
 */
function shouldExcludeFromMainStream(event: HookEventDisplay): boolean {
	if (event.hookName === 'SessionEnd') return true;
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
 * Extract the task list from the most recent TodoWrite snapshot.
 * TodoWrite delivers a full snapshot each time, so only the latest matters.
 */
function extractTasks(events: HookEventDisplay[]): TodoItem[] {
	const lastTodoWrite = events
		.filter(
			e =>
				e.hookName === 'PreToolUse' &&
				e.toolName === 'TodoWrite' &&
				!e.parentSubagentId,
		)
		.at(-1);

	if (!lastTodoWrite || !isPreToolUseEvent(lastTodoWrite.payload)) {
		return [];
	}

	const input = lastTodoWrite.payload.tool_input as unknown as
		| TodoWriteInput
		| undefined;
	return Array.isArray(input?.todos) ? input.todos : [];
}

// ── Hook ─────────────────────────────────────────────────────────────

type UseContentOrderingOptions = {
	messages: Message[];
	events: HookEventDisplay[];
};

type UseContentOrderingResult = {
	stableItems: ContentItem[];
	/** Task list extracted from the latest TodoWrite event. */
	tasks: TodoItem[];
};

export function useContentOrdering({
	messages,
	events,
}: UseContentOrderingOptions): UseContentOrderingResult {
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

	const tasks = extractTasks(events);

	const stableItems: ContentItem[] = [
		...messages.map(m => ({type: 'message' as const, data: m})),
		...hookItems,
		...sessionEndMessages,
	].sort((a, b) => getItemTime(a) - getItemTime(b));

	return {stableItems, tasks};
}
