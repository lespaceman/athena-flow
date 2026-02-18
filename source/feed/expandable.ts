import type {FeedEvent, FeedEventKind} from './types.js';

const EXPANDABLE_KINDS: ReadonlySet<FeedEventKind> = new Set([
	'tool.pre',
	'permission.request',
	'subagent.start',
	'run.start',
	'stop.request',
]);

export function isExpandable(event: FeedEvent): boolean {
	return EXPANDABLE_KINDS.has(event.kind);
}
