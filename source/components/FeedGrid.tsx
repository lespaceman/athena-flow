import React from 'react';
import {Text} from 'ink';
import {type TimelineEntry} from '../feed/timeline.js';
import {type Theme} from '../theme/types.js';
import {type FeedColumnWidths} from './FeedRow.js';
import {FrameRow} from './FrameRow.js';
import {FeedRow} from './FeedRow.js';
import {FeedHeader} from './FeedHeader.js';
import {opCategory} from '../feed/timeline.js';

type Props = {
	feedHeaderRows: number;
	feedContentRows: number;
	feedViewportStart: number;
	filteredEntries: TimelineEntry[];
	visibleFeedEntries: TimelineEntry[];
	feedCursor: number;
	expandedId: string | null;
	focusMode: string;
	searchMatchSet: Set<number>;
	ascii: boolean;
	theme: Theme;
	innerWidth: number;
	cols: FeedColumnWidths;
};

export function FeedGrid({
	feedHeaderRows,
	feedContentRows,
	feedViewportStart,
	filteredEntries,
	visibleFeedEntries,
	feedCursor,
	expandedId,
	focusMode,
	searchMatchSet,
	ascii,
	theme,
	innerWidth,
	cols,
}: Props) {
	const rows: React.ReactNode[] = [];

	// Header row
	if (feedHeaderRows > 0) {
		rows.push(
			<FrameRow key="feed-header" innerWidth={innerWidth} ascii={ascii}>
				<FeedHeader cols={cols} theme={theme} />
			</FrameRow>,
		);
	}

	if (feedContentRows <= 0) return <>{rows}</>;

	if (visibleFeedEntries.length === 0) {
		rows.push(
			<FrameRow key="feed-empty" innerWidth={innerWidth} ascii={ascii}>
				<Text>{'(no feed events)'}</Text>
			</FrameRow>,
		);
		for (let i = 1; i < feedContentRows; i++) {
			rows.push(
				<FrameRow key={`feed-pad-${i}`} innerWidth={innerWidth} ascii={ascii}>
					<Text>{' '.repeat(innerWidth)}</Text>
				</FrameRow>,
			);
		}
		return <>{rows}</>;
	}

	let prevCat: string | undefined;
	let prevActorId: string | undefined;
	let prevMinute: number | undefined;
	let feedLinesEmitted = 0;
	let entryOffset = 0;

	while (feedLinesEmitted < feedContentRows) {
		const idx = feedViewportStart + entryOffset;
		const entry = filteredEntries[idx];
		if (!entry) {
			// Pad remaining rows
			while (feedLinesEmitted < feedContentRows) {
				rows.push(
					<FrameRow
						key={`feed-pad-${feedLinesEmitted}`}
						innerWidth={innerWidth}
						ascii={ascii}
					>
						<Text>{' '.repeat(innerWidth)}</Text>
					</FrameRow>,
				);
				feedLinesEmitted++;
			}
			break;
		}

		const cat = opCategory(entry.opTag);
		const isBreak = prevCat !== undefined && cat !== prevCat;
		prevCat = cat;

		const entryMinute = Math.floor(entry.ts / 60000);
		const isMinuteBreak =
			entryOffset > 0 &&
			prevMinute !== undefined &&
			entryMinute !== prevMinute &&
			!isBreak;
		prevMinute = entryMinute;

		// Minute separator — blank line gap
		if (isMinuteBreak && feedLinesEmitted < feedContentRows - 1) {
			rows.push(
				<FrameRow
					key={`feed-sep-${feedLinesEmitted}`}
					innerWidth={innerWidth}
					ascii={ascii}
				>
					<Text>{' '.repeat(innerWidth)}</Text>
				</FrameRow>,
			);
			feedLinesEmitted++;
		}

		const isDuplicateActor =
			entryOffset > 0 && !isBreak && prevActorId === entry.actorId;
		prevActorId = entry.actorId;

		const isFocused = focusMode === 'feed' && idx === feedCursor;
		const isExpanded = expandedId === entry.id;
		const isMatched = searchMatchSet.has(idx);

		rows.push(
			<FrameRow
				key={`feed-row-${entry.id}`}
				innerWidth={innerWidth}
				ascii={ascii}
			>
				<FeedRow
					entry={entry}
					cols={cols}
					focused={isFocused}
					expanded={isExpanded}
					matched={isMatched}
					isDuplicateActor={isDuplicateActor}
					ascii={ascii}
					theme={theme}
				/>
			</FrameRow>,
		);
		feedLinesEmitted++;
		entryOffset++;
	}

	return <>{rows}</>;
}
