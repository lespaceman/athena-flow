import {useMemo, useEffect, useState} from 'react';
import {type FeedItem} from './useFeed.js';
import {type FeedEvent} from '../feed/types.js';
import {type Message as MessageType} from '../types/index.js';
import {
	type TimelineEntry,
	type RunSummary,
	eventOperation,
	eventSummary,
	mergedEventOperation,
	mergedEventSummary,
	expansionForEvent,
	isEventError,
	isEventExpandable,
	toRunStatus,
	VERBOSE_ONLY_KINDS,
} from '../feed/timeline.js';
import {compactText, actorLabel} from '../utils/format.js';

export type UseTimelineOptions = {
	messages: MessageType[];
	feedItems: FeedItem[];
	feedEvents: FeedEvent[];
	currentRun: {
		run_id: string;
		trigger: {prompt_preview?: string};
		started_at: number;
	} | null;
	runFilter: string;
	errorsOnly: boolean;
	searchQuery: string;
	postByToolUseId?: Map<string, FeedEvent>;
	verbose?: boolean;
};

export type UseTimelineResult = {
	stableItems: FeedItem[];
	timelineEntries: TimelineEntry[];
	runSummaries: RunSummary[];
	filteredEntries: TimelineEntry[];
	searchMatches: number[];
	searchMatchSet: Set<number>;
	searchMatchPos: number;
	setSearchMatchPos: React.Dispatch<React.SetStateAction<number>>;
};

export function useTimeline({
	messages,
	feedItems,
	feedEvents,
	currentRun,
	runFilter,
	errorsOnly,
	searchQuery,
	postByToolUseId,
	verbose,
}: UseTimelineOptions): UseTimelineResult {
	const [searchMatchPos, setSearchMatchPos] = useState(0);

	const stableItems = useMemo((): FeedItem[] => {
		const messageItems: FeedItem[] = messages.map(m => ({
			type: 'message' as const,
			data: m,
		}));
		return [...messageItems, ...feedItems].sort((a, b) => {
			const seqA =
				a.type === 'message' ? a.data.timestamp.getTime() : a.data.seq;
			const seqB =
				b.type === 'message' ? b.data.timestamp.getTime() : b.data.seq;
			return seqA - seqB;
		});
	}, [messages, feedItems]);

	const timelineEntries = useMemo((): TimelineEntry[] => {
		const entries: TimelineEntry[] = [];
		let activeRunId: string | undefined;
		let messageCounter = 1;

		for (const item of stableItems) {
			if (item.type === 'message') {
				const id = `M${String(messageCounter++).padStart(3, '0')}`;
				const summary = compactText(item.data.content, 200);
				const details = item.data.content;
				entries.push({
					id,
					ts: item.data.timestamp.getTime(),
					runId: activeRunId,
					op: item.data.role === 'user' ? 'msg.user' : 'msg.agent',
					actor: item.data.role === 'user' ? 'USER' : 'AGENT',
					actorId: item.data.role === 'user' ? 'user' : 'agent:root',
					summary,
					searchText: `${summary}\n${details}`,
					error: false,
					expandable: details.length > 120,
					details,
				});
				continue;
			}

			const event = item.data;
			if (event.kind === 'run.start') {
				activeRunId = event.run_id;
			}

			// Verbose filtering: skip lifecycle events when not verbose
			if (!verbose && VERBOSE_ONLY_KINDS.has(event.kind)) {
				// Still track run boundaries for activeRunId
				if (event.kind === 'run.end') {
					activeRunId = undefined;
				}
				continue;
			}

			// Merge tool.post/tool.failure into their paired tool.pre
			// If this post/failure event is in the map, it will be rendered
			// by the paired tool.pre entry — skip it here.
			if (
				(event.kind === 'tool.post' || event.kind === 'tool.failure') &&
				postByToolUseId &&
				event.data.tool_use_id &&
				postByToolUseId.get(event.data.tool_use_id) === event
			) {
				continue;
			}

			// For tool.pre, look up paired post event
			const pairedPost =
				(event.kind === 'tool.pre' || event.kind === 'permission.request') &&
				event.data.tool_use_id
					? postByToolUseId?.get(event.data.tool_use_id)
					: undefined;

			const op = pairedPost
				? mergedEventOperation(event, pairedPost)
				: eventOperation(event);
			const {text: summary, dimStart: summaryDimStart} = pairedPost
				? mergedEventSummary(event, pairedPost)
				: eventSummary(event);
			const details = isEventExpandable(event) ? expansionForEvent(event) : '';
			entries.push({
				id: event.event_id,
				ts: event.ts,
				runId: event.run_id,
				op,
				actor: actorLabel(event.actor_id),
				actorId: event.actor_id,
				summary,
				summaryDimStart,
				searchText: `${summary}\n${details}`,
				error: isEventError(event) || pairedPost?.kind === 'tool.failure',
				expandable: isEventExpandable(event),
				details,
				feedEvent: event,
			});
			if (event.kind === 'run.end') {
				activeRunId = undefined;
			}
		}
		return entries;
	}, [stableItems, postByToolUseId, verbose]);

	const runSummaries = useMemo((): RunSummary[] => {
		const map = new Map<string, RunSummary>();

		for (const event of feedEvents) {
			if (event.kind === 'run.start') {
				map.set(event.run_id, {
					runId: event.run_id,
					title: compactText(
						event.data.trigger.prompt_preview || 'Untitled run',
						46,
					),
					status: 'RUNNING',
					startedAt: event.ts,
				});
				continue;
			}
			if (event.kind === 'run.end') {
				const existing = map.get(event.run_id);
				if (existing) {
					existing.status = toRunStatus(event);
					existing.endedAt = event.ts;
				} else {
					map.set(event.run_id, {
						runId: event.run_id,
						title: 'Untitled run',
						status: toRunStatus(event),
						startedAt: event.ts,
						endedAt: event.ts,
					});
				}
			}
		}

		const summaries = Array.from(map.values()).sort(
			(a, b) => a.startedAt - b.startedAt,
		);

		if (currentRun) {
			const found = summaries.find(s => s.runId === currentRun.run_id);
			if (found) {
				found.status = 'RUNNING';
			} else {
				summaries.push({
					runId: currentRun.run_id,
					title: compactText(
						currentRun.trigger.prompt_preview || 'Untitled run',
						46,
					),
					status: 'RUNNING',
					startedAt: currentRun.started_at,
				});
			}
		}

		return summaries;
	}, [feedEvents, currentRun]);

	const filteredEntries = useMemo(() => {
		return timelineEntries.filter(entry => {
			if (runFilter !== 'all' && entry.runId !== runFilter) return false;
			if (errorsOnly && !entry.error) return false;
			return true;
		});
	}, [timelineEntries, runFilter, errorsOnly]);

	const searchMatches = useMemo(() => {
		const q = searchQuery.trim().toLowerCase();
		if (!q) return [] as number[];
		const matches: number[] = [];
		for (let i = 0; i < filteredEntries.length; i++) {
			if (filteredEntries[i]!.searchText.toLowerCase().includes(q)) {
				matches.push(i);
			}
		}
		return matches;
	}, [filteredEntries, searchQuery]);

	const searchMatchSet = useMemo(() => new Set(searchMatches), [searchMatches]);

	useEffect(() => {
		setSearchMatchPos(prev =>
			Math.min(prev, Math.max(0, searchMatches.length - 1)),
		);
	}, [searchMatches.length]);

	return {
		stableItems,
		timelineEntries,
		runSummaries,
		filteredEntries,
		searchMatches,
		searchMatchSet,
		searchMatchPos,
		setSearchMatchPos,
	};
}
