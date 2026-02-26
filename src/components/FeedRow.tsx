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
import {fitAnsi} from '../utils/format.js';

type FeedColumnWidths = {
	toolW: number;
	detailsW: number;
	resultW: number;
	gapW: number;
	detailsResultGapW: number;
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

type FeedRowLineProps = Props & {
	innerWidth: number;
};

/** Strip ANSI and re-color when row is focused. */
function cell(content: string, overrideColor?: string): string {
	if (!overrideColor) return content;
	return chalk.hex(overrideColor)(stripAnsi(content));
}

function lineParts({
	entry,
	cols,
	focused,
	expanded,
	matched,
	isDuplicateActor,
	ascii,
	theme,
}: Props): {
	gutter: string;
	time: string;
	event: string;
	actor: string;
	tool: string;
	detail: string;
	result: string;
	suffix: string;
} {
	const isUserBorder = entry.opTag === 'prompt' || entry.opTag === 'msg.user';
	const overrideColor = focused ? theme.text : undefined;

	const gutter = formatGutter({
		focused,
		matched,
		isUserBorder,
		ascii,
		theme,
	});
	const time = cell(formatTime(entry.ts, 5, theme), overrideColor);
	const event = cell(
		formatEvent(entry.op, 12, theme, entry.opTag),
		overrideColor,
	);
	const actor = cell(
		formatActor(entry.actor, isDuplicateActor, 10, theme, entry.actorId),
		overrideColor,
	);
	const tool = cell(
		formatTool(entry.toolColumn ?? '', cols.toolW, theme),
		overrideColor,
	);

	// Strip leading verb segments — the TOOL column handles the tool name
	const detailSegments = entry.summarySegments
		.filter(s => s.role !== 'verb')
		.map((s, i) => (i === 0 ? {...s, text: s.text.trimStart()} : s));
	const verbLen = entry.summarySegments
		.filter(s => s.role === 'verb')
		.reduce((n, s) => n + s.text.length, 0);
	const detailSummary = entry.summary.slice(verbLen).trimStart();

	const detail = cell(
		formatDetails({
			segments: detailSegments,
			summary: detailSummary,
			mode: 'full',
			contentWidth: cols.detailsW,
			theme,
			opTag: entry.opTag,
			isError: entry.error,
		}),
		overrideColor,
	);
	const result = cell(
		formatResult(
			entry.summaryOutcome,
			entry.summaryOutcomeZero,
			cols.resultW,
			theme,
		),
		overrideColor,
	);
	const suffix = cell(
		fitAnsi(formatSuffix(entry.expandable, expanded, ascii, theme), 3),
		overrideColor,
	);

	return {
		gutter,
		time,
		event,
		actor,
		tool,
		detail,
		result,
		suffix,
	};
}

export function formatFeedRowLine({
	innerWidth,
	...props
}: FeedRowLineProps): string {
	const parts = lineParts(props);
	const {
		cols: {gapW, timeEventGapW, detailsResultGapW, resultW},
	} = props;

	let line =
		parts.gutter +
		parts.time +
		' '.repeat(timeEventGapW) +
		parts.event +
		' '.repeat(gapW) +
		parts.actor +
		' '.repeat(gapW) +
		parts.tool +
		' '.repeat(gapW) +
		parts.detail;

	if (resultW > 0) {
		line += ' '.repeat(detailsResultGapW) + parts.result;
	}

	line += ' '.repeat(gapW) + parts.suffix;
	return fitAnsi(line, innerWidth);
}

function FeedRowImpl({
	entry,
	cols,
	focused,
	expanded,
	matched,
	isDuplicateActor,
	ascii,
	theme,
}: Props) {
	const parts = lineParts({
		entry,
		cols,
		focused,
		expanded,
		matched,
		isDuplicateActor,
		ascii,
		theme,
	});

	return (
		<>
			<Box width={1} flexShrink={0}>
				<Text wrap="truncate-end">{parts.gutter}</Text>
			</Box>
			<Box width={5} flexShrink={0}>
				<Text wrap="truncate-end">{parts.time}</Text>
			</Box>
			<Box width={cols.timeEventGapW} flexShrink={0} />
			<Box width={12} flexShrink={0}>
				<Text wrap="truncate-end">{parts.event}</Text>
			</Box>
			<Box width={cols.gapW} flexShrink={0} />
			<Box width={10} flexShrink={0}>
				<Text wrap="truncate-end">{parts.actor}</Text>
			</Box>
			<Box width={cols.gapW} flexShrink={0} />
			<Box width={cols.toolW} flexShrink={0}>
				<Text wrap="truncate-end">{parts.tool}</Text>
			</Box>
			<Box width={cols.gapW} flexShrink={0} />
			<Box width={cols.detailsW} flexShrink={0}>
				<Text wrap="truncate-end">{parts.detail}</Text>
			</Box>
			{cols.resultW > 0 && (
				<>
					<Box width={cols.detailsResultGapW} flexShrink={0} />
					<Box width={cols.resultW} flexShrink={0}>
						<Text wrap="truncate-end">{parts.result}</Text>
					</Box>
				</>
			)}
			<Box flexGrow={1} flexShrink={1} />
			<Box width={cols.gapW} flexShrink={0} />
			<Box width={3} flexShrink={0}>
				<Text wrap="truncate-end">{parts.suffix}</Text>
			</Box>
		</>
	);
}

export const FeedRow = React.memo(FeedRowImpl);

export type {FeedColumnWidths};
