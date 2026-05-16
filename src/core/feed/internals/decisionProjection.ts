import type {RuntimeDecision, RuntimeEvent} from '../../runtime/types';
import type {FeedEvent, FeedEventKind} from '../types';
import {generateTitle} from '../titleGen';
import type {DecisionCorrelation} from './decisionCorrelation';
import type {RunLifecycle} from './runLifecycle';
import {
	type EnsureRun,
	type FeedEventBuilder,
	readBoolean,
	readObject,
	readString,
	readSuggestionArray,
} from './projection';
import {resolveToolUseId} from './toolProjection';

export type DecisionProjection = {
	mapRequestEvent(
		event: RuntimeEvent,
		data: Record<string, unknown>,
	): FeedEvent[];
	mapDecision(requestId: string, decision: RuntimeDecision): FeedEvent | null;
};

export function createDecisionProjection(args: {
	ensureRunArray: EnsureRun;
	makeEvent: FeedEventBuilder;
	runLifecycle: RunLifecycle;
	decisionCorrelation: DecisionCorrelation;
}): DecisionProjection {
	const {ensureRunArray, makeEvent, runLifecycle, decisionCorrelation} = args;

	function makeDecisionEvent(
		requestId: string,
		parentEventId: string,
		decision: RuntimeDecision,
		kind: FeedEventKind,
		data: unknown,
	): FeedEvent {
		const s = runLifecycle.allocateSeq();
		const runId = runLifecycle.getRunId();
		const session = runLifecycle.getSession();
		const fe = {
			event_id: `${runId}:E${s}`,
			seq: s,
			ts: Date.now(),
			session_id: session?.session_id ?? 'unknown',
			run_id: runId,
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

	return {
		mapRequestEvent(event, data) {
			const results = ensureRunArray(event);

			if (event.kind === 'permission.request') {
				runLifecycle.incrementCounter('permission_requests');
				const networkContext = readObject(data['network_context']);
				results.push(
					makeEvent(
						'permission.request',
						'info',
						'system',
						{
							tool_name:
								event.toolName ?? readString(data['tool_name']) ?? 'Unknown',
							tool_input: readObject(data['tool_input']),
							tool_use_id: resolveToolUseId(event, data),
							permission_suggestions: readSuggestionArray(
								data['permission_suggestions'],
							),
							network_context:
								Object.keys(networkContext).length > 0
									? {
											host: readString(networkContext['host']),
											protocol: readString(networkContext['protocol']),
										}
									: undefined,
						} satisfies import('../types').PermissionRequestData,
						event,
					),
				);
				return results;
			}

			if (event.kind === 'stop.request') {
				results.push(
					makeEvent(
						'stop.request',
						'info',
						'agent:root',
						{
							stop_hook_active: readBoolean(data['stop_hook_active']) ?? false,
							last_assistant_message: readString(
								data['last_assistant_message'],
							),
						} satisfies import('../types').StopRequestData,
						event,
					),
				);
				return results;
			}

			if (event.kind === 'stop.failure') {
				results.push(
					makeEvent(
						'stop.failure',
						'error',
						'system',
						{
							error_type: readString(data['error_type']) ?? 'unknown',
							error_message: readString(data['error_message']),
						} satisfies import('../types').StopFailureData,
						event,
					),
				);
				return results;
			}

			if (event.kind === 'permission.denied') {
				results.push(
					makeEvent(
						'permission.denied',
						'warn',
						'system',
						{
							tool_name:
								event.toolName ?? readString(data['tool_name']) ?? 'Unknown',
							tool_input: readObject(data['tool_input']),
							tool_use_id: readString(data['tool_use_id']),
							reason: readString(data['reason']),
						} satisfies import('../types').PermissionDeniedData,
						event,
					),
				);
				return results;
			}

			if (event.kind === 'elicitation.request') {
				results.push(
					makeEvent(
						'elicitation.request',
						'warn',
						'system',
						{
							mcp_server: readString(data['mcp_server']) ?? 'unknown',
							form: data['form'],
						} satisfies import('../types').ElicitationRequestData,
						event,
					),
				);
				return results;
			}

			if (event.kind === 'elicitation.result') {
				const action = readString(data['action']);
				const evt = makeEvent(
					'elicitation.result',
					'info',
					'system',
					{
						mcp_server: readString(data['mcp_server']) ?? 'unknown',
						...(action ? {action} : {}),
						content: readObject(data['content']),
					} satisfies import('../types').ElicitationResultData,
					event,
				);
				evt.ui = {collapsed_default: true};
				results.push(evt);
			}

			return results;
		},

		mapDecision(requestId, decision) {
			const consumed = decisionCorrelation.consumeForDecision(requestId);
			if (!consumed) return null;
			const {parentEventId, originalKind} = consumed;

			if (originalKind === 'permission.request') {
				let data: import('../types').PermissionDecisionData;

				if (decision.source === 'timeout') {
					data = {decision_type: 'no_opinion', reason: 'timeout'};
				} else if (decision.type === 'passthrough') {
					data = {decision_type: 'no_opinion', reason: decision.source};
				} else if (decision.intent?.kind === 'permission_allow') {
					data = {decision_type: 'allow'};
				} else if (decision.intent?.kind === 'permission_deny') {
					data = {
						decision_type: 'deny',
						message: decision.intent.reason,
					};
				} else {
					data = {decision_type: 'no_opinion', reason: 'unknown'};
				}

				return makeDecisionEvent(
					requestId,
					parentEventId,
					decision,
					'permission.decision',
					data,
				);
			}

			if (originalKind === 'stop.request') {
				let data: import('../types').StopDecisionData;
				const d = decision.data as Record<string, unknown> | undefined;
				const decisionReason =
					typeof d?.reason === 'string' ? d.reason : undefined;

				if (decision.source === 'timeout') {
					data = {decision_type: 'no_opinion', reason: 'timeout'};
				} else if (decision.type === 'passthrough') {
					data = {decision_type: 'no_opinion', reason: decision.source};
				} else if (d?.decision === 'block') {
					data = {
						decision_type: 'block',
						reason: decisionReason ?? decision.reason ?? 'Blocked',
					};
				} else if (d?.ok === false) {
					data = {
						decision_type: 'block',
						reason: decisionReason ?? 'Blocked by hook',
					};
				} else {
					data = {decision_type: 'allow'};
				}

				return makeDecisionEvent(
					requestId,
					parentEventId,
					decision,
					'stop.decision',
					data,
				);
			}

			return null;
		},
	};
}
