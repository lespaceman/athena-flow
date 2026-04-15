import {useMemo} from 'react';
import {type TimelineEntry} from '../../core/feed/timeline';
import {
	type MessageTab,
	classifyEntry,
	partitionEntries,
	filterByTab,
	messageText,
} from '../../core/feed/panelFilter';
import {renderMarkdown} from '../../shared/markdown/renderMarkdown';
import {wrapText} from '../../shared/utils/format';
import {INDICATOR_OVERHEAD} from '../components/MessagePanel';

const lineCountCache = new WeakMap<TimelineEntry, Map<number, number>>();

function cachedLineCount(entry: TimelineEntry, contentWidth: number): number {
	let widthMap = lineCountCache.get(entry);
	if (widthMap) {
		const cached = widthMap.get(contentWidth);
		if (cached !== undefined) return cached;
	}
	const text = messageText(entry);
	const kind = classifyEntry(entry) === 'user' ? 'user' : 'agent';
	const lines =
		kind === 'user'
			? wrapText(text, contentWidth)
			: renderMarkdown({
					content: text,
					width: contentWidth,
					mode: 'inline-feed',
				}).lines;
	const count = lines.length;
	if (!widthMap) {
		widthMap = new Map();
		lineCountCache.set(entry, widthMap);
	}
	widthMap.set(contentWidth, count);
	return count;
}

export type FilteredPanels = {
	messageEntries: TimelineEntry[];
	feedEntries: TimelineEntry[];
	/** Total wrapped line count for message entries at the given width. */
	messageLineCount: number;
	/** First wrapped line index of each message entry. */
	messageEntryLineOffsets: number[];
};

export function useFilteredPanels(
	filteredEntries: TimelineEntry[],
	messagePanelTab: MessageTab,
	splitMode: boolean,
	messagePanelWidth: number,
): FilteredPanels {
	return useMemo(() => {
		if (!splitMode) {
			return {
				messageEntries: [],
				feedEntries: filteredEntries,
				messageLineCount: 0,
				messageEntryLineOffsets: [],
			};
		}
		const {messageEntries, feedEntries} = partitionEntries(filteredEntries);
		const tabFiltered = filterByTab(messageEntries, messagePanelTab);
		// Count rendered lines (including separator blank lines between messages).
		// Must match buildRenderedLines in MessagePanel: use the content width
		// (after indicator overhead) and the same renderer per entry kind.
		const contentWidth = messagePanelWidth - INDICATOR_OVERHEAD;
		const offsets: number[] = [];
		let lineCount = 0;
		for (let i = 0; i < tabFiltered.length; i++) {
			offsets.push(lineCount);
			lineCount += cachedLineCount(tabFiltered[i]!, contentWidth);
			if (i < tabFiltered.length - 1) {
				lineCount += 1; // separator
			}
		}
		return {
			messageEntries: tabFiltered,
			feedEntries,
			messageLineCount: lineCount,
			messageEntryLineOffsets: offsets,
		};
	}, [filteredEntries, messagePanelTab, splitMode, messagePanelWidth]);
}
