import type {RuntimeEvent} from '../../../core/runtime/types';
import {
	isToolDisplayKind,
	type RuntimeEventDataMap,
	type RuntimeEventKind,
} from '../../../core/runtime/events';
import type {CommandAction} from '../protocol/generated/v2/CommandAction';

/**
 * Reads Codex's parsed `commandActions[0]` (read/search/listFiles) so feed
 * rows show the intent instead of the wrapped `/bin/zsh -lc "…"` shell.
 */
export function buildCodexDisplay<K extends RuntimeEventKind>(
	kind: K,
	data: RuntimeEventDataMap[K],
): RuntimeEvent['display'] | undefined {
	if (!isToolDisplayKind(kind)) return undefined;

	const d = data as {tool_name?: string; tool_input?: Record<string, unknown>};
	// Codex normalizes shell-shaped tools to "Bash"; other tools (WebSearch,
	// Edit, MCP) carry no commandActions and fall through to neutral titles.
	if (d.tool_name !== 'Bash') return undefined;

	const actions = d.tool_input?.['commandActions'];
	if (!Array.isArray(actions) || actions.length === 0) return undefined;
	const title = describeAction(actions[0] as CommandAction);
	return title ? {title} : undefined;
}

function describeAction(a: CommandAction): string | undefined {
	if (a.type === 'read') return `Read ${a.name}`;
	if (a.type === 'search') {
		if (!a.query) return undefined;
		const where = a.path && a.path !== '.' ? ` in ${a.path}` : '';
		return `Search '${a.query}'${where}`;
	}
	if (a.type === 'listFiles') return a.path ? `List ${a.path}` : 'List files';
	return undefined;
}
