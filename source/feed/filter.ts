// source/feed/filter.ts
import type {FeedEvent} from './types.js';

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
	return event.kind === 'subagent.stop' || isTaskToolEvent(event);
}
