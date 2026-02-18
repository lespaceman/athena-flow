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

function formatTimelineRow(
	row: DashboardTimelineRow,
	innerWidth: number,
): string {
	let timeWidth = 8;
	let eventWidth = 8;
	let typeWidth = 16;
	let actorWidth = 12;

	if (innerWidth < 88) {
		timeWidth = 8;
		eventWidth = 6;
		typeWidth = 12;
		actorWidth = 9;
	}

	if (innerWidth < 66) {
		timeWidth = 6;
		eventWidth = 5;
		typeWidth = 10;
		actorWidth = 7;
	}

	const fixedWidth =
		timeWidth + 2 + eventWidth + 2 + typeWidth + 2 + actorWidth + 2;

	if (innerWidth <= fixedWidth + 8) {
		return fit(
			`${row.time} ${row.eventId} ${row.type} ${row.actor} ${row.summary}`,
			innerWidth,
		);
	}

	const summaryWidth = innerWidth - fixedWidth;
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
						{renderLine(formatTimelineRow(row, innerWidth), innerWidth)}
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
