import {useEffect, useMemo} from 'react';
import {type TimelineEntry, type RunSummary} from '../../feed/timeline';
import {type UseFeedNavigationResult} from './useFeedNavigation';
import {type UseTodoPanelResult} from './useTodoPanel';
import {
	renderDetailLines,
	renderMarkdownToLines,
} from '../../utils/renderDetailLines';

const HEADER_ROWS = 1;
const FRAME_BORDER_ROWS = 4;
const TODO_PANEL_MAX_ROWS = 8;
const RUN_OVERLAY_MAX_ROWS = 6;

export type UseLayoutOptions = {
	terminalRows: number;
	terminalWidth: number;
	showRunOverlay: boolean;
	runSummaries: RunSummary[];
	filteredEntries: TimelineEntry[];
	feedNav: UseFeedNavigationResult;
	todoPanel: UseTodoPanelResult;
	footerRows: number;
};

export type UseLayoutResult = {
	frameWidth: number;
	innerWidth: number;
	bodyHeight: number;
	feedHeaderRows: number;
	feedContentRows: number;
	actualTodoRows: number;
	actualRunOverlayRows: number;
	pageStep: number;
	detailPageStep: number;
	maxDetailScroll: number;
	detailLines: string[];
	detailShowLineNumbers: boolean;
	detailContentRows: number;
	expandedEntry: TimelineEntry | null;
	todoListHeight: number;
	baseFeedContentRows: number;
};

export function useLayout({
	terminalRows,
	terminalWidth,
	showRunOverlay,
	runSummaries,
	filteredEntries,
	feedNav,
	todoPanel,
	footerRows,
}: UseLayoutOptions): UseLayoutResult {
	const frameWidth = Math.max(4, terminalWidth);
	const innerWidth = frameWidth - 2;

	const bodyHeight = Math.max(
		1,
		terminalRows - HEADER_ROWS - footerRows - FRAME_BORDER_ROWS,
	);

	const todoRowsTarget = todoPanel.todoVisible
		? Math.min(TODO_PANEL_MAX_ROWS, 2 + todoPanel.visibleTodoItems.length)
		: 0;
	const runOverlayRowsTarget = showRunOverlay
		? Math.min(RUN_OVERLAY_MAX_ROWS, 1 + Math.max(1, runSummaries.length))
		: 0;

	let remainingRows = bodyHeight;
	const todoRows = Math.min(todoRowsTarget, Math.max(0, remainingRows - 1));
	remainingRows -= todoRows;
	const runOverlayRows = Math.min(
		runOverlayRowsTarget,
		Math.max(0, remainingRows - 1),
	);
	remainingRows -= runOverlayRows;
	const baseFeedRows = Math.max(1, remainingRows);
	const baseFeedHeaderRows = baseFeedRows > 1 ? 1 : 0;
	const baseFeedContentRows = Math.max(0, baseFeedRows - baseFeedHeaderRows);

	const expandedEntry = feedNav.expandedId
		? (filteredEntries.find(entry => entry.id === feedNav.expandedId) ?? null)
		: null;

	const feedRows = expandedEntry ? 0 : baseFeedRows;
	const feedHeaderRows = feedRows > 1 ? 1 : 0;
	const feedContentRows = expandedEntry ? 0 : baseFeedContentRows;
	const actualTodoRows = expandedEntry ? 0 : todoRows;
	const actualRunOverlayRows = expandedEntry ? 0 : runOverlayRows;
	const pageStep = Math.max(1, Math.floor(Math.max(1, feedContentRows) / 2));

	const {detailLines, detailShowLineNumbers} = useMemo(() => {
		if (!expandedEntry)
			return {detailLines: [] as string[], detailShowLineNumbers: true};
		if (expandedEntry.feedEvent) {
			const result = renderDetailLines(
				expandedEntry.feedEvent,
				innerWidth,
				expandedEntry.pairedPostEvent,
			);
			return {
				detailLines: result.lines,
				detailShowLineNumbers: result.showLineNumbers,
			};
		}
		// Message entries (no feedEvent) — render as markdown
		const markdownLines = renderMarkdownToLines(
			expandedEntry.details,
			innerWidth,
		);
		return {detailLines: markdownLines, detailShowLineNumbers: false};
	}, [expandedEntry, innerWidth]);
	const detailHeaderRows = expandedEntry ? 1 : 0;
	const detailContentRows = expandedEntry
		? Math.max(1, bodyHeight - detailHeaderRows)
		: 0;
	const detailVisibleRows =
		expandedEntry && detailContentRows > 1
			? detailContentRows - 1
			: detailContentRows;
	const maxDetailScroll = Math.max(0, detailLines.length - detailVisibleRows);
	const detailPageStep = Math.max(1, Math.floor(detailVisibleRows / 2));
	const setDetailScroll = feedNav.setDetailScroll;
	const setTodoScroll = todoPanel.setTodoScroll;
	const todoCursor = todoPanel.todoCursor;
	const visibleTodoItemsLength = todoPanel.visibleTodoItems.length;

	// Clamp detail scroll
	useEffect(() => {
		setDetailScroll(prev => Math.min(prev, maxDetailScroll));
	}, [maxDetailScroll, setDetailScroll]);

	// Todo scroll adjustment
	// Subtract worst-case affordance lines (2) when items exceed raw slots,
	// so maxScroll allows reaching the last item.
	const itemSlots = Math.max(0, actualTodoRows - 2); // header + divider
	const todoListHeight =
		todoPanel.visibleTodoItems.length > itemSlots
			? Math.max(0, itemSlots - 2)
			: itemSlots;
	useEffect(() => {
		if (todoListHeight <= 0) {
			setTodoScroll(0);
			return;
		}
		setTodoScroll(prev => {
			if (todoCursor < prev) return todoCursor;
			if (todoCursor >= prev + todoListHeight) {
				return todoCursor - todoListHeight + 1;
			}
			const maxScroll = Math.max(0, visibleTodoItemsLength - todoListHeight);
			return Math.min(prev, maxScroll);
		});
	}, [todoCursor, todoListHeight, visibleTodoItemsLength, setTodoScroll]);

	return {
		frameWidth,
		innerWidth,
		bodyHeight,
		feedHeaderRows,
		feedContentRows,
		actualTodoRows,
		actualRunOverlayRows,
		pageStep,
		detailPageStep,
		maxDetailScroll,
		detailLines,
		detailShowLineNumbers,
		detailContentRows,
		expandedEntry,
		todoListHeight,
		baseFeedContentRows,
	};
}
