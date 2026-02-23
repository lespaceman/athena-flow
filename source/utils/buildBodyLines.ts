import {
	type TimelineEntry,
	type RunSummary,
	formatFeedLine,
	formatFeedHeaderLine,
} from '../feed/timeline.js';
import {
	type TodoPanelItem,
	type TodoGlyphColors,
	todoGlyphs,
} from '../feed/todoPanel.js';
import chalk from 'chalk';
import {compactText, fitAnsi, formatRunLabel} from './format.js';
import {styleFeedLine} from '../feed/feedLineStyle.js';
import {type Theme} from '../theme/types.js';

export type DetailViewState = {
	expandedEntry: TimelineEntry;
	detailScroll: number;
	maxDetailScroll: number;
	detailLines: string[];
	detailContentRows: number;
	showLineNumbers?: boolean;
};

export type FeedViewState = {
	feedHeaderRows: number;
	feedContentRows: number;
	feedViewportStart: number;
	visibleFeedEntries: TimelineEntry[];
	filteredEntries: TimelineEntry[];
	feedCursor: number;
	expandedId: string | null;
	focusMode: string;
	searchMatchSet: Set<number>;
};

export type TodoViewState = {
	actualTodoRows: number;
	todoPanel: {
		todoScroll: number;
		todoCursor: number;
		remainingCount: number;
		visibleTodoItems: TodoPanelItem[];
	};
	focusMode: string;
	ascii: boolean;
	colors?: TodoGlyphColors;
};

export type RunOverlayState = {
	actualRunOverlayRows: number;
	runSummaries: RunSummary[];
	runFilter: string;
};

export type BuildBodyLinesOptions = {
	innerWidth: number;
	bodyHeight: number;
	detail: DetailViewState | null;
	feed: FeedViewState;
	todo: TodoViewState;
	runOverlay: RunOverlayState;
	theme: Theme;
};

/** Extract coarse event category from op string for visual grouping. */
export function opCategory(op: string): string {
	const dot = op.indexOf('.');
	return dot >= 0 ? op.slice(0, dot) : op;
}

export function buildBodyLines({
	innerWidth,
	bodyHeight,
	detail,
	feed,
	todo,
	runOverlay,
	theme,
}: BuildBodyLinesOptions): string[] {
	const bodyLines: string[] = [];

	if (detail) {
		const {
			expandedEntry,
			detailScroll,
			maxDetailScroll,
			detailLines,
			detailContentRows,
		} = detail;
		const start = Math.min(detailScroll, maxDetailScroll);
		const end = Math.min(detailLines.length, start + detailContentRows);
		const lineNumberWidth = String(Math.max(1, detailLines.length)).length;
		const rangeLabel =
			detailLines.length === 0
				? '0/0'
				: `${start + 1}-${end}/${detailLines.length}`;
		bodyLines.push(
			fitAnsi(
				`[DETAILS] ${expandedEntry.id} (${expandedEntry.op} @${expandedEntry.actor}) ${rangeLabel} [Esc back]`,
				innerWidth,
			),
		);
		for (let i = 0; i < detailContentRows; i++) {
			const line = detailLines[start + i];
			if (line === undefined) {
				bodyLines.push(fitAnsi('', innerWidth));
				continue;
			}
			if (detail.showLineNumbers !== false) {
				const lineNo = String(start + i + 1).padStart(lineNumberWidth, ' ');
				bodyLines.push(fitAnsi(`${lineNo} | ${line}`, innerWidth));
			} else {
				bodyLines.push(fitAnsi(line, innerWidth));
			}
		}
	} else {
		const {actualTodoRows, todoPanel: tp, focusMode: todoFocus} = todo;
		const {actualRunOverlayRows, runSummaries, runFilter} = runOverlay;
		const {
			feedHeaderRows,
			feedContentRows,
			feedViewportStart,
			visibleFeedEntries,
			filteredEntries,
			feedCursor,
			expandedId,
			focusMode: feedFocus,
			searchMatchSet,
		} = feed;

		if (actualTodoRows > 0) {
			const {
				todoScroll: tScroll,
				todoCursor: tCursor,
				remainingCount,
				visibleTodoItems: items,
			} = tp;
			const g = todoGlyphs(todo.ascii, todo.colors);

			// Header line: "TODO" left-aligned, "N remaining" right-aligned
			const headerLeft = 'TODO';
			const headerRight = `${remainingCount} remaining`;
			const headerGap = Math.max(
				1,
				innerWidth - headerLeft.length - headerRight.length,
			);
			bodyLines.push(
				fitAnsi(
					`${headerLeft}${' '.repeat(headerGap)}${headerRight}`,
					innerWidth,
				),
			);

			const itemSlots = actualTodoRows - 2; // minus header and divider
			const totalItems = items.length;
			const hasScrollUp = tScroll > 0;
			const hasScrollDown = tScroll + itemSlots < totalItems;

			// Scroll affordances consume item slots when present
			let renderSlots = itemSlots;
			if (hasScrollUp) renderSlots--;
			if (hasScrollDown) renderSlots--;

			if (hasScrollUp) {
				bodyLines.push(fitAnsi(g.scrollUp, innerWidth));
			}

			for (let i = 0; i < renderSlots; i++) {
				const item = items[tScroll + i];
				if (!item) {
					bodyLines.push(fitAnsi('', innerWidth));
					continue;
				}
				const isFocused = todoFocus === 'todo' && tCursor === tScroll + i;
				const caret = isFocused ? g.caret : ' ';
				const prefix = `${caret} ${g.statusGlyph(item.status)}  `;
				const maxTitleWidth = Math.max(1, innerWidth - prefix.length);
				const title = fitAnsi(item.text, maxTitleWidth).trimEnd();
				bodyLines.push(fitAnsi(`${prefix}${title}`, innerWidth));
			}

			if (hasScrollDown) {
				const moreCount = totalItems - (tScroll + renderSlots);
				bodyLines.push(
					fitAnsi(`${g.scrollDown}  +${moreCount} more`, innerWidth),
				);
			}

			// Divider line
			bodyLines.push(fitAnsi(g.dividerChar.repeat(innerWidth), innerWidth));
		}

		if (actualRunOverlayRows > 0) {
			bodyLines.push(fitAnsi('[RUNS] :run <id>  :run all', innerWidth));
			const listRows = actualRunOverlayRows - 1;
			const start = Math.max(0, runSummaries.length - listRows);
			for (let i = 0; i < actualRunOverlayRows - 1; i++) {
				const summary = runSummaries[start + i];
				if (!summary) {
					bodyLines.push(fitAnsi('', innerWidth));
					continue;
				}
				const active =
					runFilter !== 'all' && runFilter === summary.runId ? '*' : ' ';
				const line = `${active} ${formatRunLabel(summary.runId)} ${summary.status.padEnd(9, ' ')} ${compactText(summary.title, 48)}`;
				bodyLines.push(fitAnsi(line, innerWidth));
			}
		}

		if (feedHeaderRows > 0) {
			bodyLines.push(
				fitAnsi(
					chalk.bold.hex(theme.textMuted)(formatFeedHeaderLine(innerWidth)),
					innerWidth,
				),
			);
		}

		if (feedContentRows > 0) {
			if (visibleFeedEntries.length === 0) {
				bodyLines.push(fitAnsi('(no feed events)', innerWidth));
				for (let i = 1; i < feedContentRows; i++) {
					bodyLines.push(fitAnsi('', innerWidth));
				}
			} else {
				let prevCat: string | undefined;
				for (let i = 0; i < feedContentRows; i++) {
					const idx = feedViewportStart + i;
					const entry = filteredEntries[idx];
					if (!entry) {
						bodyLines.push(fitAnsi('', innerWidth));
						continue;
					}
					const cat = opCategory(entry.op);
					const isBreak = prevCat !== undefined && cat !== prevCat;
					prevCat = cat;
					const isFocused = feedFocus === 'feed' && idx === feedCursor;
					const isExpanded = expandedId === entry.id;
					const isMatched = searchMatchSet.has(idx);
					const plain = formatFeedLine(
						entry,
						innerWidth,
						isFocused,
						isExpanded,
						isMatched,
						todo.ascii,
					);
					const styled = styleFeedLine(plain, {
						focused: isFocused,
						matched: isMatched,
						actorId: entry.actorId,
						isError: entry.error,
						theme,
						ascii: todo.ascii,
						op: entry.op,
						summaryDimStart: entry.summaryDimStart,
						categoryBreak: isBreak,
					});
					bodyLines.push(fitAnsi(styled, innerWidth));
				}
			}
		}
	}

	const clippedBodyLines = bodyLines.slice(0, bodyHeight);
	while (clippedBodyLines.length < bodyHeight) {
		clippedBodyLines.push(fitAnsi('', innerWidth));
	}
	return clippedBodyLines;
}
