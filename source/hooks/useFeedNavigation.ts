import {useState, useCallback, useEffect, useMemo, useRef} from 'react';
import {type TimelineEntry} from '../feed/timeline.js';

export type UseFeedNavigationOptions = {
	filteredEntries: TimelineEntry[];
	feedContentRows: number;
};

export type UseFeedNavigationResult = {
	feedCursor: number;
	tailFollow: boolean;
	expandedId: string | null;
	detailScroll: number;
	feedViewportStart: number;
	visibleFeedEntries: TimelineEntry[];
	moveFeedCursor: (delta: number) => void;
	jumpToTail: () => void;
	jumpToTop: () => void;
	toggleExpandedAtCursor: () => void;
	scrollDetail: (delta: number, maxDetailScroll: number) => void;
	setFeedCursor: React.Dispatch<React.SetStateAction<number>>;
	setTailFollow: React.Dispatch<React.SetStateAction<boolean>>;
	setExpandedId: React.Dispatch<React.SetStateAction<string | null>>;
	setDetailScroll: React.Dispatch<React.SetStateAction<number>>;
};

export function useFeedNavigation({
	filteredEntries,
	feedContentRows,
}: UseFeedNavigationOptions): UseFeedNavigationResult {
	const [feedCursor, setFeedCursor] = useState(0);
	const [tailFollow, setTailFollow] = useState(true);
	const [expandedId, setExpandedId] = useState<string | null>(null);
	const [detailScroll, setDetailScroll] = useState(0);

	const filteredEntriesRef = useRef(filteredEntries);
	filteredEntriesRef.current = filteredEntries;

	// Clamp cursor when entries shrink
	useEffect(() => {
		setFeedCursor(prev =>
			Math.min(prev, Math.max(0, filteredEntries.length - 1)),
		);
	}, [filteredEntries.length]);

	// Tail-follow: snap cursor to end
	useEffect(() => {
		if (!tailFollow) return;
		setFeedCursor(Math.max(0, filteredEntries.length - 1));
	}, [filteredEntries.length, tailFollow]);

	// Reset detail scroll when expanded entry changes
	useEffect(() => {
		setDetailScroll(0);
	}, [expandedId]);

	// Collapse expanded entry if it disappears from filtered list
	useEffect(() => {
		if (expandedId && !filteredEntries.some(entry => entry.id === expandedId)) {
			setExpandedId(null);
		}
	}, [expandedId, filteredEntries]);

	const moveFeedCursor = useCallback((delta: number) => {
		setFeedCursor(prev => {
			const max = Math.max(0, filteredEntriesRef.current.length - 1);
			return Math.max(0, Math.min(prev + delta, max));
		});
		setTailFollow(false);
	}, []);

	const jumpToTail = useCallback(() => {
		setTailFollow(true);
		setFeedCursor(Math.max(0, filteredEntriesRef.current.length - 1));
	}, []);

	const jumpToTop = useCallback(() => {
		setTailFollow(false);
		setFeedCursor(0);
	}, []);

	const toggleExpandedAtCursor = useCallback(() => {
		const entry = filteredEntriesRef.current[feedCursor];
		if (!entry?.expandable) return;
		setExpandedId(prev => (prev === entry.id ? null : entry.id));
	}, [feedCursor]);

	const scrollDetail = useCallback((delta: number, maxDetailScroll: number) => {
		setDetailScroll(prev =>
			Math.max(0, Math.min(prev + delta, maxDetailScroll)),
		);
	}, []);

	const feedViewportStart = useMemo(() => {
		const total = filteredEntries.length;
		if (feedContentRows <= 0) return 0;
		if (total <= feedContentRows) return 0;

		let start = tailFollow
			? total - feedContentRows
			: Math.max(
					0,
					Math.min(
						feedCursor - Math.floor(feedContentRows / 2),
						total - feedContentRows,
					),
				);

		if (feedCursor < start) start = feedCursor;
		if (feedCursor >= start + feedContentRows) {
			start = feedCursor - feedContentRows + 1;
		}

		return Math.max(0, Math.min(start, total - feedContentRows));
	}, [filteredEntries.length, feedCursor, feedContentRows, tailFollow]);

	// Slice extra entries beyond feedContentRows to account for minute
	// separators that consume display lines without advancing the entry index.
	// A 2x buffer is sufficient since at most every other line is a separator.
	const visibleFeedEntries = filteredEntries.slice(
		feedViewportStart,
		feedViewportStart + feedContentRows * 2,
	);

	return {
		feedCursor,
		tailFollow,
		expandedId,
		detailScroll,
		feedViewportStart,
		visibleFeedEntries,
		moveFeedCursor,
		jumpToTail,
		jumpToTop,
		toggleExpandedAtCursor,
		scrollDetail,
		setFeedCursor,
		setTailFollow,
		setExpandedId,
		setDetailScroll,
	};
}
