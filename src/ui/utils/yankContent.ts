import type {TimelineEntry} from '../../core/feed/timeline';
import type {FeedEvent} from '../../core/feed/types';
import {
	renderDetailLines,
	renderMarkdownToLines,
} from '../layout/renderDetailLines';
import stripAnsi from 'strip-ansi';
import {parseToolName} from '../../shared/utils/toolNameParser';

/**
 * Extract copyable rich detail content from a timeline entry.
 * Uses the same renderers as expanded detail views, then strips ANSI.
 */
export function extractYankContent(entry: TimelineEntry): string {
	const terminalColumns = Number.isFinite(process.stdout.columns)
		? process.stdout.columns
		: 120;
	const width = Math.max(10, terminalColumns - 6);
	const lines = renderYankLines(entry, width);
	return lines.map(line => stripAnsi(line).trimEnd()).join('\n');
}

function renderYankLines(entry: TimelineEntry, width: number): string[] {
	const event = entry.feedEvent;
	if (!event) {
		return renderMarkdownToLines(entry.details || entry.summary, width);
	}

	if (
		isToolRequestEvent(event) &&
		entry.pairedPostEvent &&
		isToolTerminalEvent(entry.pairedPostEvent)
	) {
		// Built-in merged detail views hide request payload when a response exists.
		// For yank, preserve request+response for built-ins while avoiding duplicated
		// request/header blocks for MCP tools.
		if (parseToolName(event.data.tool_name).isMcp) {
			return renderDetailLines(event, width, entry.pairedPostEvent).lines;
		}
		const requestLines = renderDetailLines(event, width).lines;
		const responseLines = renderDetailLines(entry.pairedPostEvent, width).lines;
		return [...requestLines, '', ...responseLines];
	}

	return renderDetailLines(event, width, entry.pairedPostEvent).lines;
}

function isToolRequestEvent(
	event: FeedEvent,
): event is Extract<
	FeedEvent,
	{kind: 'tool.pre'} | {kind: 'permission.request'}
> {
	return event.kind === 'tool.pre' || event.kind === 'permission.request';
}

function isToolTerminalEvent(
	event: FeedEvent,
): event is Extract<FeedEvent, {kind: 'tool.post'} | {kind: 'tool.failure'}> {
	return event.kind === 'tool.post' || event.kind === 'tool.failure';
}
