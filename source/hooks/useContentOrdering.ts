/**
 * Hook that derives the ordered list of display items from raw messages
 * and hook events.
 *
 * Extracted from app.tsx to keep rendering logic separate from content
 * ordering and to make the ordering rules independently testable.
 */

import {type Message} from '../types/common.js';
import type {HookEventDisplay} from '../types/hooks/display.js';
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
 * - SubagentStop: result is shown via PostToolUse(Task) which includes the "Done" header
 * - Task tool events (TodoWrite, TaskCreate, etc.): aggregated into sticky task widget
 */
function shouldExcludeFromMainStream(event: HookEventDisplay): boolean {
	if (event.hookName === 'SessionEnd') return true;
	if (event.hookName === 'SubagentStop') return true;
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

	if (!lastTodoWrite) {
		return [];
	}

	const payload = lastTodoWrite.payload as Record<string, unknown>;
	const input = payload.tool_input as unknown as TodoWriteInput | undefined;
	return Array.isArray(input?.todos) ? input.todos : [];
}

/**
 * Post-sort grouping: moves PostToolUse/PostToolUseFailure results directly
 * after their matching PreToolUse event (matched by toolUseId).
 *
 * This fixes visual misplacement when parallel tool calls produce results
 * that, by timestamp alone, appear under the wrong tool call header.
 */
/** Returns the toolUseId if this item is a PostToolUse/PostToolUseFailure result, or undefined. */
function getPostToolResultId(item: ContentItem): string | undefined {
	if (
		item.type === 'hook' &&
		(item.data.hookName === 'PostToolUse' ||
			item.data.hookName === 'PostToolUseFailure') &&
		item.data.toolUseId
	) {
		return item.data.toolUseId;
	}
	return undefined;
}

export function groupToolResults(items: ContentItem[]): ContentItem[] {
	// Build map: toolUseId → index of PreToolUse in the sorted array
	const preToolIndexByUseId = new Map<string, number>();
	for (let i = 0; i < items.length; i++) {
		const item = items[i]!;
		if (
			item.type === 'hook' &&
			item.data.hookName === 'PreToolUse' &&
			item.data.toolUseId
		) {
			preToolIndexByUseId.set(item.data.toolUseId, i);
		}
	}

	// Collect post-tool results keyed by their PreToolUse's toolUseId
	const pendingResults = new Map<string, ContentItem[]>();
	const orphans: ContentItem[] = [];

	for (const item of items) {
		const useId = getPostToolResultId(item);
		if (!useId) continue;

		if (preToolIndexByUseId.has(useId)) {
			let arr = pendingResults.get(useId);
			if (!arr) {
				arr = [];
				pendingResults.set(useId, arr);
			}
			arr.push(item);
		} else {
			orphans.push(item);
		}
	}

	// If nothing to regroup, return as-is
	if (pendingResults.size === 0 && orphans.length === 0) return items;

	// Rebuild: for each non-result item, emit it, then any matching results
	const result: ContentItem[] = [];
	for (const item of items) {
		if (getPostToolResultId(item)) continue; // skip — will be inserted after PreToolUse
		result.push(item);

		if (
			item.type === 'hook' &&
			item.data.hookName === 'PreToolUse' &&
			item.data.toolUseId
		) {
			const matched = pendingResults.get(item.data.toolUseId);
			if (matched) {
				result.push(...matched);
			}
		}
	}

	// Append orphans at end
	result.push(...orphans);
	return result;
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

	// Pure timestamp sort — the only ordering compatible with Ink's <Static>,
	// which is append-only (tracks by array length, not keys). Reordering
	// items would cause duplicates. Parallel tool results appear in arrival
	// order rather than grouped under their headers — a known limitation.
	const stableItems: ContentItem[] = [
		...messages.map(m => ({type: 'message' as const, data: m})),
		...hookItems,
		...sessionEndMessages,
	].sort((a, b) => getItemTime(a) - getItemTime(b));

	return {stableItems, tasks};
}
