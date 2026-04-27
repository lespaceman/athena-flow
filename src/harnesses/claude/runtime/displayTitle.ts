import type {RuntimeEvent} from '../../../core/runtime/types';
import {
	isToolDisplayKind,
	type RuntimeEventDataMap,
	type RuntimeEventKind,
} from '../../../core/runtime/events';

/**
 * Surfaces Claude's model-authored `tool_input.description` (Bash, Agent)
 * so the feed timeline shows the intent rather than just the tool name.
 */
export function buildClaudeDisplay<K extends RuntimeEventKind>(
	kind: K,
	data: RuntimeEventDataMap[K],
): RuntimeEvent['display'] | undefined {
	if (!isToolDisplayKind(kind)) return undefined;

	const d = data as {tool_name?: string; tool_input?: Record<string, unknown>};
	if (!d.tool_name) return undefined;

	const description = d.tool_input?.['description'];
	if (typeof description !== 'string' || !description.trim()) return undefined;

	return {title: `${d.tool_name}: ${description.trim()}`};
}
