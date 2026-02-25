import {useMemo} from 'react';
import {type TimelineEntry} from '../feed/timeline.js';

export type FeedColumns = {
	toolW: number;
	detailsW: number;
};

/** Fixed overhead: gutter(1) + time(5) + gap(2) + event(12) + gap(2) + actor(10) + gap(2) + gap(2) + suffix(2) = 38 */
const FIXED = 38;

export function useFeedColumns(
	entries: TimelineEntry[],
	innerWidth: number,
): FeedColumns {
	return useMemo(() => {
		let maxToolLen = 0;
		for (const e of entries) {
			const len = (e.toolColumn ?? '').length;
			if (len > maxToolLen) maxToolLen = len;
		}
		const toolW = Math.min(16, Math.max(10, maxToolLen));
		const detailsW = Math.max(0, innerWidth - FIXED - toolW);
		return {toolW, detailsW};
	}, [entries, innerWidth]);
}
