/**
 * Hook that derives the ordered, stable/dynamic split of display items
 * from raw messages and hook events.
 *
 * Extracted from app.tsx to keep rendering logic separate from content
 * ordering and to make the stability rules independently testable.
 */

import {type Message} from '../types/common.js';
import {
	type HookEventDisplay,
	isSubagentStartEvent,
	isSubagentStopEvent,
} from '../types/hooks/index.js';

// ── Types ────────────────────────────────────────────────────────────

export type ContentItem =
	| {type: 'message'; data: Message}
	| {type: 'hook'; data: HookEventDisplay};

export type DisplayItem = {type: 'header'; id: string} | ContentItem;

// ── Pure helpers ─────────────────────────────────────────────────────

function getItemTime(item: ContentItem): number {
	return item.type === 'message'
		? Number.parseInt(item.data.id.split('-')[0] ?? '0', 10)
		: item.data.timestamp.getTime();
}

/**
 * Determines which events should be filtered out of the main content stream.
 *
 * Excluded events:
 * - SessionEnd: rendered as synthetic assistant messages instead
 * - Child events (with parentSubagentId): render inside their parent subagent box
 * - SubagentStart/SubagentStop: handled separately for unified rendering
 * - PostToolUse for Task: content already shown in subagent box
 * - PreToolUse for TodoWrite: rendered as sticky bottom widget
 */
function shouldExcludeFromMainStream(event: HookEventDisplay): boolean {
	if (event.hookName === 'SessionEnd') return true;
	if (event.parentSubagentId) return true;
	if (event.hookName === 'SubagentStart') return true;
	if (event.hookName === 'SubagentStop') return true;
	if (event.hookName === 'PostToolUse' && event.toolName === 'Task')
		return true;
	if (event.hookName === 'PreToolUse' && event.toolName === 'TodoWrite')
		return true;
	return false;
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
): boolean {
	if (item.type === 'message') return true;

	switch (item.data.hookName) {
		case 'SessionEnd':
			// Stable once transcript data has loaded
			return item.data.transcriptSummary !== undefined;
		case 'PreToolUse':
		case 'PermissionRequest':
			// Stable once no longer pending (answered, passthrough, or blocked)
			return item.data.status !== 'pending';
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
	stableItems: DisplayItem[];
	dynamicItems: ContentItem[];
	activeSubagents: HookEventDisplay[];
	childEventsByAgent: Map<string, HookEventDisplay[]>;
	activeTodoList: HookEventDisplay | null;
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
				id: `${e.timestamp.getTime()}-session-end-${e.id}`,
				role: 'assistant' as const,
				content: e.transcriptSummary!.lastAssistantText!,
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

	// Interleave messages and hook events by timestamp.
	// See shouldExcludeFromMainStream for the list of excluded event types.
	const hookItems: ContentItem[] = events
		.filter(e => !shouldExcludeFromMainStream(e))
		.map(e => ({type: 'hook' as const, data: e}));

	// Extract the latest TodoWrite event for sticky bottom rendering.
	const todoWriteEvents = events.filter(
		e =>
			e.hookName === 'PreToolUse' &&
			e.toolName === 'TodoWrite' &&
			!e.parentSubagentId,
	);
	const activeTodoList = todoWriteEvents.at(-1) ?? null;

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

	// Separate stable items (for Static) from items that may update (rendered dynamically).
	const isStable = (item: ContentItem) =>
		isStableContent(item, stoppedAgentIds);
	const stableItems: DisplayItem[] = [
		{type: 'header', id: 'header'},
		...contentItems.filter(isStable),
	];
	const dynamicItems = contentItems.filter(item => !isStable(item));

	return {
		stableItems,
		dynamicItems,
		activeSubagents,
		childEventsByAgent,
		activeTodoList,
	};
}
