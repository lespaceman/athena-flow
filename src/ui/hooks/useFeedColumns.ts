import {useMemo} from 'react';
import {type TimelineEntry} from '../../feed/timeline';

export type FeedColumns = {
	toolW: number;
	detailsW: number;
	resultW: number;
	gapW: number;
	detailsResultGapW: number;
	timeEventGapW: number;
};

const GUTTER_W = 1;
const TIME_W = 5;
const EVENT_W = 12;
const ACTOR_W = 10;
// Reserve 3 cells for suffix: leading space + potentially wide expand glyph.
const SUFFIX_W = 3;
/** Fixed non-gap overhead: gutter + time + event + actor + suffix. */
const BASE_FIXED = GUTTER_W + TIME_W + EVENT_W + ACTOR_W + SUFFIX_W;

export function useFeedColumns(
	entries: TimelineEntry[],
	innerWidth: number,
): FeedColumns {
	return useMemo(() => {
		let maxToolLen = 0;
		let maxResultLen = 0;
		for (const e of entries) {
			const len = (e.toolColumn ?? '').length;
			if (len > maxToolLen) maxToolLen = len;
			const outcomeLen = (e.summaryOutcome ?? '').length;
			if (outcomeLen > maxResultLen) maxResultLen = outcomeLen;
		}

		// Keep TIME visually separated from EVENT, while other gaps stay compact.
		const timeEventGapW = innerWidth >= 120 ? 2 : 1;
		const gapW = innerWidth >= 200 ? 2 : 1;
		const toolW = Math.min(16, Math.max(8, maxToolLen));
		const resultMaxW =
			innerWidth >= 240
				? 48
				: innerWidth >= 220
					? 42
					: innerWidth >= 180
						? 34
						: innerWidth >= 140
							? 26
							: 18;
		const resultW =
			maxResultLen > 0 ? Math.min(resultMaxW, Math.max(8, maxResultLen)) : 0;
		const detailsResultGapW = resultW > 0 ? Math.max(2, gapW) : 0;

		// gapW count excludes the dedicated timeEventGapW and detailsResultGapW.
		const gapCount = 4;
		const fixedWithoutDetails =
			BASE_FIXED +
			toolW +
			(resultW > 0 ? resultW : 0) +
			timeEventGapW +
			gapCount * gapW +
			detailsResultGapW;
		const availableForDetails = Math.max(0, innerWidth - fixedWithoutDetails);
		// Use all available width for details to minimize truncation on wide terminals.
		const detailsW = availableForDetails;
		return {
			toolW,
			detailsW,
			resultW,
			gapW,
			detailsResultGapW,
			timeEventGapW,
		};
	}, [entries, innerWidth]);
}
