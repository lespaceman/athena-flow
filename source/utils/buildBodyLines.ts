import {
	type TimelineEntry,
	type RunSummary,
	formatFeedLine,
	formatFeedHeaderLine,
} from '../feed/timeline.js';
import {type TodoPanelItem} from '../feed/todoPanel.js';
import {symbolForTodoStatus} from '../feed/todoPanel.js';
import {compactText, fit, formatRunLabel} from './format.js';

export type DetailViewState = {
	expandedEntry: TimelineEntry;
	detailScroll: number;
	maxDetailScroll: number;
	detailLines: string[];
	detailContentRows: number;
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
		openCount: number;
		doingCount: number;
		doneCount: number;
		blockedCount: number;
		todoShowDone: boolean;
		visibleTodoItems: TodoPanelItem[];
	};
	runLabel: string;
	focusMode: string;
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
			const lineNo = String(start + i + 1).padStart(lineNumberWidth, ' ');
			bodyLines.push(fit(`${lineNo} | ${line}`, innerWidth));
		}
	} else {
		const {
			actualTodoRows,
			todoPanel: tp,
			runLabel,
			focusMode: todoFocus,
		} = todo;
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
			const todoHeader = `[TODO] (${runLabel}) ${tp.openCount} open / ${tp.doingCount} doing / ${tp.doneCount} done${tp.blockedCount > 0 ? ` / ${tp.blockedCount} blocked` : ''}${tp.todoShowDone ? ' [all]' : ' [open]'}`;
			bodyLines.push(fit(todoHeader, innerWidth));

			for (let i = 0; i < actualTodoRows - 1; i++) {
				const todoItem = tp.visibleTodoItems[tp.todoScroll + i];
				if (!todoItem) {
					bodyLines.push(fit('', innerWidth));
					continue;
				}
				const focused =
					todoFocus === 'todo' && tp.todoCursor === tp.todoScroll + i;
				const link = todoItem.linkedEventId
					? ` <- ${todoItem.linkedEventId}`
					: '';
				const owner = todoItem.owner ? ` @${todoItem.owner}` : '';
				const line = `${focused ? '>' : ' '} ${symbolForTodoStatus(todoItem.status)} ${todoItem.priority} ${compactText(todoItem.text, 48)}${link}${owner}`;
				bodyLines.push(fit(line, innerWidth));
			}
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
