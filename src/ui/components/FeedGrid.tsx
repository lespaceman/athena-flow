import React from 'react';
import {Text} from 'ink';
import chalk from 'chalk';
import {type TimelineEntry} from '../../core/feed/timeline';
import {type Theme} from '../theme/types';
import {frameGlyphs} from '../glyphs/index';
import {fitAnsi, spaces} from '../../shared/utils/format';
import {type FeedColumnWidths, formatFeedRowLine} from './FeedRow';
import {formatFeedHeaderLine} from './FeedHeader';

type Props = {
	feedHeaderRows: number;
	feedContentRows: number;
	feedViewportStart: number;
	filteredEntries: TimelineEntry[];
	feedCursor: number;
	focusMode: string;
	searchMatchSet: Set<number>;
	ascii: boolean;
	theme: Theme;
	innerWidth: number;
	cols: FeedColumnWidths;
};

function FeedGridImpl({
	feedHeaderRows,
	feedContentRows,
	feedViewportStart,
	filteredEntries,
	feedCursor,
	focusMode,
	searchMatchSet,
	ascii,
	theme,
	innerWidth,
	cols,
}: Props) {
	const rows: React.ReactNode[] = [];
	const fr = frameGlyphs(ascii);
	const blankLine = spaces(innerWidth);
	const border = chalk.hex(theme.border);
	const frameLine = (content: string): string =>
		`${border(fr.vertical)}${content}${border(fr.vertical)}`;
	const stripeBg = theme.feed.stripeBackground;
	const dividerLine = chalk.hex(theme.border)(fr.horizontal.repeat(innerWidth));
	const showHeaderDivider = feedHeaderRows > 0 && feedContentRows > 1;
	const visibleContentRows = feedContentRows - (showHeaderDivider ? 1 : 0);

	// Header row
	if (feedHeaderRows > 0) {
		rows.push(
			<Text key="feed-header">
				{frameLine(formatFeedHeaderLine(cols, theme, innerWidth))}
			</Text>,
		);
		if (showHeaderDivider) {
			rows.push(
				<Text key="feed-header-divider">{frameLine(dividerLine)}</Text>,
			);
		}
	}

	if (visibleContentRows <= 0) return <>{rows}</>;

	if (filteredEntries.length === 0) {
		rows.push(
			<Text key="feed-empty">
				{frameLine(fitAnsi('(no feed events)', innerWidth))}
			</Text>,
		);
		for (let i = 1; i < visibleContentRows; i++) {
			rows.push(<Text key={`feed-pad-${i}`}>{frameLine(blankLine)}</Text>);
		}
		return <>{rows}</>;
	}

	let feedLinesEmitted = 0;
	let entryOffset = 0;

	while (feedLinesEmitted < visibleContentRows) {
		const idx = feedViewportStart + entryOffset;
		if (idx >= filteredEntries.length) {
			// Pad remaining rows
			while (feedLinesEmitted < visibleContentRows) {
				rows.push(
					<Text key={`feed-pad-${feedLinesEmitted}`}>
						{frameLine(blankLine)}
					</Text>,
				);
				feedLinesEmitted++;
			}
			break;
		}
		const entry = filteredEntries[idx]!;

		const isDuplicateActor = entry.duplicateActor;

		const isFocused = focusMode === 'feed' && idx === feedCursor;
		const isMatched = searchMatchSet.has(idx);
		const isStriped = idx % 2 === 1;
		const rowBg =
			!isFocused && isStriped && stripeBg
				? chalk.bgHex(stripeBg)
				: (text: string) => text;

		rows.push(
			<Text key={`feed-row-${entry.id}`}>
				{frameLine(
					rowBg(
						formatFeedRowLine({
							entry,
							cols,
							focused: isFocused,
							expanded: false,
							matched: isMatched,
							isDuplicateActor,
							ascii,
							theme,
							innerWidth,
						}),
					),
				)}
			</Text>,
		);
		feedLinesEmitted++;
		entryOffset++;
	}

	return <>{rows}</>;
}

export const FeedGrid = React.memo(FeedGridImpl);
