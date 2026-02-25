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

		// Count how many entries fit in `rows` display lines starting from
		// `from`, accounting for minute-separator blank lines that consume
		// a display row without advancing the entry index.
		const entriesThatFit = (from: number, rows: number): number => {
			let lines = 0;
			let count = 0;
			let prevMinute: number | undefined;
			for (let i = from; i < total && lines < rows; i++) {
				const entryMinute = Math.floor(filteredEntries[i]!.ts / 60000);
				if (
					count > 0 &&
					prevMinute !== undefined &&
					entryMinute !== prevMinute
				) {
					lines++; // minute separator blank line
					if (lines >= rows) break;
				}
				prevMinute = entryMinute;
				lines++;
				count++;
			}
			return count;
		};

		// Walk backwards from the end to find the start index that fills
		// exactly feedContentRows display lines (for tail-follow).
		const tailStart = (): number => {
			let lines = 0;
			let start = total;
			let prevMinute: number | undefined;
			for (let i = total - 1; i >= 0 && lines < feedContentRows; i--) {
				const entryMinute = Math.floor(filteredEntries[i]!.ts / 60000);
				// Check if a minute separator would appear between this
				// entry and the one after it (which we already counted).
				if (prevMinute !== undefined && entryMinute !== prevMinute) {
					lines++; // minute separator blank line
					if (lines >= feedContentRows) break;
				}
				prevMinute = entryMinute;
				lines++;
				start = i;
			}
			return start;
		};

		let start: number;
		if (tailFollow) {
			start = tailStart();
		} else {
			// Center cursor in viewport, then clamp
			const fit = entriesThatFit(0, feedContentRows);
			if (total <= fit) return 0;
			start = Math.max(
				0,
				Math.min(feedCursor - Math.floor(fit / 2), total - fit),
			);
		}

		// Ensure cursor is visible
		if (feedCursor < start) start = feedCursor;
		const visible = entriesThatFit(start, feedContentRows);
		if (feedCursor >= start + visible) {
			start = feedCursor - visible + 1;
		}

		return Math.max(0, start);
	}, [filteredEntries, feedCursor, feedContentRows, tailFollow]);

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
