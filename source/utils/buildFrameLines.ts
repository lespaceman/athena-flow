import {type TimelineEntry, type RunSummary} from '../feed/timeline.js';
import {
	fit,
	compactText,
	formatCount,
	formatSessionLabel,
	formatRunLabel,
	formatInputBuffer,
} from './format.js';

export type FrameContext = {
	innerWidth: number;
	session: {session_id?: string; agent_type?: string} | null;
	currentRun: {run_id: string; trigger: {prompt_preview?: string}} | null;
	runFilter: string;
	runSummaries: RunSummary[];
	runTitle: string;
	metrics: {
		totalToolCallCount: number;
		subagentCount: number;
		failures: number;
		blocks: number;
	};
	tokenUsage: {total: number | null};
	todoPanel: {
		doneCount: number;
		doingCount: number;
		todoItems: {length: number};
	};
	tailFollow: boolean;
	focusMode: string;
	inputMode: string;
	searchQuery: string;
	searchMatches: number[];
	searchMatchPos: number;
	expandedEntry: TimelineEntry | null;
	isClaudeRunning: boolean;
	inputValue: string;
	cursorOffset: number;
	dialogActive: boolean;
	dialogType: string;
};

export type FrameLines = {
	headerLine1: string;
	headerLine2: string;
	footerHelp: string;
	inputLine: string;
};

export function buildFrameLines(ctx: FrameContext): FrameLines {
	const {innerWidth} = ctx;

	const sessionLabel = formatSessionLabel(ctx.session?.session_id);
	const selectedRunId =
		ctx.runFilter === 'all'
			? (ctx.currentRun?.run_id ??
				ctx.runSummaries[ctx.runSummaries.length - 1]?.runId)
			: ctx.runFilter;
	const runLabel = formatRunLabel(selectedRunId);
	const mainActor = compactText(ctx.session?.agent_type ?? 'Agent', 16);

	const stepCurrent =
		ctx.todoPanel.doneCount + (ctx.todoPanel.doingCount > 0 ? 1 : 0);
	const stepTotal = Math.max(ctx.todoPanel.todoItems.length, stepCurrent);

	const latestRunStatus = (() => {
		if (ctx.currentRun) return 'RUNNING';
		const tail = ctx.runSummaries[ctx.runSummaries.length - 1];
		return tail?.status ?? 'SUCCEEDED';
	})();

	const headerLine1 = fit(
		`ATHENA | session ${sessionLabel} | run ${runLabel}: ${ctx.runTitle} | main: ${mainActor}`,
		innerWidth,
	);
	const headerLine2 = fit(
		`${latestRunStatus.padEnd(9, ' ')} | step ${String(stepCurrent).padStart(2, ' ')}/${String(stepTotal).padEnd(2, ' ')} | tools ${String(ctx.metrics.totalToolCallCount).padStart(4, ' ')} | sub ${String(ctx.metrics.subagentCount).padStart(3, ' ')} | err ${String(ctx.metrics.failures).padStart(3, ' ')} | blk ${String(ctx.metrics.blocks).padStart(3, ' ')} | tok ${formatCount(ctx.tokenUsage.total).padStart(8, ' ')}${ctx.tailFollow ? ' | TAIL' : ''}`,
		innerWidth,
	);

	// Footer
	const footerHelp = (() => {
		if (ctx.focusMode === 'todo')
			return 'TODO: up/down select  Space toggle done  Enter jump  a add  Esc back';
		if (ctx.focusMode === 'input')
			return 'INPUT: Enter send  Esc back  Tab focus  Ctrl+P/N history';
		if (ctx.expandedEntry)
			return 'DETAILS: Up/Down or j/k scroll  PgUp/PgDn jump  Enter/Esc back';
		const searchPart =
			ctx.searchQuery && ctx.searchMatches.length > 0
				? ` | search ${ctx.searchMatchPos + 1}/${ctx.searchMatches.length}`
				: ctx.searchQuery
					? ' | search 0/0'
					: '';
		return `FEED: Ctrl+Up/Down move  Enter expand  / search  : cmd  End tail${searchPart}`;
	})();

	// Input line
	const runBadge = ctx.isClaudeRunning ? '[RUN]' : '[IDLE]';
	const modeBadges = [
		runBadge,
		...(ctx.inputMode === 'cmd' ? ['[CMD]'] : []),
		...(ctx.inputMode === 'search' ? ['[SEARCH]'] : []),
	];
	const badgeText = modeBadges.join('');
	const inputPrefix = 'input> ';
	const inputContentWidth = Math.max(
		1,
		innerWidth - inputPrefix.length - badgeText.length,
	);
	const inputPlaceholder =
		ctx.inputMode === 'cmd'
			? ':command'
			: ctx.inputMode === 'search'
				? '/search'
				: 'Type a prompt or :command';
	const inputBuffer = ctx.dialogActive
		? fit(
				ctx.dialogType === 'question'
					? 'Answer question in dialog...'
					: 'Respond to permission dialog...',
				inputContentWidth,
			)
		: formatInputBuffer(
				ctx.inputValue,
				ctx.cursorOffset,
				inputContentWidth,
				ctx.focusMode === 'input',
				inputPlaceholder,
			);
	const inputLine = fit(`${inputPrefix}${inputBuffer}${badgeText}`, innerWidth);

	return {headerLine1, headerLine2, footerHelp, inputLine};
}
