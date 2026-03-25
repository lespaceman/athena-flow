import type {TimelineEntry} from '../../core/feed/timeline';
import {
	renderDetailLines,
	renderMarkdownToLines,
} from '../layout/renderDetailLines';
import stripAnsi from 'strip-ansi';
import type {Theme} from '../theme/types';

/**
 * Extract copyable rich detail content from a timeline entry.
 * Uses the same renderers as expanded detail views, then strips ANSI.
 */
export function extractYankContent(
	entry: TimelineEntry,
	theme?: Theme,
): string {
	const terminalColumns = Number.isFinite(process.stdout.columns)
		? process.stdout.columns
		: 120;
	const width = Math.max(10, terminalColumns - 6);
	const lines = renderYankLines(entry, width, theme);
	return lines.map(line => stripAnsi(line).trimEnd()).join('\n');
}

function renderYankLines(
	entry: TimelineEntry,
	width: number,
	theme?: Theme,
): string[] {
	const event = entry.feedEvent;
	if (!event) {
		return renderMarkdownToLines(entry.details || entry.summary, width);
	}

	return renderDetailLines(event, width, entry.pairedPostEvent, theme).lines;
}
