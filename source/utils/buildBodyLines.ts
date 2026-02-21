import {
	type TimelineEntry,
	type RunSummary,
	formatFeedLine,
	formatFeedHeaderLine,
} from '../feed/timeline.js';
import {type TodoPanelItem} from '../feed/todoPanel.js';
import {
	glyphForTodoStatus,
	todoCaret,
	todoDivider,
	todoScrollUp,
	todoScrollDown,
} from '../feed/todoPanel.js';
import {compactText, fit, fitAnsi, formatRunLabel} from './format.js';

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
};

export function buildBodyLines({
	innerWidth,
	bodyHeight,
	detail,
	feed,
	todo,
	runOverlay,
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
			fit(
				`[DETAILS] ${expandedEntry.id} (${expandedEntry.op} @${expandedEntry.actor}) ${rangeLabel} [Esc back]`,
				innerWidth,
			),
		);
		for (let i = 0; i < detailContentRows; i++) {
			const line = detailLines[start + i];
			if (line === undefined) {
				bodyLines.push(fit('', innerWidth));
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
			const ascii = todo.ascii;

			// Header line: "TODO" left-aligned, "N remaining" right-aligned
			const headerLeft = 'TODO';
			const headerRight = `${remainingCount} remaining`;
			const headerGap = Math.max(
				1,
				innerWidth - headerLeft.length - headerRight.length,
			);
			bodyLines.push(
				fit(`${headerLeft}${' '.repeat(headerGap)}${headerRight}`, innerWidth),
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
				bodyLines.push(fit(todoScrollUp(ascii), innerWidth));
			}

			for (let i = 0; i < renderSlots; i++) {
				const item = items[tScroll + i];
				if (!item) {
					bodyLines.push(fit('', innerWidth));
					continue;
				}
				const isFocused = todoFocus === 'todo' && tCursor === tScroll + i;
				const caret = isFocused ? todoCaret(ascii) : ' ';
				const glyph = glyphForTodoStatus(item.status, ascii);
				const prefix = `${caret} ${glyph}  `;
				const maxTitleWidth = Math.max(1, innerWidth - prefix.length);
				const title = fitAnsi(item.text, maxTitleWidth).trimEnd();
				bodyLines.push(fit(`${prefix}${title}`, innerWidth));
			}

			if (hasScrollDown) {
				const moreCount = totalItems - (tScroll + renderSlots);
				bodyLines.push(
					fit(`${todoScrollDown(ascii)}  +${moreCount} more`, innerWidth),
				);
			}

			// Divider line
			bodyLines.push(fit(todoDivider(innerWidth, ascii), innerWidth));
		}

		if (actualRunOverlayRows > 0) {
			bodyLines.push(fit('[RUNS] :run <id>  :run all', innerWidth));
			const listRows = actualRunOverlayRows - 1;
			const start = Math.max(0, runSummaries.length - listRows);
			for (let i = 0; i < actualRunOverlayRows - 1; i++) {
				const summary = runSummaries[start + i];
				if (!summary) {
					bodyLines.push(fit('', innerWidth));
					continue;
				}
				const active =
					runFilter !== 'all' && runFilter === summary.runId ? '*' : ' ';
				const line = `${active} ${formatRunLabel(summary.runId)} ${summary.status.padEnd(9, ' ')} ${compactText(summary.title, 48)}`;
				bodyLines.push(fit(line, innerWidth));
			}
		}

		if (feedHeaderRows > 0) {
			bodyLines.push(formatFeedHeaderLine(innerWidth));
		}

		if (feedContentRows > 0) {
			if (visibleFeedEntries.length === 0) {
				bodyLines.push(fit('(no feed events)', innerWidth));
				for (let i = 1; i < feedContentRows; i++) {
					bodyLines.push(fit('', innerWidth));
				}
			} else {
				for (let i = 0; i < feedContentRows; i++) {
					const idx = feedViewportStart + i;
					const entry = filteredEntries[idx];
					if (!entry) {
						bodyLines.push(fit('', innerWidth));
						continue;
					}
					bodyLines.push(
						formatFeedLine(
							entry,
							innerWidth,
							feedFocus === 'feed' && idx === feedCursor,
							expandedId === entry.id,
							searchMatchSet.has(idx),
						),
					);
				}
			}
		}
	}

	const clippedBodyLines = bodyLines.slice(0, bodyHeight);
	while (clippedBodyLines.length < bodyHeight) {
		clippedBodyLines.push(fit('', innerWidth));
	}
	return clippedBodyLines;
}
