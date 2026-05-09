import {useMemo, useRef, useCallback} from 'react';
import {type FeedItem} from '../../core/feed/items';
import {type FeedEvent} from '../../core/feed/types';
import {IndexedTimeline} from '../../core/feed/indexedTimeline';
import {type TimelineEntry, type RunSummary} from '../../core/feed/timeline';
import {compactText} from '../../shared/utils/format';

const EMPTY_MATCHES: readonly number[] = Object.freeze([] as number[]);
const EMPTY_MATCH_SET: ReadonlySet<number> = Object.freeze(new Set<number>());

type UseTimelineOptions = {
	feedItems: FeedItem[];
	feedEvents: FeedEvent[];
	currentRun: {
		run_id: string;
		trigger: {prompt_preview?: string};
		started_at: number;
	} | null;
	runFilter?: string;
	errorsOnly?: boolean;
	searchQuery: string;
	postByToolUseId?: Map<string, FeedEvent>;
	verbose?: boolean;
};

type UseTimelineResult = {
	timelineEntries: TimelineEntry[];
	runSummaries: RunSummary[];
	filteredEntries: TimelineEntry[];
	searchMatches: readonly number[];
	searchMatchSet: ReadonlySet<number>;
	getEntrySearchText: (entry: TimelineEntry) => string;
};

export function useTimeline({
	feedItems,
	feedEvents,
	currentRun,
	runFilter = 'all',
	errorsOnly = false,
	searchQuery,
	postByToolUseId,
	verbose,
}: UseTimelineOptions): UseTimelineResult {
	const indexedRef = useRef<IndexedTimeline | null>(null);

	if (!indexedRef.current) {
		indexedRef.current = new IndexedTimeline();
	}

	const timelineEntries = useMemo((): TimelineEntry[] => {
		indexedRef.current!.update(
			feedItems,
			feedEvents,
			postByToolUseId,
			!!verbose,
		);
		return indexedRef.current!.getEntries();
	}, [feedItems, feedEvents, postByToolUseId, verbose]);

	const runSummaries = useMemo((): RunSummary[] => {
		const base = indexedRef.current!.getRunSummaries();
		if (!currentRun) return base;

		const found = base.find(s => s.runId === currentRun.run_id);
		if (found && found.status === 'RUNNING') return base;

		// Clone to avoid mutating IndexedTimeline's cached objects.
		if (found) {
			return base.map(s =>
				s.runId === currentRun.run_id ? {...s, status: 'RUNNING' as const} : s,
			);
		}

		return [
			...base,
			{
				runId: currentRun.run_id,
				title: compactText(
					currentRun.trigger.prompt_preview || 'Untitled run',
					46,
				),
				status: 'RUNNING' as const,
				startedAt: currentRun.started_at,
			},
		];
		// eslint-disable-next-line react-hooks/exhaustive-deps -- timelineEntries triggers recompute after IndexedTimeline.update()
	}, [timelineEntries, currentRun]);

	const filteredEntries = useMemo(() => {
		return indexedRef.current!.getFilteredView(runFilter, errorsOnly);
		// eslint-disable-next-line react-hooks/exhaustive-deps -- timelineEntries triggers recompute when entries change
	}, [timelineEntries, runFilter, errorsOnly]);

	const searchMatches = useMemo(() => {
		if (!searchQuery.trim()) return EMPTY_MATCHES;
		return indexedRef.current!.getSearchMatches(filteredEntries, searchQuery);
	}, [filteredEntries, searchQuery]);

	const searchMatchSet = useMemo(
		() =>
			searchMatches === EMPTY_MATCHES
				? EMPTY_MATCH_SET
				: new Set(searchMatches),
		[searchMatches],
	);

	const getEntrySearchText = useCallback(
		(entry: TimelineEntry) => indexedRef.current!.getEntrySearchText(entry),
		[],
	);

	return {
		timelineEntries,
		runSummaries,
		filteredEntries,
		searchMatches,
		searchMatchSet,
		getEntrySearchText,
	};
}
