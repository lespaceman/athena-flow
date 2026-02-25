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
import stripAnsi from 'strip-ansi';
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
		visibleTodoItems: TodoPanelItem[];
	};
	focusMode: string;
	ascii: boolean;
	colors?: TodoGlyphColors;
	appMode: 'idle' | 'working' | 'permission' | 'question';
	doneCount: number;
	totalCount: number;
	spinnerFrame: string;
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
				`[DETAILS] ${expandedEntry.id} (${expandedEntry.op} @${expandedEntry.actorId}) ${rangeLabel} [Esc back]`,
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
				visibleTodoItems: items,
			} = tp;
			const g = todoGlyphs(todo.ascii, todo.colors);

			const isWorking = todo.appMode === 'working';
			const idleGlyph = todo.ascii ? '*' : '\u25C7';
			const rawLeadGlyph = isWorking ? todo.spinnerFrame : idleGlyph;
			const leadGlyph = chalk.hex(theme.status.info)(rawLeadGlyph);
			const statusWord = isWorking ? 'WORKING' : 'IDLE';
			const statusColor = isWorking ? todo.colors?.doing : todo.colors?.default;
			const coloredStatus = statusColor
				? chalk.hex(statusColor)(statusWord)
				: statusWord;
			const stats =
				todo.totalCount > 0
					? `  ${chalk.hex(theme.text)(`${todo.doneCount}/${todo.totalCount}`)} ${chalk.hex(theme.textMuted)('tasks done')}`
					: '';
			bodyLines.push(
				fitAnsi(`${leadGlyph} ${coloredStatus}${stats}`, innerWidth),
			);

			const itemSlots = actualTodoRows - 2; // minus header and divider
			const totalItems = items.length;
			const hasScrollUp = tScroll > 0;

			// Two-pass affordance calculation: deduct scroll-up first,
			// then check scroll-down against the reduced slot count.
			let renderSlots = itemSlots;
			if (hasScrollUp) renderSlots--;
			const hasScrollDown = tScroll + renderSlots < totalItems;
			if (hasScrollDown) renderSlots--;

			if (hasScrollUp) {
				const aboveCount = tScroll;
				bodyLines.push(
					fitAnsi(`${g.scrollUp}  +${aboveCount} more`, innerWidth),
				);
			}

			for (let i = 0; i < renderSlots; i++) {
				const item = items[tScroll + i];
				if (!item) {
					bodyLines.push(fitAnsi('', innerWidth));
					continue;
				}
				const isFocused = todoFocus === 'todo' && tCursor === tScroll + i;
				const caret = isFocused ? g.caret : ' ';
				const row = g.styledRow(item);

				const glyphStr = row.glyph;
				const suffixStr = row.suffix;
				const elapsedStr = item.elapsed ? row.elapsed(item.elapsed) : '';

				// Layout: [caret] [glyph]  [text...] [suffix] [elapsed]
				const fixedWidth = 4; // caret + space + glyph + 2 spaces
				const suffixWidth = suffixStr ? stripAnsi(suffixStr).length + 1 : 0;
				const elapsedWidth = elapsedStr ? stripAnsi(elapsedStr).length + 1 : 0;
				const maxTitleWidth = Math.max(
					1,
					innerWidth - fixedWidth - suffixWidth - elapsedWidth,
				);
				const title = row.text(fitAnsi(item.text, maxTitleWidth).trimEnd());

				let line = `${caret} ${glyphStr}  ${title}`;
				if (suffixStr) line += ` ${suffixStr}`;
				if (elapsedStr) {
					const currentLen = stripAnsi(line).length;
					const pad = Math.max(
						1,
						innerWidth - currentLen - stripAnsi(elapsedStr).length,
					);
					line += ' '.repeat(pad) + elapsedStr;
				}
				bodyLines.push(fitAnsi(line, innerWidth));
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
				let prevActorId: string | undefined;
				let prevMinute: number | undefined;
				let feedLinesEmitted = 0;
				let entryOffset = 0;
				while (feedLinesEmitted < feedContentRows) {
					const idx = feedViewportStart + entryOffset;
					const entry = filteredEntries[idx];
					if (!entry) {
						bodyLines.push(fitAnsi('', innerWidth));
						feedLinesEmitted++;
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

					// X3: Visible minute separator — blank line gap
					if (isMinuteBreak && feedLinesEmitted < feedContentRows - 1) {
						bodyLines.push(fitAnsi('', innerWidth));
						feedLinesEmitted++;
					}

					const isDuplicateActor =
						entryOffset > 0 && !isBreak && prevActorId === entry.actorId;
					prevActorId = entry.actorId;
					const isFocused = feedFocus === 'feed' && idx === feedCursor;
					const isExpanded = expandedId === entry.id;
					const isMatched = searchMatchSet.has(idx);
					const {line: plain, summarySegments} = formatFeedLine(
						entry,
						innerWidth,
						isFocused,
						isExpanded,
						isMatched,
						todo.ascii,
						isDuplicateActor,
					);
					const styled = styleFeedLine(plain, {
						focused: isFocused,
						matched: isMatched,
						actorId: entry.actorId,
						isError: entry.error,
						theme,
						ascii: todo.ascii,
						opTag: entry.opTag,
						summarySegments,
						outcomeZero: entry.summaryOutcomeZero,
						categoryBreak: isBreak,
						duplicateActor: isDuplicateActor,
						minuteBreak: isMinuteBreak,
					});
					bodyLines.push(fitAnsi(styled, innerWidth));
					feedLinesEmitted++;
					entryOffset++;
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
