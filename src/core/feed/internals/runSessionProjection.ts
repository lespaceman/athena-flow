import type {RuntimeEvent} from '../../runtime/types';
import type {FeedEvent} from '../types';
import type {RunLifecycle} from './runLifecycle';
import type {AgentMessageStream, MessageScope} from './agentMessageStream';
import type {RootPlanTracker} from './rootPlanTracker';
import type {TodoItem} from '../todo';
import {type EnsureRun, type FeedEventBuilder, readString} from './projection';

function mapPlanStepStatus(status: string | undefined): TodoItem['status'] {
	switch (status) {
		case 'inProgress':
			return 'in_progress';
		case 'completed':
			return 'completed';
		case undefined:
		default:
			return 'pending';
	}
}

export type RunSessionProjection = {
	mapRunSessionEvent(
		event: RuntimeEvent,
		data: Record<string, unknown>,
	): FeedEvent[];
};

export function createRunSessionProjection(args: {
	ensureRunArray: EnsureRun;
	makeEvent: FeedEventBuilder;
	closeRunIntoEvent: (
		runtimeEvent: RuntimeEvent,
		status: 'completed' | 'failed' | 'aborted',
	) => FeedEvent | null;
	runLifecycle: RunLifecycle;
	agentMessageStream: AgentMessageStream;
	rootPlan: RootPlanTracker;
	resolveToolActor: () => string;
	currentScope: () => MessageScope;
}): RunSessionProjection {
	const {
		ensureRunArray,
		makeEvent,
		closeRunIntoEvent,
		runLifecycle,
		agentMessageStream,
		rootPlan,
		resolveToolActor,
		currentScope,
	} = args;

	return {
		mapRunSessionEvent(event, data) {
			const results: FeedEvent[] = [];

			if (event.kind === 'session.start') {
				agentMessageStream.clearPending();
				const source = readString(data['source']) ?? 'startup';
				runLifecycle.setSession({
					session_id: event.sessionId,
					started_at: event.timestamp,
					source,
					agent_type: readString(data['agent_type']),
				});
				if (source === 'resume' || source === 'clear' || source === 'compact') {
					results.push(
						...ensureRunArray(event, source as 'resume' | 'clear' | 'compact'),
					);
				}
				results.push(
					makeEvent(
						'session.start',
						'info',
						'system',
						{
							source,
							agent_type: readString(data['agent_type']),
							model: readString(data['model']),
						} satisfies import('../types').SessionStartData,
						event,
					),
				);
				return results;
			}

			if (event.kind === 'session.end') {
				agentMessageStream.clearPending();
				const closeEvt = closeRunIntoEvent(event, 'completed');
				if (closeEvt) results.push(closeEvt);
				results.push(
					makeEvent(
						'session.end',
						'info',
						'system',
						{
							reason: readString(data['reason']) ?? 'unknown',
						} satisfies import('../types').SessionEndData,
						event,
					),
				);
				runLifecycle.endSession(event.timestamp);
				return results;
			}

			if (event.kind === 'user.prompt') {
				const prompt = readString(data['prompt']) ?? '';
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
								event.context.permissionMode ??
								readString(data['permission_mode']),
						} satisfies import('../types').UserPromptData,
						event,
					),
				);
				return results;
			}

			if (event.kind === 'turn.start') {
				agentMessageStream.clearPending();
				const prompt = readString(data['prompt']);
				results.push(
					...ensureRunArray(
						event,
						prompt ? 'user_prompt_submit' : 'other',
						prompt?.slice(0, 80),
					),
				);
				if (prompt) {
					results.push(
						makeEvent(
							'user.prompt',
							'info',
							'user',
							{
								prompt,
								cwd: event.context.cwd,
								permission_mode: event.context.permissionMode,
							} satisfies import('../types').UserPromptData,
							event,
						),
					);
				}
				return results;
			}

			if (event.kind === 'message.delta') {
				agentMessageStream.appendPendingDelta(
					readString(data['item_id']),
					readString(data['delta']) ?? '',
					resolveToolActor(),
					currentScope(),
				);
				return results;
			}

			if (event.kind === 'message.complete') {
				results.push(...ensureRunArray(event));
				const ev = agentMessageStream.emitCompleted({
					itemId: readString(data['item_id']),
					messageText: readString(data['message']),
					fallbackActorId: resolveToolActor(),
					fallbackScope: currentScope(),
					runtimeEvent: event,
				});
				if (ev) results.push(ev);
				return results;
			}

			if (event.kind === 'turn.complete') {
				if (!runLifecycle.getCurrentRun()) {
					agentMessageStream.clearPending();
					return results;
				}
				const stopEvt = makeEvent(
					'stop.request',
					'info',
					'agent:root',
					{
						stop_hook_active: false,
					} satisfies import('../types').StopRequestData,
					event,
				);
				results.push(stopEvt);
				const flushed = agentMessageStream.flushPending(event);
				for (const f of flushed) {
					f.cause = {
						...(f.cause ?? {}),
						parent_event_id: stopEvt.event_id,
					};
					results.push(f);
				}
				const closeEvt = closeRunIntoEvent(event, 'completed');
				if (closeEvt) results.push(closeEvt);
				return results;
			}

			if (event.kind === 'plan.delta') {
				const planSteps = data['plan'];
				if (Array.isArray(planSteps) && planSteps.length > 0) {
					const next = planSteps.map(
						(step: {step?: string; status?: string}) => ({
							content: typeof step.step === 'string' ? step.step : '',
							status: mapPlanStepStatus(step.status),
						}),
					);
					if (rootPlan.differs(next)) {
						rootPlan.set(next);
						results.push(
							makeEvent(
								'todo.update',
								'info',
								'system',
								{
									todo_id: 'plan',
									patch: {status: 'doing'},
								} satisfies import('../types').TodoUpdateData,
								event,
							),
						);
					}
				}
				results.push(
					makeEvent(
						'plan.update',
						'info',
						'system',
						{
							explanation: readString(data['explanation']) ?? null,
							delta: readString(data['delta']),
							item_id: readString(data['item_id']),
							thread_id: readString(data['thread_id']),
							turn_id: readString(data['turn_id']),
							plan: Array.isArray(planSteps)
								? (planSteps as Array<{step?: string; status?: string}>)
								: undefined,
						} satisfies import('../types').PlanUpdateData,
						event,
					),
				);
				return results;
			}

			if (event.kind === 'reasoning.delta') {
				if (
					readString(data['phase']) === 'summary' &&
					readString(data['delta'])
				) {
					const summaryIndex = (() => {
						const value = data['summary_index'] ?? data['content_index'];
						return typeof value === 'number' ? value : undefined;
					})();
					results.push(
						makeEvent(
							'reasoning.summary',
							'info',
							'agent:root',
							{
								message: agentMessageStream.appendReasoningSummary(
									readString(data['item_id']),
									summaryIndex,
									readString(data['delta']) ?? '',
								),
								item_id: readString(data['item_id']),
								content_index:
									typeof data['content_index'] === 'number'
										? (data['content_index'] as number)
										: undefined,
								summary_index:
									typeof data['summary_index'] === 'number'
										? (data['summary_index'] as number)
										: summaryIndex,
								thread_id: readString(data['thread_id']),
								turn_id: readString(data['turn_id']),
							} satisfies import('../types').ReasoningSummaryData,
							event,
						),
					);
				}
				return results;
			}

			if (event.kind === 'usage.update') {
				results.push(
					makeEvent(
						'usage.update',
						'info',
						'system',
						{
							thread_id: readString(data['thread_id']),
							turn_id: readString(data['turn_id']),
							usage:
								typeof data['usage'] === 'object' && data['usage'] !== null
									? (data[
											'usage'
										] as import('../../../shared/types/headerMetrics').TokenUsage)
									: undefined,
							delta:
								typeof data['delta'] === 'object' && data['delta'] !== null
									? (data[
											'delta'
										] as import('../../../shared/types/headerMetrics').TokenUsage)
									: undefined,
						} satisfies import('../types').UsageUpdateData,
						event,
					),
				);
			}

			return results;
		},
	};
}
