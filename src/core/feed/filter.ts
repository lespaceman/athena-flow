// src/feed/filter.ts
import type {FeedEvent} from './types';

const TASK_TOOL_NAMES = new Set([
	'TodoWrite',
	'TaskCreate',
	'TaskUpdate',
	'TaskList',
	'TaskGet',
]);

function isTaskToolEvent(event: FeedEvent): boolean {
	if (event.kind !== 'tool.pre' && event.kind !== 'tool.post') return false;
	return TASK_TOOL_NAMES.has(event.data.tool_name);
}

export function shouldExcludeFromFeed(event: FeedEvent): boolean {
	if (isTaskToolEvent(event)) return true;
	// Plan-delta todo.update events are render-invalidation signals only.
	if (event.kind === 'todo.update') return true;
	return false;
}
