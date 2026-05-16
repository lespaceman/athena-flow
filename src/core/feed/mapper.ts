// src/feed/mapper.ts
//
// Orchestrator over four internal seams:
//   - RunLifecycle: session/run identity, sequence allocation, counters
//   - DecisionCorrelation: request_id → originating event indexes
//   - ToolCorrelation: tool_use_id → pre event + streamed delta state
//   - AgentMessageStream: assistant message buffering, dedup, transcript replay
//
// Bookkeeping that didn't earn its own seam stays inline here:
//   - active subagent stack (LIFO), subagent descriptions, last task description
//   - last root tasks (todo list)
//   - actor registry

import type {RuntimeEvent, RuntimeDecision} from '../runtime/types';
import type {RuntimeEventKind} from '../runtime/events';
import type {
	FeedEvent,
	FeedEventKind,
	FeedEventLevel,
	FeedEventCause,
} from './types';
import type {Session, Run, Actor} from './entities';
import type {MapperBootstrap} from './bootstrap';
import {type TodoItem} from './todo';
import {ActorRegistry} from './entities';
import {composeTitle} from './titleGen';
import {createTranscriptReader} from './transcript';
import {createRunLifecycle} from './internals/runLifecycle';
import {createDecisionCorrelation} from './internals/decisionCorrelation';
import {createToolCorrelation} from './internals/toolCorrelation';
import {createAgentMessageStream} from './internals/agentMessageStream';
import {createRootPlanTracker} from './internals/rootPlanTracker';
import {createSubagentTracker} from './internals/subagentTracker';
import {readString} from './internals/projection';
import {
	createToolProjection,
	extractTodoItems,
} from './internals/toolProjection';
import {createNotificationProjection} from './internals/notificationProjection';
import {createDecisionProjection} from './internals/decisionProjection';
import {createSubagentProjection} from './internals/subagentProjection';
import {createFileConfigProjection} from './internals/fileConfigProjection';
import {createRunSessionProjection} from './internals/runSessionProjection';
import {createStatusProjection} from './internals/statusProjection';

export type FeedMapper = {
	mapEvent(event: RuntimeEvent): FeedEvent[];
	mapDecision(eventId: string, decision: RuntimeDecision): FeedEvent | null;
	getSession(): Session | null;
	getCurrentRun(): Run | null;
	getActors(): Actor[];
	getTasks(): TodoItem[];
	allocateSeq(): number;
};

const RUN_SESSION_EVENT_KINDS = new Set<RuntimeEventKind>([
	'session.start',
	'session.end',
	'user.prompt',
	'turn.start',
	'message.delta',
	'message.complete',
	'turn.complete',
	'plan.delta',
	'reasoning.delta',
	'usage.update',
]);

const TOOL_EVENT_KINDS = new Set<RuntimeEventKind>([
	'tool.delta',
	'tool.pre',
	'tool.post',
	'tool.failure',
]);

const DECISION_EVENT_KINDS = new Set<RuntimeEventKind>([
	'permission.request',
	'stop.request',
	'stop.failure',
	'permission.denied',
	'elicitation.request',
	'elicitation.result',
]);

const SUBAGENT_EVENT_KINDS = new Set<RuntimeEventKind>([
	'subagent.start',
	'subagent.stop',
]);

const FILE_CONFIG_EVENT_KINDS = new Set<RuntimeEventKind>([
	'compact.pre',
	'setup',
	'config.change',
	'compact.post',
	'cwd.changed',
	'file.changed',
]);

const STATUS_EVENT_KINDS = new Set<RuntimeEventKind>([
	'teammate.idle',
	'task.completed',
	'task.created',
]);

export function createFeedMapper(bootstrap?: MapperBootstrap): FeedMapper {
	const runLifecycle = createRunLifecycle();
	const decisionCorrelation = createDecisionCorrelation();
	const toolCorrelation = createToolCorrelation();
	const transcriptReader = createTranscriptReader();
	const actors = new ActorRegistry();
	const rootPlan = createRootPlanTracker();
	const subagents = createSubagentTracker();

	function makeEvent(
		kind: FeedEventKind,
		level: FeedEventLevel,
		actorId: string,
		data: unknown,
		runtimeEvent: RuntimeEvent,
		cause?: Partial<FeedEventCause>,
	): FeedEvent {
		const s = runLifecycle.allocateSeq();
		const runId = runLifecycle.getRunId();
		const eventId = `${runId}:E${s}`;

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
			run_id: runId,
			kind,
			level,
			actor_id: actorId,
			cause: baseCause,
			title: '',
			display: runtimeEvent.display,
			raw: runtimeEvent.payload,
			data,
		} as FeedEvent;

		fe.title = composeTitle(fe, runtimeEvent);

		if (
			runtimeEvent.interaction.expectsDecision ||
			kind === 'permission.request' ||
			kind === 'stop.request'
		) {
			decisionCorrelation.recordRequest(runtimeEvent.id, eventId, kind);
		}

		return fe;
	}

	const agentMessageStream = createAgentMessageStream(
		makeEvent,
		transcriptReader,
	);

	if (bootstrap) {
		runLifecycle.restoreFrom(bootstrap);
		for (const e of bootstrap.feedEvents) {
			if (
				e.kind === 'tool.pre' &&
				e.actor_id === 'agent:root' &&
				(e.data as {tool_name?: string}).tool_name === 'TodoWrite'
			) {
				rootPlan.set(
					extractTodoItems((e.data as {tool_input?: unknown}).tool_input),
				);
			}
		}
	}

	function closeRunIntoEvent(
		runtimeEvent: RuntimeEvent,
		status: 'completed' | 'failed' | 'aborted',
	): FeedEvent | null {
		const closed = runLifecycle.closeRun(runtimeEvent.timestamp, status);
		if (!closed) return null;
		return makeEvent(
			'run.end',
			'info',
			'system',
			{status, counters: {...closed.counters}},
			runtimeEvent,
		);
	}

	function ensureRunArray(
		runtimeEvent: RuntimeEvent,
		triggerType: Run['trigger']['type'] = 'other',
		promptPreview?: string,
	): FeedEvent[] {
		if (runLifecycle.getCurrentRun() && triggerType === 'other') return [];

		const results: FeedEvent[] = [];

		const closeEvt = closeRunIntoEvent(runtimeEvent, 'completed');
		if (closeEvt) results.push(closeEvt);

		// Reset all per-run state across the seams.
		toolCorrelation.resetForNewRun();
		decisionCorrelation.resetForNewRun();
		agentMessageStream.resetForNewRun();
		subagents.clear();

		runLifecycle.openNewRun(
			runtimeEvent.timestamp,
			runtimeEvent.sessionId,
			triggerType,
			promptPreview,
		);

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

	function resolveToolActor(): string {
		return subagents.peek() ?? 'agent:root';
	}

	const toolProjection = createToolProjection({
		ensureRunArray,
		makeEvent,
		runLifecycle,
		toolCorrelation,
		rootPlan,
		subagents,
		resolveToolActor,
	});

	const notificationProjection = createNotificationProjection({
		ensureRunArray,
		makeEvent,
		decisionCorrelation,
	});

	const decisionProjection = createDecisionProjection({
		ensureRunArray,
		makeEvent,
		runLifecycle,
		decisionCorrelation,
	});

	const subagentProjection = createSubagentProjection({
		ensureRunArray,
		makeEvent,
		runLifecycle,
		actors,
		subagents,
	});

	const fileConfigProjection = createFileConfigProjection({
		ensureRunArray,
		makeEvent,
	});

	const statusProjection = createStatusProjection({
		ensureRunArray,
		makeEvent,
	});

	const currentScope = (): 'root' | 'subagent' => subagents.currentScope();

	const runSessionProjection = createRunSessionProjection({
		ensureRunArray,
		makeEvent,
		closeRunIntoEvent,
		runLifecycle,
		agentMessageStream,
		rootPlan,
		resolveToolActor,
		currentScope,
	});

	function mapEvent(event: RuntimeEvent): FeedEvent[] {
		const d = event.data as Record<string, unknown>;
		const eventKind = event.kind;
		const results: FeedEvent[] = [];

		// Fallback: emit agent.message from last_assistant_message when transcript yields nothing
		function emitFallbackMessage(
			parentKind: FeedEventKind,
			actorId: string,
			scope: 'root' | 'subagent',
		): void {
			if (results.some(r => r.kind === 'agent.message')) return;
			const msg = readString(d['last_assistant_message']);
			if (!msg) return;
			const parentEvt = results.find(r => r.kind === parentKind);
			const ev = agentMessageStream.emit({
				runtimeEvent: event,
				actorId,
				scope,
				message: msg,
				source: 'hook',
				cause: parentEvt ? {parent_event_id: parentEvt.event_id} : undefined,
			});
			if (ev) results.push(ev);
		}

		// Extract new assistant messages from transcript BEFORE processing the
		// hook event so that agent.message gets a lower seq than tool.pre etc.
		// Skip stop events — they use last_assistant_message to avoid flush-timing dupes.
		const transcriptPath = event.context.transcriptPath;
		const isStopEvent =
			eventKind === 'stop.request' || eventKind === 'subagent.stop';
		if (transcriptPath && !isStopEvent) {
			results.push(
				...agentMessageStream.emitTranscriptMessages(
					transcriptPath,
					event,
					resolveToolActor(),
					currentScope(),
				),
			);
		}

		if (RUN_SESSION_EVENT_KINDS.has(eventKind)) {
			results.push(...runSessionProjection.mapRunSessionEvent(event, d));
		} else if (TOOL_EVENT_KINDS.has(eventKind)) {
			results.push(...toolProjection.mapToolEvent(event, d));
		} else if (DECISION_EVENT_KINDS.has(eventKind)) {
			results.push(...decisionProjection.mapRequestEvent(event, d));
		} else if (SUBAGENT_EVENT_KINDS.has(eventKind)) {
			results.push(...subagentProjection.mapSubagentEvent(event, d));
		} else if (eventKind === 'notification') {
			results.push(...notificationProjection.mapNotification(event, d));
		} else if (FILE_CONFIG_EVENT_KINDS.has(eventKind)) {
			results.push(...fileConfigProjection.mapFileConfigEvent(event, d));
		} else if (STATUS_EVENT_KINDS.has(eventKind)) {
			results.push(...statusProjection.mapStatusEvent(event, d));
		} else if (eventKind === 'unknown') {
			results.push(...ensureRunArray(event));
			const unknownEvt = makeEvent(
				'unknown.hook',
				'debug',
				'system',
				{
					hook_event_name:
						readString(
							d['source_event_name'],
							d['hook_event_name'],
							event.hookName,
						) ?? 'unknown',
					payload: d.payload ?? null,
				} satisfies import('./types').UnknownHookData,
				event,
			);
			unknownEvt.ui = {collapsed_default: true};
			results.push(unknownEvt);
		}

		// Stop events: use last_assistant_message directly (always available in payload).
		// Drain the transcript to advance the byte offset and prevent the next event
		// from re-emitting the same text.
		if (eventKind === 'stop.request') {
			if (transcriptPath) agentMessageStream.drainTranscript(transcriptPath);
			emitFallbackMessage('stop.request', 'agent:root', 'root');
		}
		if (eventKind === 'subagent.stop') {
			const agentId = readString(d['agent_id']) ?? 'unknown';
			if (transcriptPath) agentMessageStream.drainTranscript(transcriptPath);
			emitFallbackMessage('subagent.stop', `subagent:${agentId}`, 'subagent');
		}

		return results;
	}

	function mapDecision(
		requestId: string,
		decision: RuntimeDecision,
	): FeedEvent | null {
		return decisionProjection.mapDecision(requestId, decision);
	}

	return {
		mapEvent,
		mapDecision,
		getSession: () => runLifecycle.getSession(),
		getCurrentRun: () => runLifecycle.getCurrentRun(),
		getActors: () => actors.all(),
		getTasks: () => rootPlan.current(),
		allocateSeq: () => runLifecycle.allocateSeq(),
	};
}
