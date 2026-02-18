import React from 'react';
import {Box, Text} from 'ink';

export type DashboardTimelineRow = {
	time: string;
	eventId: string;
	type: string;
	actor: string;
	summary: string;
};

type Props = {
	width: number;
	headerLine1: string;
	headerLine2: string;
	todoHeader: string;
	todoLines: string[];
	timelineRows: DashboardTimelineRow[];
	footerLine: string;
	renderInput: (innerWidth: number) => React.ReactNode;
};

function toAscii(value: string): string {
	return value.replace(/[^\x20-\x7e]/g, '?');
}

function fit(text: string, width: number): string {
	const clean = toAscii(text);
	if (width <= 0) return '';
	if (clean.length === width) return clean;
	if (clean.length < width) return clean.padEnd(width, ' ');
	if (width <= 3) return clean.slice(0, width);
	return `${clean.slice(0, width - 3)}...`;
}

function renderLine(content: string, innerWidth: number): string {
	return `|${fit(content, innerWidth)}|`;
}

type TimelineColumns = {
	timeWidth: number;
	eventWidth: number;
	typeWidth: number;
	actorWidth: number;
	summaryWidth: number;
};

function maxLen(values: string[]): number {
	let max = 0;
	for (const value of values) {
		if (value.length > max) max = value.length;
	}
	return max;
}

function computeTimelineColumns(
	rows: DashboardTimelineRow[],
	innerWidth: number,
): TimelineColumns | null {
	const gapWidth = 8; // four "  " separators
	const timeWidth = innerWidth < 70 ? 6 : 8;
	const min = {event: 5, type: 9, actor: 7, summary: 8};
	const max = {event: 24, type: 24, actor: 18};

	const eventTarget = Math.max(
		min.event,
		Math.min(max.event, maxLen(rows.map(row => row.eventId))),
	);
	const typeTarget = Math.max(
		min.type,
		Math.min(max.type, maxLen(rows.map(row => row.type))),
	);
	const actorTarget = Math.max(
		min.actor,
		Math.min(max.actor, maxLen(rows.map(row => row.actor))),
	);

	let eventWidth = eventTarget;
	let typeWidth = typeTarget;
	let actorWidth = actorTarget;

	while (
		timeWidth + eventWidth + typeWidth + actorWidth + gapWidth + min.summary >
		innerWidth
	) {
		if (
			eventWidth >= typeWidth &&
			eventWidth >= actorWidth &&
			eventWidth > min.event
		) {
			eventWidth--;
			continue;
		}
		if (typeWidth >= actorWidth && typeWidth > min.type) {
			typeWidth--;
			continue;
		}
		if (actorWidth > min.actor) {
			actorWidth--;
			continue;
		}
		return null;
	}

	const summaryWidth =
		innerWidth - (timeWidth + eventWidth + typeWidth + actorWidth + gapWidth);
	if (summaryWidth < min.summary) return null;

	return {
		timeWidth,
		eventWidth,
		typeWidth,
		actorWidth,
		summaryWidth,
	};
}

function formatTimelineRow(
	row: DashboardTimelineRow,
	innerWidth: number,
	columns: TimelineColumns | null,
): string {
	if (!columns) {
		return fit(
			`${row.time} ${row.eventId} ${row.type} ${row.actor} ${row.summary}`,
			innerWidth,
		);
	}

	const {timeWidth, eventWidth, typeWidth, actorWidth, summaryWidth} = columns;
	return (
		fit(row.time, timeWidth) +
		'  ' +
		fit(row.eventId, eventWidth) +
		'  ' +
		fit(row.type, typeWidth) +
		'  ' +
		fit(row.actor, actorWidth) +
		'  ' +
		fit(row.summary, summaryWidth)
	);
}

export default function DashboardFrame({
	width,
	headerLine1,
	headerLine2,
	todoHeader,
	todoLines,
	timelineRows,
	footerLine,
	renderInput,
}: Props) {
	const frameWidth = Math.max(4, width);
	const innerWidth = frameWidth - 2;
	const border = `+${'-'.repeat(innerWidth)}+`;
	const separator = `|${'-'.repeat(innerWidth)}|`;
	const timelineColumns = computeTimelineColumns(timelineRows, innerWidth);

	return (
		<Box flexDirection="column" width={frameWidth}>
			<Text>{border}</Text>
			<Text>{renderLine(headerLine1, innerWidth)}</Text>
			<Text>{renderLine(headerLine2, innerWidth)}</Text>
			<Text>{separator}</Text>
			<Text>{renderLine(todoHeader, innerWidth)}</Text>
			{todoLines.map((line, index) => (
				<Text key={`todo-${index}`}>{renderLine(line, innerWidth)}</Text>
			))}
			<Text>{separator}</Text>
			{timelineRows.length === 0 ? (
				<Text>{renderLine('(no events yet)', innerWidth)}</Text>
			) : (
				timelineRows.map(row => (
					<Text key={row.eventId}>
						{renderLine(
							formatTimelineRow(row, innerWidth, timelineColumns),
							innerWidth,
						)}
					</Text>
				))
			)}
			<Text>{separator}</Text>
			<Text>{renderLine(footerLine, innerWidth)}</Text>
			<Box>
				<Text>|</Text>
				{renderInput(innerWidth)}
				<Text>|</Text>
			</Box>
			<Text>{border}</Text>
		</Box>
	);
}
