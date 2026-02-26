import {useMemo} from 'react';
import {type TimelineEntry} from '../feed/timeline.js';

export type FeedColumns = {
	toolW: number;
	detailsW: number;
	resultW: number;
	gapW: number;
	timeEventGapW: number;
};

const GUTTER_W = 1;
const TIME_W = 5;
const EVENT_W = 12;
const ACTOR_W = 10;
const SUFFIX_W = 2;
/** Fixed non-gap overhead: gutter + time + event + actor + suffix. */
const BASE_FIXED = GUTTER_W + TIME_W + EVENT_W + ACTOR_W + SUFFIX_W;

export function useFeedColumns(
	entries: TimelineEntry[],
	innerWidth: number,
): FeedColumns {
	return useMemo(() => {
		let maxToolLen = 0;
		let maxResultLen = 0;
		let maxDetailLen = 0;
		for (const e of entries) {
			const len = (e.toolColumn ?? '').length;
			if (len > maxToolLen) maxToolLen = len;
			const outcomeLen = (e.summaryOutcome ?? '').length;
			if (outcomeLen > maxResultLen) maxResultLen = outcomeLen;
			const verbLen = e.summarySegments
				.filter(s => s.role === 'verb')
				.reduce((n, s) => n + s.text.length, 0);
			const detailLen = Math.max(0, e.summary.length - verbLen);
			if (detailLen > maxDetailLen) maxDetailLen = detailLen;
		}

		// Keep TIME visually separated from EVENT, while other gaps stay compact.
		const timeEventGapW = innerWidth >= 120 ? 2 : 1;
		const gapW = innerWidth >= 200 ? 2 : 1;
		const toolW = Math.min(14, Math.max(8, maxToolLen));
		const resultW =
			maxResultLen > 0 ? Math.min(16, Math.max(8, maxResultLen)) : 0;

		// gapW count excludes the dedicated timeEventGapW.
		const gapCount = resultW > 0 ? 5 : 4;
		const fixedWithoutDetails =
			BASE_FIXED +
			toolW +
			(resultW > 0 ? resultW : 0) +
			timeEventGapW +
			gapCount * gapW;
		const availableForDetails = Math.max(0, innerWidth - fixedWithoutDetails);

		const detailsFloor = innerWidth >= 180 ? 64 : innerWidth >= 140 ? 54 : 42;
		const detailsCeiling =
			innerWidth >= 220
				? 120
				: innerWidth >= 180
					? 104
					: innerWidth >= 140
						? 88
						: 72;
		const preferredDetails = Math.min(
			detailsCeiling,
			Math.max(detailsFloor, maxDetailLen + 4),
		);
		const detailsW = Math.min(availableForDetails, preferredDetails);
		return {toolW, detailsW, resultW, gapW, timeEventGapW};
	}, [entries, innerWidth]);
}
