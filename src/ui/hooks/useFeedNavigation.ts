import {useState, useCallback, useEffect, useMemo, useRef} from 'react';
import {type TimelineEntry} from '../../core/feed/timeline';

export type UseFeedNavigationOptions = {
	filteredEntries: TimelineEntry[];
	feedContentRows: number;
	/** Minimum valid cursor index — entries below this are in static scrollback. */
	staticFloor?: number;
};

export type UseFeedNavigationResult = {
	feedCursor: number;
	tailFollow: boolean;
	expandedId: string | null;
	detailScroll: number;
	feedViewportStart: number;
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
	staticFloor = 0,
}: UseFeedNavigationOptions): UseFeedNavigationResult {
	const [feedCursor, setFeedCursor] = useState(0);
	const [tailFollow, setTailFollow] = useState(true);
	const [expandedId, setExpandedId] = useState<string | null>(null);
	const [detailScroll, setDetailScroll] = useState(0);

	const filteredEntriesRef = useRef(filteredEntries);
	filteredEntriesRef.current = filteredEntries;

	// Clamp cursor when entries shrink or staticFloor advances
	useEffect(() => {
		setFeedCursor(prev =>
			Math.max(
				staticFloor,
				Math.min(prev, Math.max(0, filteredEntries.length - 1)),
			),
		);
	}, [filteredEntries.length, staticFloor]);

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

	const staticFloorRef = useRef(staticFloor);
	staticFloorRef.current = staticFloor;

	const moveFeedCursor = useCallback((delta: number) => {
		setFeedCursor(prev => {
			const max = Math.max(0, filteredEntriesRef.current.length - 1);
			return Math.max(staticFloorRef.current, Math.min(prev + delta, max));
		});
		setTailFollow(false);
	}, []);

	const jumpToTail = useCallback(() => {
		setTailFollow(true);
		setFeedCursor(Math.max(0, filteredEntriesRef.current.length - 1));
	}, []);

	const jumpToTop = useCallback(() => {
		setTailFollow(false);
		setFeedCursor(staticFloorRef.current);
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

		const maxStart = Math.max(0, total - feedContentRows);

		let start: number;
		if (tailFollow) {
			start = maxStart;
		} else {
			// Center cursor in viewport, then clamp
			start = Math.max(
				0,
				Math.min(feedCursor - Math.floor(feedContentRows / 2), maxStart),
			);
		}

		// Ensure cursor is visible
		if (feedCursor < start) start = feedCursor;
		const end = start + feedContentRows - 1;
		if (feedCursor > end) {
			start = feedCursor - feedContentRows + 1;
		}

		return Math.max(staticFloor, Math.min(start, maxStart));
	}, [filteredEntries, feedCursor, feedContentRows, tailFollow, staticFloor]);

	return {
		feedCursor,
		tailFollow,
		expandedId,
		detailScroll,
		feedViewportStart,
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
