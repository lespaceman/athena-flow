import {feedGlyphs} from '../glyphs/index.js';
import {type Message} from '../types/index.js';
import {
	compactText,
	fit,
	formatClock,
	summarizeToolPrimaryInput,
} from '../utils/format.js';
import {
	extractFriendlyServerName,
	parseToolName,
} from '../utils/toolNameParser.js';
import {summarizeToolResult} from '../utils/toolSummary.js';
import {type FeedEvent, type FeedEventKind} from './types.js';

export type RunStatus = 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';

export type TimelineEntry = {
	id: string;
	ts: number;
	runId?: string;
	op: string; // Title Case label (e.g. "Tool Call")
	opTag: string; // Internal slug for styling (e.g. "tool.call")
	detail: string; // DETAIL column content
	actor: string;
	actorId: string;
	summary: string;
	/** Char offset within summary where dim styling should begin (undefined = no dim). */
	summaryDimStart?: number;
	searchText: string;
	error: boolean;
	expandable: boolean;
	details: string;
	feedEvent?: FeedEvent;
	pairedPostEvent?: FeedEvent;
};

export type RunSummary = {
	runId: string;
	title: string;
	status: RunStatus;
	startedAt: number;
	endedAt?: number;
};

export function eventOperation(event: FeedEvent): string {
	switch (event.kind) {
		case 'run.start':
			return 'run.start';
		case 'run.end':
			if (event.data.status === 'completed') return 'run.ok';
			if (event.data.status === 'failed') return 'run.fail';
			return 'run.abort';
		case 'user.prompt':
			return 'prompt';
		case 'tool.pre':
			return 'tool.call';
		case 'tool.post':
			return 'tool.ok';
		case 'tool.failure':
			return 'tool.fail';
		case 'subagent.start':
			return 'sub.start';
		case 'subagent.stop':
			return 'sub.stop';
		case 'permission.request':
			return 'perm.req';
		case 'permission.decision':
			return `perm.${event.data.decision_type}`;
		case 'stop.request':
			return 'stop.req';
		case 'stop.decision':
			return `stop.${event.data.decision_type}`;
		case 'session.start':
			return 'sess.start';
		case 'session.end':
			return 'sess.end';
		case 'notification':
			return 'notify';
		case 'compact.pre':
			return 'compact';
		case 'setup':
			return 'setup';
		case 'unknown.hook':
			return 'unknown';
		case 'todo.add':
			return 'todo.add';
		case 'todo.update':
			return 'todo.upd';
		case 'todo.done':
			return 'todo.done';
		case 'agent.message':
			return 'agent.msg';
		case 'teammate.idle':
			return 'tm.idle';
		case 'task.completed':
			return 'task.ok';
		case 'config.change':
			return 'cfg.chg';
		default:
			return 'event';
	}
}

/** Human-readable Title Case label for the EVENT column. */
export function eventLabel(event: FeedEvent): string {
	switch (event.kind) {
		case 'run.start':
			return 'Run Start';
		case 'run.end':
			if (event.data.status === 'completed') return 'Run OK';
			if (event.data.status === 'failed') return 'Run Fail';
			return 'Run Abort';
		case 'user.prompt':
			return 'User Prompt';
		case 'tool.pre':
			return 'Tool Call';
		case 'tool.post':
			return 'Tool OK';
		case 'tool.failure':
			return 'Tool Fail';
		case 'subagent.start':
			return 'Sub Start';
		case 'subagent.stop':
			return 'Sub Stop';
		case 'permission.request':
			return 'Perm Request';
		case 'permission.decision':
			switch (event.data.decision_type) {
				case 'allow':
					return 'Perm Allow';
				case 'deny':
					return 'Perm Deny';
				case 'ask':
					return 'Perm Ask';
				case 'no_opinion':
					return 'Perm Skip';
			}
			break;
		case 'stop.request':
			return 'Stop Request';
		case 'stop.decision':
			switch (event.data.decision_type) {
				case 'block':
					return 'Stop Block';
				case 'allow':
					return 'Stop Allow';
				case 'no_opinion':
					return 'Stop Skip';
			}
			break;
		case 'session.start':
			return 'Sess Start';
		case 'session.end':
			return 'Sess End';
		case 'notification':
			return 'Notify';
		case 'compact.pre':
			return 'Compact';
		case 'setup':
			return 'Setup';
		case 'unknown.hook':
			return 'Unknown';
		case 'todo.add':
			return 'Todo Add';
		case 'todo.update':
			return 'Todo Update';
		case 'todo.done':
			return 'Todo Done';
		case 'agent.message':
			return 'Agent Msg';
		case 'teammate.idle':
			return 'Team Idle';
		case 'task.completed':
			return 'Task OK';
		case 'config.change':
			return 'Config Chg';
		default:
			return 'Event';
	}
	return 'Event'; // unreachable fallback for TS exhaustiveness
}

/** Extract contextual detail for the DETAIL column (tool name, agent type, etc.). */
export function eventDetail(event: FeedEvent): string {
	switch (event.kind) {
		case 'tool.pre':
		case 'tool.post':
		case 'tool.failure':
			return resolveDisplayName(event.data.tool_name);
		case 'permission.request':
			return resolveDisplayName(event.data.tool_name);
		case 'subagent.start':
		case 'subagent.stop':
			return event.data.agent_type;
		case 'todo.add':
			return (event.data.priority ?? 'p1').toUpperCase();
		case 'todo.update':
			return event.data.todo_id;
		case 'todo.done':
			return event.data.todo_id;
		case 'session.start':
			return event.data.source;
		case 'config.change':
			return event.data.source;
		default:
			return '\u2500'; // ─ em dash placeholder
	}
}

/** Resolve a tool name to its display form (e.g. MCP → `[server] action`). */
function resolveDisplayName(toolName: string): string {
	const parsed = parseToolName(toolName);
	if (parsed.isMcp && parsed.mcpServer && parsed.mcpAction) {
		const friendlyServer = extractFriendlyServerName(parsed.mcpServer);
		return `[${friendlyServer}] ${parsed.mcpAction}`;
	}
	return toolName;
}

type ToolSummaryResult = {text: string; dimStart?: number};

function formatToolSummary(
	toolName: string,
	toolInput: Record<string, unknown>,
	errorSuffix?: string,
): ToolSummaryResult {
	const name = resolveDisplayName(toolName);
	const primaryInput = summarizeToolPrimaryInput(toolName, toolInput);
	const secondary = [primaryInput, errorSuffix].filter(Boolean).join(' ');
	if (!secondary) {
		return {text: compactText(name, 200)};
	}
	const full = `${name} ${secondary}`;
	return {text: compactText(full, 200), dimStart: name.length + 1};
}

export type SummaryResult = {text: string; dimStart?: number};

export function eventSummary(event: FeedEvent): SummaryResult {
	switch (event.kind) {
		case 'tool.pre':
			return formatToolSummary(event.data.tool_name, event.data.tool_input);
		case 'tool.post':
			return formatToolSummary(event.data.tool_name, event.data.tool_input);
		case 'tool.failure':
			return formatToolSummary(
				event.data.tool_name,
				event.data.tool_input,
				event.data.error,
			);
		case 'permission.request':
			return formatToolSummary(event.data.tool_name, event.data.tool_input);
		case 'subagent.start':
		case 'subagent.stop': {
			const desc = event.data.description;
			if (desc) {
				const text = compactText(`${event.data.agent_type}: ${desc}`, 200);
				return {text, dimStart: event.data.agent_type.length + 2};
			}
			return {text: compactText(event.data.agent_type, 200)};
		}
		default:
			return {text: eventSummaryText(event)};
	}
}

/** Strip inline markdown syntax for compact single-line display. */
function stripMarkdownInline(text: string): string {
	return text
		.replace(/#{1,6}\s+/g, '')
		.replace(/\*\*(.+?)\*\*/g, '$1')
		.replace(/__(.+?)__/g, '$1')
		.replace(/\*(.+?)\*/g, '$1')
		.replace(/`(.+?)`/g, '$1')
		.replace(/~~(.+?)~~/g, '$1');
}

/** Extract first sentence (ends with `. ` or newline) from text. */
function firstSentence(text: string): string {
	const nlIdx = text.indexOf('\n');
	const sentIdx = text.indexOf('. ');
	// Convert -1 (not found) to Infinity so Math.min picks the real match
	const nlEnd = nlIdx === -1 ? Infinity : nlIdx;
	const sentEnd = sentIdx === -1 ? Infinity : sentIdx + 1; // +1 to include the period
	const end = Math.min(nlEnd, sentEnd, text.length);
	return text.slice(0, end).trim();
}

function eventSummaryText(event: FeedEvent): string {
	switch (event.kind) {
		case 'run.start':
			return compactText(
				event.data.trigger.prompt_preview || 'interactive',
				200,
			);
		case 'run.end':
			return compactText(
				`${event.data.status} — ${event.data.counters.tool_uses} tools, ${event.data.counters.tool_failures} failures`,
				200,
			);
		case 'user.prompt':
			return compactText(event.data.prompt, 200);
		case 'permission.decision': {
			const detail =
				event.data.decision_type === 'deny'
					? event.data.message || event.data.reason
					: event.data.reason;
			return compactText(detail || event.data.decision_type, 200);
		}
		case 'stop.request':
			return compactText(
				`stop_hook_active=${event.data.stop_hook_active}`,
				200,
			);
		case 'stop.decision':
			return compactText(event.data.reason || event.data.decision_type, 200);
		case 'session.start': {
			const model = event.data.model;
			return model
				? compactText(`${event.data.source} (${model})`, 200)
				: compactText(event.data.source, 200);
		}
		case 'session.end':
			return compactText(event.data.reason, 200);
		case 'notification':
			return compactText(stripMarkdownInline(event.data.message), 200);
		case 'compact.pre':
			return compactText(event.data.trigger, 200);
		case 'setup':
			return compactText(event.data.trigger, 200);
		case 'unknown.hook':
			return compactText(event.data.hook_event_name, 200);
		case 'todo.add':
			return compactText(
				`${event.data.priority?.toUpperCase() ?? 'P1'} ${event.data.text}`,
				200,
			);
		case 'todo.update': {
			const patchFields = Object.keys(event.data.patch);
			return compactText(
				`${event.data.todo_id} ${patchFields.length > 0 ? patchFields.join(',') : 'update'}`,
				200,
			);
		}
		case 'todo.done':
			return compactText(
				`${event.data.todo_id} ${event.data.reason || 'done'}`,
				200,
			);
		case 'agent.message':
			return compactText(
				firstSentence(stripMarkdownInline(event.data.message)),
				200,
			);
		case 'teammate.idle':
			return compactText(
				`${event.data.teammate_name} idle in ${event.data.team_name}`,
				200,
			);
		case 'task.completed':
			return compactText(event.data.task_subject, 200);
		case 'config.change':
			return compactText(
				`${event.data.source}${event.data.file_path ? ` ${event.data.file_path}` : ''}`,
				200,
			);
		default:
			return compactText('event', 200);
	}
}

export function expansionForEvent(event: FeedEvent): string {
	switch (event.kind) {
		case 'tool.pre':
			return JSON.stringify(
				{tool: event.data.tool_name, args: event.data.tool_input},
				null,
				2,
			);
		case 'tool.post':
			return JSON.stringify(
				{
					tool: event.data.tool_name,
					args: event.data.tool_input,
					result: event.data.tool_response,
				},
				null,
				2,
			);
		case 'tool.failure':
			return JSON.stringify(
				{
					tool: event.data.tool_name,
					args: event.data.tool_input,
					error: event.data.error,
					interrupt: event.data.is_interrupt,
				},
				null,
				2,
			);
		case 'permission.request':
			return JSON.stringify(
				{
					tool: event.data.tool_name,
					args: event.data.tool_input,
					suggestions: event.data.permission_suggestions,
				},
				null,
				2,
			);
		case 'subagent.stop':
		case 'run.end':
			return JSON.stringify(event.data, null, 2);
		default:
			return JSON.stringify(event.raw ?? event.data, null, 2);
	}
}

export function isEventError(event: FeedEvent): boolean {
	if (event.level === 'error') return true;
	if (event.kind === 'tool.failure') return true;
	if (event.kind === 'run.end') return event.data.status !== 'completed';
	if (
		event.kind === 'permission.decision' &&
		event.data.decision_type === 'deny'
	) {
		return true;
	}
	if (event.kind === 'stop.decision' && event.data.decision_type === 'block') {
		return true;
	}
	return false;
}

export function isEventExpandable(event: FeedEvent): boolean {
	return (
		event.kind === 'tool.pre' ||
		event.kind === 'tool.post' ||
		event.kind === 'tool.failure' ||
		event.kind === 'permission.request' ||
		event.kind === 'subagent.stop' ||
		event.kind === 'run.end' ||
		event.kind === 'notification' ||
		event.kind === 'agent.message'
	);
}

export function deriveRunTitle(
	currentPromptPreview: string | undefined,
	feedEvents: FeedEvent[],
	messages: Message[],
): string {
	if (currentPromptPreview?.trim()) {
		return compactText(currentPromptPreview, 44);
	}
	for (let i = feedEvents.length - 1; i >= 0; i--) {
		const event = feedEvents[i]!;
		if (
			event.kind === 'run.start' &&
			event.data.trigger.prompt_preview?.trim()
		) {
			return compactText(event.data.trigger.prompt_preview, 44);
		}
		if (event.kind === 'user.prompt' && event.data.prompt.trim()) {
			return compactText(event.data.prompt, 44);
		}
	}
	for (let i = messages.length - 1; i >= 0; i--) {
		const message = messages[i]!;
		if (message.role === 'user' && message.content.trim()) {
			return compactText(message.content, 44);
		}
	}
	return 'Untitled run';
}

// ── Verbose filtering ────────────────────────────────────

export const VERBOSE_ONLY_KINDS: ReadonlySet<FeedEventKind> = new Set([
	'session.start',
	'session.end',
	'run.start',
	'run.end',
	'user.prompt',
	'notification',
	'unknown.hook',
	'compact.pre',
	'config.change',
]);

// ── Merged tool event helpers ────────────────────────────

/**
 * Return the merged op code for a tool.pre that has a paired post/failure.
 * Falls back to the default eventOperation when no postEvent is given.
 */
export function mergedEventOperation(
	event: FeedEvent,
	postEvent?: FeedEvent,
): string {
	if (!postEvent) return eventOperation(event);
	if (postEvent.kind === 'tool.failure') return 'tool.fail';
	if (postEvent.kind === 'tool.post') return 'tool.ok';
	return eventOperation(event);
}

/**
 * Return the merged Title Case label for a tool.pre that has a paired post/failure.
 * Falls back to the default eventLabel when no postEvent is given.
 */
export function mergedEventLabel(
	event: FeedEvent,
	postEvent?: FeedEvent,
): string {
	if (!postEvent) return eventLabel(event);
	if (postEvent.kind === 'tool.failure') return 'Tool Fail';
	if (postEvent.kind === 'tool.post') return 'Tool OK';
	return eventLabel(event);
}

/**
 * Return the merged summary for a tool.pre paired with its post/failure.
 * Format: "ToolName — result summary" with dimStart after the tool name.
 */
export function mergedEventSummary(
	event: FeedEvent,
	postEvent?: FeedEvent,
): SummaryResult {
	if (!postEvent) return eventSummary(event);
	if (event.kind !== 'tool.pre' && event.kind !== 'permission.request') {
		return eventSummary(event);
	}

	const toolName = event.data.tool_name;
	const toolInput = event.data.tool_input ?? {};
	const name = resolveDisplayName(toolName);
	const primaryInput = summarizeToolPrimaryInput(toolName, toolInput);

	let resultText: string;
	if (postEvent.kind === 'tool.failure') {
		resultText = summarizeToolResult(
			toolName,
			toolInput,
			undefined,
			postEvent.data.error,
		);
	} else if (postEvent.kind === 'tool.post') {
		resultText = summarizeToolResult(
			toolName,
			toolInput,
			postEvent.data.tool_response,
		);
	} else {
		return eventSummary(event);
	}

	const prefix = primaryInput ? `${name} ${primaryInput}` : name;
	const full = `${prefix} — ${resultText}`;
	return {text: compactText(full, 200), dimStart: name.length};
}

/** Column positions in formatted feed line (0-indexed char offsets). */
export const FEED_GUTTER_WIDTH = 1;
export const FEED_EVENT_COL_START = 7; // after " HH:MM " (1+5+1)
export const FEED_EVENT_COL_END = 19; // 7 + 12 (event width)
export const FEED_DETAIL_COL_START = 20; // 19 + 1 gap
export const FEED_DETAIL_COL_END = 36; // 20 + 16 (detail width)
export const FEED_ACTOR_COL_START = 37; // 36 + 1 gap
export const FEED_ACTOR_COL_END = 47; // 37 + 10 (actor width)
export const FEED_SUMMARY_COL_START = 48; // 47 + 1 gap

// Keep old names as aliases for backward compat
export const FEED_OP_COL_START = FEED_EVENT_COL_START;
export const FEED_OP_COL_END = FEED_EVENT_COL_END;

export function formatFeedLine(
	entry: TimelineEntry,
	width: number,
	focused: boolean,
	expanded: boolean,
	matched: boolean,
	ascii = false,
): string {
	const g = feedGlyphs(ascii);
	const glyph = entry.expandable
		? expanded
			? g.expandExpanded
			: g.expandCollapsed
		: ' ';
	const suffix = ` ${glyph}`;
	const time = fit(formatClock(entry.ts), 5);
	const event = fit(entry.op, 12);
	const detail = fit(entry.detail ?? '\u2500', 16);
	const actor = fit(entry.actor, 10);
	const bodyWidth = Math.max(0, width - 3); // 1 gutter + 2 suffix
	const summaryWidth = Math.max(0, bodyWidth - 47); // 5+1+12+1+16+1+10+1 = 47
	const body = fit(
		`${time} ${event} ${detail} ${actor} ${fit(entry.summary, summaryWidth)}`,
		bodyWidth,
	);
	return ` ${body}${suffix}`;
}

export function formatFeedHeaderLine(width: number): string {
	const time = fit('TIME', 5);
	const event = fit('EVENT', 12);
	const detail = fit('DETAIL', 16);
	const actor = fit('ACTOR', 10);
	const summaryWidth = Math.max(0, width - 50); // 1+5+1+12+1+16+1+10+1+2 = 50
	const summaryLabel = fit('SUMMARY', summaryWidth);
	return fit(` ${time} ${event} ${detail} ${actor} ${summaryLabel}  `, width);
}

export function toRunStatus(
	event: Extract<FeedEvent, {kind: 'run.end'}>,
): RunStatus {
	switch (event.data.status) {
		case 'completed':
			return 'SUCCEEDED';
		case 'failed':
			return 'FAILED';
		case 'aborted':
			return 'CANCELLED';
	}
}
