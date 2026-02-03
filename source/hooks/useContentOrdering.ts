/**
 * Hook that derives the ordered, stable/dynamic split of display items
 * from raw messages and hook events.
 *
 * Extracted from app.tsx to keep rendering logic separate from content
 * ordering and to make the stability rules independently testable.
 */

import {type Message} from '../types/common.js';
import {type HookEventDisplay} from '../types/hooks/index.js';

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
 * Determine whether a content item has reached a terminal state and can
 * be moved into the Ink `<Static>` list (rendered once, never updated).
 */
export function isStableContent(item: ContentItem): boolean {
	if (item.type === 'message') return true;

	switch (item.data.hookName) {
		case 'SessionEnd':
			// Stable once transcript data has loaded
			return item.data.transcriptSummary !== undefined;
		case 'PreToolUse':
		case 'PermissionRequest':
			// AskUserQuestion: stable once answered (no PostToolUse expected)
			if (item.data.toolName === 'AskUserQuestion') {
				return item.data.status !== 'pending';
			}
			// Stable when blocked (no PostToolUse expected) or when PostToolUse merged in.
			// Keep dynamic until then so <Static> does not freeze before the response appears.
			return (
				item.data.status === 'blocked' ||
				item.data.postToolPayload !== undefined
			);
		case 'SubagentStart':
			// Stable when blocked or when SubagentStop has been merged in.
			return (
				item.data.status === 'blocked' ||
				item.data.subagentStopPayload !== undefined
			);
		default:
			return item.data.status !== 'pending';
	}
}

// ── Hook ─────────────────────────────────────────────────────────────

type UseContentOrderingOptions = {
	messages: Message[];
	events: HookEventDisplay[];
	debug?: boolean;
};

type UseContentOrderingResult = {
	stableItems: DisplayItem[];
	dynamicItems: ContentItem[];
	childEventsByAgent: Map<string, HookEventDisplay[]>;
};

export function useContentOrdering({
	messages,
	events,
	debug,
}: UseContentOrderingOptions): UseContentOrderingResult {
	// Convert SessionEnd events with transcript text into synthetic assistant messages
	const sessionEndMessages: ContentItem[] = debug
		? []
		: events
				.filter(
					e =>
						e.hookName === 'SessionEnd' &&
						e.transcriptSummary?.lastAssistantText,
				)
				.map(e => ({
					type: 'message' as const,
					data: {
						id: `${e.timestamp.getTime()}-session-end-${e.id}`,
						role: 'assistant' as const,
						content: e.transcriptSummary!.lastAssistantText!,
					},
				}));

	// Group child events by parent agent_id (for rendering inside subagent boxes)
	const childEventsByAgent = new Map<string, HookEventDisplay[]>();
	for (const e of events) {
		if (e.parentSubagentId) {
			const children = childEventsByAgent.get(e.parentSubagentId) ?? [];
			children.push(e);
			childEventsByAgent.set(e.parentSubagentId, children);
		}
	}
	// Sort each group by timestamp so render order is deterministic
	for (const children of childEventsByAgent.values()) {
		children.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
	}

	// Interleave messages and hook events by timestamp.
	// In non-debug mode, exclude SessionEnd (rendered as synthetic assistant messages instead).
	// Exclude child events (those with parentSubagentId) — they render inside their parent subagent box.
	const hookItems: ContentItem[] = events
		.filter(e => (debug || e.hookName !== 'SessionEnd') && !e.parentSubagentId)
		.map(e => ({type: 'hook' as const, data: e}));

	const contentItems: ContentItem[] = [
		...messages.map(m => ({type: 'message' as const, data: m})),
		...hookItems,
		...sessionEndMessages,
	].sort((a, b) => getItemTime(a) - getItemTime(b));

	// Separate stable items (for Static) from items that may update (rendered dynamically).
	const stableItems: DisplayItem[] = [
		{type: 'header', id: 'header'},
		...contentItems.filter(isStableContent),
	];
	const dynamicItems = contentItems.filter(item => !isStableContent(item));

	return {stableItems, dynamicItems, childEventsByAgent};
}
