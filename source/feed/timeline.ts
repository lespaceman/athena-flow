import {type FeedEvent} from './types.js';
import {type Message} from '../types/index.js';
import {
	compactText,
	fit,
	formatClock,
	summarizeToolInput,
} from '../utils/format.js';

export type RunStatus = 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';

export type TimelineEntry = {
	id: string;
	ts: number;
	runId?: string;
	op: string;
	actor: string;
	actorId: string;
	summary: string;
	searchText: string;
	error: boolean;
	expandable: boolean;
	details: string;
	feedEvent?: FeedEvent;
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
		default:
			return 'event';
	}
}

export function eventSummary(event: FeedEvent): string {
	switch (event.kind) {
		case 'run.start':
			return compactText(
				event.data.trigger.prompt_preview || 'interactive',
				200,
			);
		case 'run.end':
			return compactText(
				`status=${event.data.status} tools=${event.data.counters.tool_uses} fail=${event.data.counters.tool_failures} perm=${event.data.counters.permission_requests} blk=${event.data.counters.blocks}`,
				200,
			);
		case 'user.prompt':
			return compactText(event.data.prompt, 200);
		case 'tool.pre': {
			const args = summarizeToolInput(event.data.tool_input);
			return compactText(`${event.data.tool_name} ${args}`.trim(), 200);
		}
		case 'tool.post':
			return compactText(event.data.tool_name, 200);
		case 'tool.failure':
			return compactText(`${event.data.tool_name} ${event.data.error}`, 200);
		case 'subagent.start':
		case 'subagent.stop':
			return compactText(
				`${event.data.agent_type} ${event.data.agent_id}`,
				200,
			);
		case 'permission.request':
			return compactText(
				`${event.data.tool_name} ${summarizeToolInput(event.data.tool_input)}`.trim(),
				200,
			);
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
		case 'session.start':
			return compactText(
				`source=${event.data.source}${event.data.model ? ` model=${event.data.model}` : ''}`,
				200,
			);
		case 'session.end':
			return compactText(`reason=${event.data.reason}`, 200);
		case 'notification':
			return compactText(event.data.message, 200);
		case 'compact.pre':
			return compactText(`trigger=${event.data.trigger}`, 200);
		case 'setup':
			return compactText(`trigger=${event.data.trigger}`, 200);
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
			return compactText(event.data.message, 200);
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

import {feedGlyphs} from '../glyphs/index.js';
export {feedGlyphs};

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
	const op = fit(entry.op, 10);
	const actor = fit(entry.actor, 8);
	const bodyWidth = Math.max(0, width - 2); // reserve 2 chars for suffix
	const summaryWidth = Math.max(0, bodyWidth - 26); // 5+1+10+1+8+1 = 26
	const body = fit(
		`${time} ${op} ${actor} ${fit(entry.summary, summaryWidth)}`,
		bodyWidth,
	);
	return `${body}${suffix}`;
}

export function formatFeedHeaderLine(width: number): string {
	const time = fit('TIME', 5);
	const op = fit('OP', 10);
	const actor = fit('ACTOR', 8);
	const summaryWidth = Math.max(0, width - 28);
	const summaryLabel = fit('SUMMARY', summaryWidth);
	return fit(`${time} ${op} ${actor} ${summaryLabel}  `, width);
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
