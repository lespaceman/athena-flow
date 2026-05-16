import type {RuntimeEvent} from '../../runtime/types';
import type {FeedEvent, FeedEventCause} from '../types';
import type {RunLifecycle} from './runLifecycle';
import type {ToolCorrelation} from './toolCorrelation';
import type {RootPlanTracker} from './rootPlanTracker';
import type {SubagentTracker} from './subagentTracker';
import {type TodoItem, type TodoWriteInput, isSubagentTool} from '../todo';
import {
	type EnsureRun,
	type FeedEventBuilder,
	readBoolean,
	readObject,
	readString,
} from './projection';

export function extractTodoItems(toolInput: unknown): TodoItem[] {
	const input = toolInput as TodoWriteInput | undefined;
	return Array.isArray(input?.todos) ? input.todos : [];
}

export function resolveToolUseId(
	event: RuntimeEvent,
	record: Record<string, unknown>,
): string | undefined {
	return event.toolUseId ?? (record['tool_use_id'] as string | undefined);
}

export function toolUseCause(
	toolUseId: string | undefined,
	parentId: string | undefined,
): Partial<FeedEventCause> {
	return {
		...(toolUseId ? {tool_use_id: toolUseId} : {}),
		...(parentId ? {parent_event_id: parentId} : {}),
	};
}

export type ToolProjection = {
	mapToolEvent(event: RuntimeEvent, data: Record<string, unknown>): FeedEvent[];
};

export function createToolProjection(args: {
	ensureRunArray: EnsureRun;
	makeEvent: FeedEventBuilder;
	runLifecycle: RunLifecycle;
	toolCorrelation: ToolCorrelation;
	rootPlan: RootPlanTracker;
	subagents: SubagentTracker;
	resolveToolActor: () => string;
}): ToolProjection {
	const {
		ensureRunArray,
		makeEvent,
		runLifecycle,
		toolCorrelation,
		rootPlan,
		subagents,
		resolveToolActor,
	} = args;

	function webSearchStarted(
		event: RuntimeEvent,
		data: Record<string, unknown>,
		toolUseId: string | undefined,
		parentEventId: string,
	): FeedEvent {
		const toolInput = readObject(data['tool_input']);
		const query = readString(toolInput['query']);
		return makeEvent(
			'web.search',
			'info',
			'system',
			{
				message: query ? `Searching web for "${query}".` : 'Searching the web.',
				phase: 'started',
				query,
				item_id: toolUseId,
			} satisfies import('../types').WebSearchData,
			event,
			toolUseId
				? {parent_event_id: parentEventId, tool_use_id: toolUseId}
				: {parent_event_id: parentEventId},
		);
	}

	function webSearchCompleted(
		event: RuntimeEvent,
		data: Record<string, unknown>,
		toolUseId: string | undefined,
		parentEventId: string,
	): FeedEvent {
		const response = readObject(data['tool_response']);
		const actionType = readString(response['type']);
		const query = readString(readObject(data['tool_input'])['query']);
		const url = readString(response['url']);
		const pattern = readString(response['pattern']);
		const queries = Array.isArray(response['queries'])
			? (response['queries'] as string[])
			: undefined;
		const message =
			actionType === 'openPage'
				? url
					? `Opened search result ${url}.`
					: 'Opened search result.'
				: actionType === 'findInPage'
					? pattern
						? `Found "${pattern}" in ${url ?? 'the page'}.`
						: `Searched within ${url ?? 'the page'}.`
					: actionType === 'search'
						? queries && queries.length > 1
							? `Ran ${queries.length} search queries.`
							: query
								? `Searched web for "${query}".`
								: 'Finished web search.'
						: query
							? `Finished web search for "${query}".`
							: 'Finished web search.';
		return makeEvent(
			'web.search',
			'info',
			'system',
			{
				message,
				phase: 'completed',
				query,
				action_type: actionType,
				url,
				pattern,
				queries,
				item_id: toolUseId,
			} satisfies import('../types').WebSearchData,
			event,
			toolUseId
				? {parent_event_id: parentEventId, tool_use_id: toolUseId}
				: {parent_event_id: parentEventId},
		);
	}

	return {
		mapToolEvent(event, data) {
			const results = ensureRunArray(event);
			const toolUseId = resolveToolUseId(event, data);
			const toolName =
				event.toolName ?? readString(data['tool_name']) ?? 'Unknown';
			const toolInput = readObject(data['tool_input']);

			if (event.kind === 'tool.delta') {
				const parentId = toolCorrelation.lookupParent(toolUseId);
				const cumulative = toolCorrelation.appendDelta(
					toolUseId,
					readString(data['delta']) ?? '',
				);
				results.push(
					makeEvent(
						'tool.delta',
						'info',
						resolveToolActor(),
						{
							tool_name: toolName,
							tool_input: toolInput,
							tool_use_id: toolUseId,
							delta: cumulative,
						} satisfies import('../types').ToolDeltaData,
						event,
						toolUseCause(toolUseId, parentId),
					),
				);
				return results;
			}

			if (event.kind === 'tool.pre') {
				runLifecycle.incrementCounter('tool_uses');
				const preEvent = makeEvent(
					'tool.pre',
					'info',
					resolveToolActor(),
					{
						tool_name: toolName,
						tool_input: toolInput,
						tool_use_id: toolUseId,
					} satisfies import('../types').ToolPreData,
					event,
					toolUseId ? {tool_use_id: toolUseId} : undefined,
				);
				if (toolUseId) toolCorrelation.recordPre(toolUseId, preEvent.event_id);
				results.push(preEvent);
				if (toolName === 'WebSearch') {
					results.push(
						webSearchStarted(event, data, toolUseId, preEvent.event_id),
					);
				}
				if (toolName === 'TodoWrite' && preEvent.actor_id === 'agent:root') {
					rootPlan.set(extractTodoItems(toolInput));
				}
				if (isSubagentTool(toolName)) {
					if (typeof toolInput['description'] === 'string') {
						subagents.recordPendingDescription(toolInput['description']);
					} else {
						subagents.clearPendingDescription();
					}
				}
				return results;
			}

			if (event.kind === 'tool.post') {
				if (toolUseId) toolCorrelation.forgetTool(toolUseId);
				const parentId = toolCorrelation.lookupParent(toolUseId);
				const postEvent = makeEvent(
					'tool.post',
					'info',
					resolveToolActor(),
					{
						tool_name: toolName,
						tool_input: toolInput,
						tool_use_id: toolUseId,
						tool_response: data.tool_response,
					} satisfies import('../types').ToolPostData,
					event,
					toolUseCause(toolUseId, parentId),
				);
				results.push(postEvent);
				if (toolName === 'WebSearch') {
					results.push(
						webSearchCompleted(event, data, toolUseId, postEvent.event_id),
					);
				}
				return results;
			}

			if (event.kind === 'tool.failure') {
				runLifecycle.incrementCounter('tool_failures');
				if (toolUseId) toolCorrelation.forgetTool(toolUseId);
				const parentId = toolCorrelation.lookupParent(toolUseId);
				results.push(
					makeEvent(
						'tool.failure',
						'error',
						resolveToolActor(),
						{
							tool_name: toolName,
							tool_input: toolInput,
							tool_use_id: toolUseId,
							error: readString(data['error']) ?? 'Unknown error',
							is_interrupt: readBoolean(data['is_interrupt']),
						} satisfies import('../types').ToolFailureData,
						event,
						toolUseCause(toolUseId, parentId),
					),
				);
			}

			return results;
		},
	};
}
