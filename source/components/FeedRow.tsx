import React from 'react';
import {Box, Text} from 'ink';
import chalk from 'chalk';
import stripAnsi from 'strip-ansi';
import {type TimelineEntry} from '../feed/timeline.js';
import {type Theme} from '../theme/types.js';
import {
	formatGutter,
	formatTime,
	formatEvent,
	formatActor,
	formatTool,
	formatResult,
	formatDetails,
	formatSuffix,
} from '../feed/cellFormatters.js';

type FeedColumnWidths = {
	toolW: number;
	detailsW: number;
	resultW: number;
	gapW: number;
	timeEventGapW: number;
};

type Props = {
	entry: TimelineEntry;
	cols: FeedColumnWidths;
	focused: boolean;
	expanded: boolean;
	matched: boolean;
	isDuplicateActor: boolean;
	ascii: boolean;
	theme: Theme;
};

/** Strip ANSI and re-color when row is focused. */
function cell(content: string, overrideColor?: string): string {
	if (!overrideColor) return content;
	return chalk.hex(overrideColor)(stripAnsi(content));
}

export function FeedRow({
	entry,
	cols,
	focused,
	expanded,
	matched,
	isDuplicateActor,
	ascii,
	theme,
}: Props) {
	const isUserBorder = entry.opTag === 'prompt' || entry.opTag === 'msg.user';
	const overrideColor = focused ? theme.text : undefined;

	const gutter = formatGutter({
		focused,
		matched,
		isUserBorder,
		ascii,
		theme,
	});
	const time = formatTime(entry.ts, 5, theme);
	const event = formatEvent(entry.op, 12, theme, entry.opTag);
	const actor = formatActor(
		entry.actor,
		isDuplicateActor,
		10,
		theme,
		entry.actorId,
	);
	const tool = formatTool(entry.toolColumn ?? '', cols.toolW, theme);

	// Strip leading verb segments — the TOOL column handles the tool name
	const detailSegments = entry.summarySegments
		.filter(s => s.role !== 'verb')
		.map((s, i) => (i === 0 ? {...s, text: s.text.trimStart()} : s));
	const verbLen = entry.summarySegments
		.filter(s => s.role === 'verb')
		.reduce((n, s) => n + s.text.length, 0);
	const detailSummary = entry.summary.slice(verbLen).trimStart();

	const detail = formatDetails({
		segments: detailSegments,
		summary: detailSummary,
		mode: 'full',
		contentWidth: cols.detailsW,
		theme,
		opTag: entry.opTag,
		isError: entry.error,
	});
	const result = formatResult(
		entry.summaryOutcome,
		entry.summaryOutcomeZero,
		cols.resultW,
		theme,
	);
	const suffix = formatSuffix(entry.expandable, expanded, ascii, theme);

	return (
		<>
			<Box width={1} flexShrink={0}>
				<Text>{gutter}</Text>
			</Box>
			<Box width={5} flexShrink={0}>
				<Text>{cell(time, overrideColor)}</Text>
			</Box>
			<Box width={cols.timeEventGapW} flexShrink={0} />
			<Box width={12} flexShrink={0}>
				<Text>{cell(event, overrideColor)}</Text>
			</Box>
			<Box width={cols.gapW} flexShrink={0} />
			<Box width={10} flexShrink={0}>
				<Text>{cell(actor, overrideColor)}</Text>
			</Box>
			<Box width={cols.gapW} flexShrink={0} />
			<Box width={cols.toolW} flexShrink={0}>
				<Text>{cell(tool, overrideColor)}</Text>
			</Box>
			<Box width={cols.gapW} flexShrink={0} />
			<Box width={cols.detailsW} flexShrink={0}>
				<Text>{cell(detail, overrideColor)}</Text>
			</Box>
			{cols.resultW > 0 && (
				<>
					<Box width={cols.gapW} flexShrink={0} />
					<Box width={cols.resultW} flexShrink={0}>
						<Text>{cell(result, overrideColor)}</Text>
					</Box>
				</>
			)}
			<Box flexGrow={1} flexShrink={1} />
			<Box width={cols.gapW} flexShrink={0} />
			<Box width={2} flexShrink={0}>
				<Text>{cell(suffix, overrideColor)}</Text>
			</Box>
		</>
	);
}

export type {FeedColumnWidths};
