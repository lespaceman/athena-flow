// source/feed/mapper.ts

import type {RuntimeEvent, RuntimeDecision} from '../runtime/types.js';
import type {
	FeedEvent,
	FeedEventKind,
	FeedEventLevel,
	FeedEventCause,
} from './types.js';
import type {Session, Run, Actor} from './entities.js';
import {ActorRegistry} from './entities.js';
import {generateTitle} from './titleGen.js';

export type FeedMapper = {
	mapEvent(event: RuntimeEvent): FeedEvent[];
	mapDecision(eventId: string, decision: RuntimeDecision): FeedEvent | null;
	getSession(): Session | null;
	getCurrentRun(): Run | null;
	getActors(): Actor[];
};

export function createFeedMapper(): FeedMapper {
	let currentSession: Session | null = null;
	let currentRun: Run | null = null;
	const actors = new ActorRegistry();
	let seq = 0;
	let runSeq = 0;

	// Correlation indexes
	const toolPreIndex = new Map<string, string>(); // tool_use_id → feed event_id
	const eventIdByRequestId = new Map<string, string>(); // runtime id → feed event_id
	const eventKindByRequestId = new Map<string, string>(); // runtime id → feed kind

	function nextSeq(): number {
		return ++seq;
	}

	function getRunId(): string {
		const sessId = currentSession?.session_id ?? 'unknown';
		return `${sessId}:R${runSeq}`;
	}

	function makeEvent(
		kind: FeedEventKind,
		level: FeedEventLevel,
		actorId: string,
		data: unknown,
		runtimeEvent: RuntimeEvent,
		cause?: Partial<FeedEventCause>,
	): FeedEvent {
		const s = nextSeq();
		const eventId = `${getRunId()}:E${s}`;

		const baseCause: FeedEventCause = {
			hook_request_id: runtimeEvent.id,
			transcript_path: runtimeEvent.context.transcriptPath,
			...cause,
		};

		const fe = {
			event_id: eventId,
			seq: s,
			ts: runtimeEvent.timestamp,
			session_id: runtimeEvent.sessionId,
			run_id: getRunId(),
			kind,
			level,
			actor_id: actorId,
			cause: baseCause,
			title: '',
			raw: runtimeEvent.payload,
			data,
		} as FeedEvent;

		fe.title = generateTitle(fe);

		// Index for decision correlation
		eventIdByRequestId.set(runtimeEvent.id, eventId);
		eventKindByRequestId.set(runtimeEvent.id, kind);

		return fe;
	}

	function closeRun(
		runtimeEvent: RuntimeEvent,
		status: 'completed' | 'failed' | 'aborted',
	): FeedEvent | null {
		if (!currentRun) return null;
		currentRun.status = status;
		currentRun.ended_at = runtimeEvent.timestamp;
		const evt = makeEvent(
			'run.end',
			'info',
			'system',
			{status, counters: {...currentRun.counters}},
			runtimeEvent,
		);
		currentRun = null;
		return evt;
	}

	function ensureRunArray(
		runtimeEvent: RuntimeEvent,
		triggerType: 'user_prompt_submit' | 'resume' | 'other' = 'other',
		promptPreview?: string,
	): FeedEvent[] {
		if (currentRun && triggerType === 'other') return [];

		const results: FeedEvent[] = [];

		if (currentRun) {
			const closeEvt = closeRun(runtimeEvent, 'completed');
			if (closeEvt) results.push(closeEvt);
		}

		runSeq++;
		seq = 0;
		toolPreIndex.clear();
		eventIdByRequestId.clear();
		eventKindByRequestId.clear();
		currentRun = {
			run_id: getRunId(),
			session_id: runtimeEvent.sessionId,
			started_at: runtimeEvent.timestamp,
			trigger: {type: triggerType, prompt_preview: promptPreview},
			status: 'running',
			actors: {root_agent_id: 'agent:root', subagent_ids: []},
			counters: {
				tool_uses: 0,
				tool_failures: 0,
				permission_requests: 0,
				blocks: 0,
			},
		};

		results.push(
			makeEvent(
				'run.start',
				'info',
				'system',
				{trigger: {type: triggerType, prompt_preview: promptPreview}},
				runtimeEvent,
			),
		);

		return results;
	}

	function getActorForTool(runtimeEvent: RuntimeEvent): string {
		if (runtimeEvent.agentId) {
			actors.ensureSubagent(
				runtimeEvent.agentId,
				runtimeEvent.agentType ?? 'unknown',
			);
			return `subagent:${runtimeEvent.agentId}`;
		}
		return 'agent:root';
	}

	function resolveToolUseId(
		event: RuntimeEvent,
		p: Record<string, unknown>,
	): string | undefined {
		return event.toolUseId ?? (p.tool_use_id as string | undefined);
	}

	function toolUseCause(
		toolUseId: string | undefined,
		parentId: string | undefined,
	): Partial<FeedEventCause> {
		return {
			...(toolUseId ? {tool_use_id: toolUseId} : {}),
			...(parentId ? {parent_event_id: parentId} : {}),
		};
	}

	function mapEvent(event: RuntimeEvent): FeedEvent[] {
		const p = event.payload as Record<string, unknown>;
		const results: FeedEvent[] = [];

		switch (event.hookName) {
			case 'SessionStart': {
				currentSession = {
					session_id: event.sessionId,
					started_at: event.timestamp,
					source: (p.source as string) ?? 'startup',
					model: p.model as string | undefined,
					agent_type: p.agent_type as string | undefined,
				};
				if (p.source === 'resume') {
					results.push(...ensureRunArray(event, 'resume'));
				}
				results.push(
					makeEvent(
						'session.start',
						'info',
						'system',
						{
							source: (p.source as string) ?? 'startup',
							model: p.model as string | undefined,
							agent_type: p.agent_type as string | undefined,
						} satisfies import('./types.js').SessionStartData,
						event,
					),
				);
				break;
			}

			case 'SessionEnd': {
				if (currentRun) {
					const closeEvt = closeRun(event, 'completed');
					if (closeEvt) results.push(closeEvt);
				}
				results.push(
					makeEvent(
						'session.end',
						'info',
						'system',
						{
							reason: (p.reason as string) ?? 'unknown',
						} satisfies import('./types.js').SessionEndData,
						event,
					),
				);
				if (currentSession) {
					currentSession.ended_at = event.timestamp;
				}
				break;
			}

			case 'UserPromptSubmit': {
				const prompt = (p.prompt as string) ?? '';
				results.push(
					...ensureRunArray(event, 'user_prompt_submit', prompt.slice(0, 80)),
				);
				results.push(
					makeEvent(
						'user.prompt',
						'info',
						'user',
						{
							prompt,
							cwd: event.context.cwd,
							permission_mode:
								event.context.permissionMode ?? (p.permission_mode as string),
						} satisfies import('./types.js').UserPromptData,
						event,
					),
				);
				break;
			}

			case 'PreToolUse': {
				results.push(...ensureRunArray(event));
				if (currentRun) currentRun.counters.tool_uses++;
				const toolUseId = resolveToolUseId(event, p);
				const fe = makeEvent(
					'tool.pre',
					'info',
					getActorForTool(event),
					{
						tool_name: event.toolName ?? (p.tool_name as string),
						tool_input: (p.tool_input as Record<string, unknown>) ?? {},
						tool_use_id: toolUseId,
					} satisfies import('./types.js').ToolPreData,
					event,
					toolUseId ? {tool_use_id: toolUseId} : undefined,
				);
				if (toolUseId) {
					toolPreIndex.set(toolUseId, fe.event_id);
				}
				results.push(fe);
				break;
			}

			case 'PostToolUse': {
				results.push(...ensureRunArray(event));
				const toolUseId = resolveToolUseId(event, p);
				const parentId = toolUseId ? toolPreIndex.get(toolUseId) : undefined;
				results.push(
					makeEvent(
						'tool.post',
						'info',
						getActorForTool(event),
						{
							tool_name: event.toolName ?? (p.tool_name as string),
							tool_input: (p.tool_input as Record<string, unknown>) ?? {},
							tool_use_id: toolUseId,
							tool_response: p.tool_response,
						} satisfies import('./types.js').ToolPostData,
						event,
						toolUseCause(toolUseId, parentId),
					),
				);
				break;
			}

			case 'PostToolUseFailure': {
				results.push(...ensureRunArray(event));
				if (currentRun) currentRun.counters.tool_failures++;
				const toolUseId = resolveToolUseId(event, p);
				const parentId = toolUseId ? toolPreIndex.get(toolUseId) : undefined;
				results.push(
					makeEvent(
						'tool.failure',
						'error',
						getActorForTool(event),
						{
							tool_name: event.toolName ?? (p.tool_name as string),
							tool_input: (p.tool_input as Record<string, unknown>) ?? {},
							tool_use_id: toolUseId,
							error: (p.error as string) ?? 'Unknown error',
							is_interrupt: p.is_interrupt as boolean | undefined,
						} satisfies import('./types.js').ToolFailureData,
						event,
						toolUseCause(toolUseId, parentId),
					),
				);
				break;
			}

			case 'PermissionRequest': {
				results.push(...ensureRunArray(event));
				if (currentRun) currentRun.counters.permission_requests++;
				results.push(
					makeEvent(
						'permission.request',
						'warn',
						'system',
						{
							tool_name: event.toolName ?? (p.tool_name as string),
							tool_input: (p.tool_input as Record<string, unknown>) ?? {},
							tool_use_id: resolveToolUseId(event, p),
							permission_suggestions: p.permission_suggestions as
								| Array<{type: string; tool: string}>
								| undefined,
						} satisfies import('./types.js').PermissionRequestData,
						event,
					),
				);
				break;
			}

			case 'Stop': {
				results.push(...ensureRunArray(event));
				results.push(
					makeEvent(
						'stop.request',
						'warn',
						'system',
						{
							stop_hook_active: (p.stop_hook_active as boolean) ?? false,
							scope: (p.scope as 'root' | 'subagent') ?? 'root',
							agent_id: p.agent_id as string | undefined,
							agent_type: p.agent_type as string | undefined,
						} satisfies import('./types.js').StopRequestData,
						event,
					),
				);
				break;
			}

			case 'SubagentStart': {
				results.push(...ensureRunArray(event));
				const agentId = event.agentId ?? (p.agent_id as string | undefined);
				const agentType =
					event.agentType ?? (p.agent_type as string | undefined);
				if (agentId) {
					actors.ensureSubagent(agentId, agentType ?? 'unknown');
					if (currentRun) currentRun.actors.subagent_ids.push(agentId);
				}
				results.push(
					makeEvent(
						'subagent.start',
						'info',
						'agent:root',
						{
							agent_id: agentId ?? '',
							agent_type: agentType ?? '',
						} satisfies import('./types.js').SubagentStartData,
						event,
					),
				);
				break;
			}

			case 'SubagentStop': {
				results.push(...ensureRunArray(event));
				const agentId = event.agentId ?? (p.agent_id as string | undefined);
				results.push(
					makeEvent(
						'subagent.stop',
						'info',
						`subagent:${agentId ?? 'unknown'}`,
						{
							agent_id: agentId ?? '',
							agent_type: event.agentType ?? (p.agent_type as string) ?? '',
							stop_hook_active: (p.stop_hook_active as boolean) ?? false,
							agent_transcript_path: p.agent_transcript_path as
								| string
								| undefined,
						} satisfies import('./types.js').SubagentStopData,
						event,
					),
				);
				break;
			}

			case 'Notification': {
				results.push(...ensureRunArray(event));
				results.push(
					makeEvent(
						'notification',
						'info',
						'system',
						{
							message: (p.message as string) ?? '',
							title: p.title as string | undefined,
							notification_type: p.notification_type as string | undefined,
						} satisfies import('./types.js').NotificationData,
						event,
					),
				);
				break;
			}

			case 'PreCompact': {
				results.push(...ensureRunArray(event));
				results.push(
					makeEvent(
						'compact.pre',
						'info',
						'system',
						{
							trigger: (p.trigger as 'manual' | 'auto') ?? 'auto',
							custom_instructions: p.custom_instructions as string | undefined,
						} satisfies import('./types.js').PreCompactData,
						event,
					),
				);
				break;
			}

			case 'Setup': {
				results.push(...ensureRunArray(event));
				results.push(
					makeEvent(
						'setup',
						'info',
						'system',
						{
							trigger: (p.trigger as 'init' | 'maintenance') ?? 'init',
						} satisfies import('./types.js').SetupData,
						event,
					),
				);
				break;
			}

			default: {
				results.push(...ensureRunArray(event));
				results.push(
					makeEvent(
						'unknown.hook',
						'debug',
						'system',
						{
							hook_event_name: event.hookName,
							payload: event.payload,
						} satisfies import('./types.js').UnknownHookData,
						event,
					),
				);
				break;
			}
		}

		return results;
	}

	function mapDecision(
		requestId: string,
		decision: RuntimeDecision,
	): FeedEvent | null {
		const parentEventId = eventIdByRequestId.get(requestId);
		if (!parentEventId) return null;

		const originalKind = eventKindByRequestId.get(requestId);

		function makeDecisionEvent(kind: FeedEventKind, data: unknown): FeedEvent {
			const s = nextSeq();
			const fe = {
				event_id: `${getRunId()}:E${s}`,
				seq: s,
				ts: Date.now(),
				session_id: currentSession?.session_id ?? 'unknown',
				run_id: getRunId(),
				kind,
				level: 'info' as const,
				actor_id: decision.source === 'user' ? 'user' : 'system',
				cause: {
					parent_event_id: parentEventId,
					hook_request_id: requestId,
				},
				title: '',
				data,
			} as FeedEvent;
			fe.title = generateTitle(fe);
			return fe;
		}

		if (originalKind === 'permission.request') {
			let data: import('./types.js').PermissionDecisionData;

			if (decision.source === 'timeout') {
				data = {decision_type: 'no_opinion', reason: 'timeout'};
			} else if (decision.type === 'passthrough') {
				data = {decision_type: 'no_opinion', reason: decision.source};
			} else if (decision.intent?.kind === 'permission_allow') {
				data = {decision_type: 'allow'};
			} else if (decision.intent?.kind === 'permission_deny') {
				data = {
					decision_type: 'deny',
					message: decision.intent.reason ?? 'Denied',
				};
			} else {
				data = {decision_type: 'no_opinion', reason: 'unknown'};
			}

			return makeDecisionEvent('permission.decision', data);
		}

		if (originalKind === 'stop.request') {
			let data: import('./types.js').StopDecisionData;

			if (decision.source === 'timeout' || decision.type === 'passthrough') {
				data = {decision_type: 'no_opinion', reason: decision.source};
			} else if (decision.type === 'block') {
				data = {
					decision_type: 'block',
					reason: decision.reason ?? 'Blocked',
				};
			} else {
				data = {decision_type: 'allow', reason: decision.reason};
			}

			return makeDecisionEvent('stop.decision', data);
		}

		return null;
	}

	return {
		mapEvent,
		mapDecision,
		getSession: () => currentSession,
		getCurrentRun: () => currentRun,
		getActors: () => actors.all(),
	};
}
