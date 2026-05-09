import {compactText, actorLabel} from '../../shared/utils/format';
import {isSubagentTool} from './todo';
import {resolveToolColumn, resolveEventToolColumn} from './toolDisplay';
import type {FeedItem} from './items';
import type {FeedEvent} from './types';
import type {TimelineEntry, RunSummary} from './timeline';
import {
	opCategory,
	eventOperation,
	eventLabel,
	eventSummary,
	mergedEventOperation,
	mergedEventLabel,
	mergedEventSummary,
	expansionForEvent,
	isEventError,
	isEventExpandable,
	toRunStatus,
	VERBOSE_ONLY_KINDS,
	computeDuplicateActors,
} from './timeline';

type SearchCacheEntry = {
	matches: number[];
	lastScanned: number;
};

type TimelineBuildCache = {
	feedItems: FeedItem[];
	feedEvents: FeedEvent[];
	entries: TimelineEntry[];
	activeRunId?: string;
	messageCounter: number;
	subagentTypes: Map<string, string>;
	pendingEntryIndexByToolUseId: Map<string, number>;
	verbose: boolean;
};

const MAX_SEARCH_CACHE_SIZE = 8;

function subagentActorLabel(_agentType?: string, _agentId?: string): string {
	return 'SUB AGENT';
}

function buildSubagentTypeMap(feedEvents: FeedEvent[]): Map<string, string> {
	const map = new Map<string, string>();
	updateSubagentTypeMap(map, feedEvents);
	return map;
}

function updateSubagentTypeMap(
	map: Map<string, string>,
	feedEvents: FeedEvent[],
): void {
	for (const event of feedEvents) {
		if (event.kind !== 'subagent.start' && event.kind !== 'subagent.stop') {
			continue;
		}
		const agentId = event.data.agent_id;
		const agentType = event.data.agent_type;
		if (!agentId || !agentType || map.has(agentId)) continue;
		map.set(agentId, agentType);
	}
}

function resolveActorLabel(
	event: FeedEvent,
	subagentTypes: Map<string, string>,
): string {
	if (!event.actor_id.startsWith('subagent:')) {
		return actorLabel(event.actor_id);
	}
	const agentId = event.actor_id.slice('subagent:'.length);
	const eventAgentType =
		event.kind === 'subagent.start' || event.kind === 'subagent.stop'
			? event.data.agent_type
			: undefined;
	return subagentActorLabel(
		eventAgentType || subagentTypes.get(agentId),
		agentId,
	);
}

function buildMessageEntry(
	item: Extract<FeedItem, {type: 'message'}>['data'],
	activeRunId: string | undefined,
	messageCounter: number,
): TimelineEntry {
	const summary = compactText(item.content, 200);
	const details = item.content;
	return {
		id: `M${String(messageCounter).padStart(3, '0')}`,
		ts: item.timestamp.getTime(),
		runId: activeRunId,
		op: item.role === 'user' ? 'User Msg' : 'Agent Msg',
		opTag: item.role === 'user' ? 'msg.user' : 'msg.agent',
		actor: item.role === 'user' ? 'USER' : 'AGENT',
		actorId: item.role === 'user' ? 'user' : 'agent:root',
		toolColumn: '',
		summary,
		summarySegments: [{text: summary, role: 'plain' as const}],
		searchText: `${summary}\n${details}`,
		error: false,
		expandable: details.length > 120,
		details,
		duplicateActor: false,
	};
}

function shouldSkipEvent(event: FeedEvent, verbose?: boolean): boolean {
	if (!verbose && VERBOSE_ONLY_KINDS.has(event.kind)) {
		return true;
	}
	if (
		!verbose &&
		event.kind === 'stop.request' &&
		!event.data.stop_hook_active
	) {
		return true;
	}
	return false;
}

function mergedToolUseId(
	event: FeedEvent,
	postByToolUseId?: Map<string, FeedEvent>,
): string | undefined {
	if (
		(event.kind !== 'tool.post' && event.kind !== 'tool.failure') ||
		isSubagentTool(event.data.tool_name) ||
		!postByToolUseId
	) {
		return undefined;
	}
	const toolUseId = event.data.tool_use_id;
	if (!toolUseId) return undefined;
	return postByToolUseId.get(toolUseId) === event ? toolUseId : undefined;
}

function pairedPostForEvent(
	event: FeedEvent,
	postByToolUseId?: Map<string, FeedEvent>,
): FeedEvent | undefined {
	if (
		(event.kind !== 'tool.pre' && event.kind !== 'permission.request') ||
		isSubagentTool(event.data.tool_name) ||
		!event.data.tool_use_id
	) {
		return undefined;
	}
	return postByToolUseId?.get(event.data.tool_use_id);
}

function pendingToolUpdateUseId(event: FeedEvent): string | undefined {
	if (
		event.kind !== 'tool.delta' &&
		event.kind !== 'tool.post' &&
		event.kind !== 'tool.failure'
	) {
		return undefined;
	}
	if (isSubagentTool(event.data.tool_name)) {
		return undefined;
	}
	return event.data.tool_use_id;
}

function buildEventEntry(
	event: FeedEvent,
	subagentTypes: Map<string, string>,
	pairedPost?: FeedEvent,
): TimelineEntry {
	const opTag = pairedPost
		? mergedEventOperation(event, pairedPost)
		: eventOperation(event);
	const op = pairedPost
		? mergedEventLabel(event, pairedPost)
		: eventLabel(event);
	const summaryResult = pairedPost
		? mergedEventSummary(event, pairedPost)
		: eventSummary(event);
	const {text: summary, segments: summarySegments} = summaryResult;
	const toolColumn =
		event.kind === 'tool.pre' ||
		event.kind === 'tool.post' ||
		event.kind === 'tool.failure'
			? resolveToolColumn(event.data.tool_name)
			: resolveEventToolColumn(event);

	return {
		id: event.event_id,
		ts: event.ts,
		runId: event.run_id,
		op,
		opTag,
		actor: resolveActorLabel(event, subagentTypes),
		actorId: event.actor_id,
		toolColumn,
		summary,
		summarySegments,
		summaryOutcome: summaryResult.outcome,
		summaryOutcomeZero: summaryResult.outcomeZero,
		searchText: summary,
		error: isEventError(event) || pairedPost?.kind === 'tool.failure',
		expandable: isEventExpandable(event),
		details: '',
		feedEvent: event,
		pairedPostEvent: pairedPost,
		duplicateActor: false,
	};
}

function maybeBuildEventEntry(
	event: FeedEvent,
	subagentTypes: Map<string, string>,
	postByToolUseId: Map<string, FeedEvent> | undefined,
	verbose?: boolean,
): TimelineEntry | null {
	if (shouldSkipEvent(event, verbose)) return null;
	if (event.kind === 'tool.delta') return null;
	if (mergedToolUseId(event, postByToolUseId)) {
		return null;
	}
	return buildEventEntry(
		event,
		subagentTypes,
		pairedPostForEvent(event, postByToolUseId),
	);
}

function rememberPendingEntry(
	pendingEntryIndexByToolUseId: Map<string, number>,
	entry: TimelineEntry,
	index: number,
): void {
	const event = entry.feedEvent;
	if (!event) return;
	if (
		(event.kind !== 'tool.pre' && event.kind !== 'permission.request') ||
		isSubagentTool(event.data.tool_name) ||
		!event.data.tool_use_id ||
		entry.pairedPostEvent
	) {
		return;
	}
	pendingEntryIndexByToolUseId.set(event.data.tool_use_id, index);
}

function recomputeDuplicateActorAt(
	entries: TimelineEntry[],
	index: number,
): void {
	const entry = entries[index]!;
	if (index === 0) {
		entry.duplicateActor = false;
		return;
	}
	const prev = entries[index - 1]!;
	const sameActor = entry.actorId === prev.actorId;
	const isBreak = opCategory(entry.opTag) !== opCategory(prev.opTag);
	entry.duplicateActor = sameActor && !isBreak;
}

function recomputeDuplicateActorsAround(
	entries: TimelineEntry[],
	index: number,
): void {
	recomputeDuplicateActorAt(entries, index);
	if (index + 1 < entries.length) {
		recomputeDuplicateActorAt(entries, index + 1);
	}
}

function sameFeedItemPrefix(previous: FeedItem[], next: FeedItem[]): boolean {
	if (next.length < previous.length) return false;
	for (let i = 0; i < previous.length; i++) {
		const prev = previous[i]!;
		const curr = next[i]!;
		if (prev.type !== curr.type || prev.data !== curr.data) {
			return false;
		}
	}
	return true;
}

function sameFeedEventPrefix(
	previous: FeedEvent[],
	next: FeedEvent[],
): boolean {
	if (next.length < previous.length) return false;
	for (let i = 0; i < previous.length; i++) {
		if (previous[i] !== next[i]) {
			return false;
		}
	}
	return true;
}

function canAppendIncrementally(
	previous: TimelineBuildCache | null,
	feedItems: FeedItem[],
	feedEvents: FeedEvent[],
	verbose: boolean,
): previous is TimelineBuildCache {
	if (!previous) return false;
	if (previous.verbose !== verbose) return false;
	return (
		sameFeedItemPrefix(previous.feedItems, feedItems) &&
		sameFeedEventPrefix(previous.feedEvents, feedEvents)
	);
}

function buildTimelineCache(
	feedItems: FeedItem[],
	feedEvents: FeedEvent[],
	postByToolUseId: Map<string, FeedEvent> | undefined,
	verbose: boolean,
): TimelineBuildCache {
	const entries: TimelineEntry[] = [];
	let activeRunId: string | undefined;
	let messageCounter = 1;
	const subagentTypes = buildSubagentTypeMap(feedEvents);
	const pendingEntryIndexByToolUseId = new Map<string, number>();

	for (const item of feedItems) {
		if (item.type === 'message') {
			entries.push(buildMessageEntry(item.data, activeRunId, messageCounter++));
			continue;
		}
		const event = item.data;
		if (event.kind === 'run.start') {
			activeRunId = event.run_id;
		}
		const entry = maybeBuildEventEntry(
			event,
			subagentTypes,
			postByToolUseId,
			verbose,
		);
		if (entry) {
			const index = entries.push(entry) - 1;
			rememberPendingEntry(pendingEntryIndexByToolUseId, entry, index);
		}
		if (event.kind === 'run.end') {
			activeRunId = undefined;
		}
	}

	computeDuplicateActors(entries);
	return {
		feedItems,
		feedEvents,
		entries,
		activeRunId,
		messageCounter,
		subagentTypes,
		pendingEntryIndexByToolUseId,
		verbose,
	};
}

function appendTimelineCache(
	previous: TimelineBuildCache,
	feedItems: FeedItem[],
	feedEvents: FeedEvent[],
	postByToolUseId: Map<string, FeedEvent> | undefined,
): TimelineBuildCache {
	const entries = previous.entries.slice();
	const subagentTypes = new Map(previous.subagentTypes);
	updateSubagentTypeMap(
		subagentTypes,
		feedEvents.slice(previous.feedEvents.length),
	);
	const pendingEntryIndexByToolUseId = new Map(
		previous.pendingEntryIndexByToolUseId,
	);
	let activeRunId = previous.activeRunId;
	let messageCounter = previous.messageCounter;

	for (const item of feedItems.slice(previous.feedItems.length)) {
		if (item.type === 'message') {
			const index =
				entries.push(
					buildMessageEntry(item.data, activeRunId, messageCounter++),
				) - 1;
			recomputeDuplicateActorsAround(entries, index);
			continue;
		}

		const event = item.data;
		if (event.kind === 'run.start') {
			activeRunId = event.run_id;
		}

		const resolvedToolUseId = pendingToolUpdateUseId(event);
		if (resolvedToolUseId) {
			const pendingIndex = pendingEntryIndexByToolUseId.get(resolvedToolUseId);
			if (pendingIndex !== undefined) {
				const pendingEntry = entries[pendingIndex]!;
				if (pendingEntry.feedEvent) {
					entries[pendingIndex] = buildEventEntry(
						pendingEntry.feedEvent,
						subagentTypes,
						event,
					);
					if (event.kind === 'tool.post' || event.kind === 'tool.failure') {
						pendingEntryIndexByToolUseId.delete(resolvedToolUseId);
					}
					recomputeDuplicateActorsAround(entries, pendingIndex);
				}
			}
			continue;
		}

		const entry = maybeBuildEventEntry(
			event,
			subagentTypes,
			postByToolUseId,
			previous.verbose,
		);
		if (entry) {
			const index = entries.push(entry) - 1;
			recomputeDuplicateActorsAround(entries, index);
			rememberPendingEntry(pendingEntryIndexByToolUseId, entry, index);
		}
		if (event.kind === 'run.end') {
			activeRunId = undefined;
		}
	}

	return {
		feedItems,
		feedEvents,
		entries,
		activeRunId,
		messageCounter,
		subagentTypes,
		pendingEntryIndexByToolUseId,
		verbose: previous.verbose,
	};
}

export class IndexedTimeline {
	private cache: TimelineBuildCache | null = null;

	private runIndex = new Map<string, number[]>();
	private errorPositions = new Set<number>();

	private _runSummaryMap = new Map<string, RunSummary>();
	private _runSummariesDirty = true;
	private _runSummariesCache: RunSummary[] = [];
	private _lastFeedEventsLength = 0;

	private searchCache = new Map<string, SearchCacheEntry>();
	private lastFilteredRef: TimelineEntry[] | null = null;

	private detailCache = new WeakMap<TimelineEntry, string>();
	private searchTextCache = new WeakMap<TimelineEntry, string>();

	private verbose = false;

	update(
		feedItems: FeedItem[],
		feedEvents: FeedEvent[],
		postByToolUseId: Map<string, FeedEvent> | undefined,
		verbose: boolean,
	): void {
		this.verbose = verbose;
		const incremental = canAppendIncrementally(
			this.cache,
			feedItems,
			feedEvents,
			this.verbose,
		);

		if (incremental) {
			this.updateRunSummaries(feedEvents);
			this.cache = appendTimelineCache(
				this.cache!,
				feedItems,
				feedEvents,
				postByToolUseId,
			);
		} else {
			this.rebuildRunSummaries(feedEvents);
			this.cache = buildTimelineCache(
				feedItems,
				feedEvents,
				postByToolUseId,
				this.verbose,
			);
		}

		this.rebuildIndexes();
	}

	getEntries(): TimelineEntry[] {
		return this.cache?.entries ?? [];
	}

	getFilteredView(runFilter?: string, errorsOnly?: boolean): TimelineEntry[] {
		const entries = this.getEntries();

		if ((!runFilter || runFilter === 'all') && !errorsOnly) {
			return entries;
		}

		let candidateIndices: number[];

		if (runFilter && runFilter !== 'all') {
			candidateIndices = this.runIndex.get(runFilter) ?? [];
		} else {
			candidateIndices = Array.from({length: entries.length}, (_, i) => i);
		}

		if (errorsOnly) {
			candidateIndices = candidateIndices.filter(i =>
				this.errorPositions.has(i),
			);
		}

		return candidateIndices.map(i => entries[i]!);
	}

	getSearchMatches(filteredEntries: TimelineEntry[], query: string): number[] {
		const q = query.trim().toLowerCase();
		if (!q) return [];

		if (filteredEntries !== this.lastFilteredRef) {
			this.searchCache.clear();
			this.lastFilteredRef = filteredEntries;
		}

		const cached = this.searchCache.get(q);
		if (cached && cached.lastScanned === filteredEntries.length) {
			return cached.matches;
		}

		const startFrom = cached ? cached.lastScanned : 0;
		const matches = cached ? [...cached.matches] : [];

		for (let i = startFrom; i < filteredEntries.length; i++) {
			const searchText = this.getEntrySearchText(filteredEntries[i]!);
			if (searchText.toLowerCase().includes(q)) {
				matches.push(i);
			}
		}

		this.searchCache.set(q, {matches, lastScanned: filteredEntries.length});

		if (this.searchCache.size > MAX_SEARCH_CACHE_SIZE) {
			const oldest = this.searchCache.keys().next().value;
			if (oldest !== undefined) {
				this.searchCache.delete(oldest);
			}
		}

		return matches;
	}

	getEntrySearchText(entry: TimelineEntry): string {
		const cached = this.searchTextCache.get(entry);
		if (cached !== undefined) return cached;
		if (!entry.feedEvent) {
			this.searchTextCache.set(entry, entry.searchText);
			return entry.searchText;
		}
		const details = this.getEntryDetails(entry);
		const searchText = details ? `${entry.summary}\n${details}` : entry.summary;
		this.searchTextCache.set(entry, searchText);
		return searchText;
	}

	private getEntryDetails(entry: TimelineEntry): string {
		if (entry.details) return entry.details;
		if (!entry.feedEvent) return entry.summary;
		const cached = this.detailCache.get(entry);
		if (cached !== undefined) return cached;
		const details = isEventExpandable(entry.feedEvent)
			? expansionForEvent(entry.feedEvent)
			: '';
		this.detailCache.set(entry, details);
		return details;
	}

	getRunSummaries(): RunSummary[] {
		if (this._runSummariesDirty) {
			this._runSummariesCache = Array.from(this._runSummaryMap.values()).sort(
				(a, b) => a.startedAt - b.startedAt,
			);
			this._runSummariesDirty = false;
		}
		return this._runSummariesCache;
	}

	private processRunEvent(event: FeedEvent): void {
		if (event.kind === 'run.start') {
			this._runSummaryMap.set(event.run_id, {
				runId: event.run_id,
				title: compactText(
					event.data.trigger.prompt_preview || 'Untitled run',
					46,
				),
				status: 'RUNNING',
				startedAt: event.ts,
			});
			this._runSummariesDirty = true;
		} else if (event.kind === 'run.end') {
			const existing = this._runSummaryMap.get(event.run_id);
			if (existing) {
				existing.status = toRunStatus(event);
				existing.endedAt = event.ts;
			} else {
				this._runSummaryMap.set(event.run_id, {
					runId: event.run_id,
					title: 'Untitled run',
					status: toRunStatus(event),
					startedAt: event.ts,
					endedAt: event.ts,
				});
			}
			this._runSummariesDirty = true;
		}
	}

	private rebuildRunSummaries(feedEvents: FeedEvent[]): void {
		this._runSummaryMap.clear();
		this._runSummariesDirty = true;
		this._lastFeedEventsLength = 0;
		this.updateRunSummaries(feedEvents);
	}

	private updateRunSummaries(feedEvents: FeedEvent[]): void {
		for (let i = this._lastFeedEventsLength; i < feedEvents.length; i++) {
			this.processRunEvent(feedEvents[i]!);
		}
		this._lastFeedEventsLength = feedEvents.length;
	}

	private addToIndex(entry: TimelineEntry, index: number): void {
		const runId = entry.runId ?? '__none__';
		let indices = this.runIndex.get(runId);
		if (!indices) {
			indices = [];
			this.runIndex.set(runId, indices);
		}
		indices.push(index);

		if (entry.error) {
			this.errorPositions.add(index);
		}
	}

	private rebuildIndexes(): void {
		this.runIndex.clear();
		this.errorPositions.clear();
		this.searchCache.clear();
		const entries = this.getEntries();
		for (let i = 0; i < entries.length; i++) {
			this.addToIndex(entries[i]!, i);
		}
	}
}
