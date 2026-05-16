import type {RuntimeEvent} from '../../runtime/types';
import type {RuntimeEventDataMap} from '../../runtime/events';
import type {FeedEvent} from '../types';
import type {DecisionCorrelation} from './decisionCorrelation';
import {
	type EnsureRun,
	type FeedEventBuilder,
	readBoolean,
	readObject,
	readString,
} from './projection';

type NotificationData = RuntimeEventDataMap['notification'] &
	Record<string, unknown>;
type NotificationRouteCtx = {
	notificationType: string;
	message: string;
	title: string | undefined;
};
type NotificationRoute = (
	data: NotificationData,
	runtimeEvent: RuntimeEvent,
	ctx: NotificationRouteCtx,
) => FeedEvent[];

export type NotificationProjection = {
	mapNotification(
		event: RuntimeEvent,
		data: Record<string, unknown>,
	): FeedEvent[];
};

export function createNotificationProjection(args: {
	ensureRunArray: EnsureRun;
	makeEvent: FeedEventBuilder;
	decisionCorrelation: DecisionCorrelation;
}): NotificationProjection {
	const {ensureRunArray, makeEvent, decisionCorrelation} = args;

	const reviewRoute: NotificationRoute = (data, runtimeEvent, ctx) => {
		const item = readObject(data['item']);
		return [
			makeEvent(
				'review.status',
				'info',
				'system',
				{
					message: ctx.message,
					phase: ctx.notificationType.endsWith('.completed')
						? 'completed'
						: 'started',
					review: readString(item['review']),
					item_id: readString(data['item_id']),
				} satisfies import('../types').ReviewStatusData,
				runtimeEvent,
			),
		];
	};

	const imageViewRoute: NotificationRoute = (data, runtimeEvent, ctx) => {
		const item = readObject(data['item']);
		return [
			makeEvent(
				'image.view',
				'info',
				'system',
				{
					message: ctx.message,
					path: readString(item['path']),
					item_id: readString(data['item_id']),
				} satisfies import('../types').ImageViewData,
				runtimeEvent,
			),
		];
	};

	const contextCompactionRoute: NotificationRoute = (
		data,
		runtimeEvent,
		ctx,
	) => [
		makeEvent(
			'context.compaction',
			'info',
			'system',
			{
				message: ctx.message,
				phase: ctx.notificationType.endsWith('.completed')
					? 'completed'
					: 'started',
				item_id: readString(data['item_id']),
			} satisfies import('../types').ContextCompactionData,
			runtimeEvent,
		),
	];

	const routes: Record<string, NotificationRoute> = {
		'codex.error': (data, runtimeEvent, ctx) => [
			makeEvent(
				'runtime.error',
				'error',
				'system',
				{
					message: ctx.message,
					title: ctx.title,
					thread_id: readString(data['thread_id']),
					turn_id: readString(data['turn_id']),
					error_code: readString(data['error_code']),
					will_retry: readBoolean(data['will_retry']),
				} satisfies import('../types').RuntimeErrorData,
				runtimeEvent,
			),
		],
		'thread.status_changed': (data, runtimeEvent, ctx) => [
			makeEvent(
				'thread.status',
				'info',
				'system',
				{
					message: ctx.message,
					thread_id: readString(data['thread_id']),
					status_type: readString(data['status_type']),
					active_flags: Array.isArray(data['active_flags'])
						? (data['active_flags'] as string[])
						: undefined,
				} satisfies import('../types').ThreadStatusData,
				runtimeEvent,
			),
		],
		'turn.diff_updated': (data, runtimeEvent, ctx) => [
			makeEvent(
				'turn.diff',
				'info',
				'system',
				{
					message: ctx.message,
					thread_id: readString(data['thread_id']),
					turn_id: readString(data['turn_id']),
					diff: readString(data['diff']) ?? '',
				} satisfies import('../types').TurnDiffData,
				runtimeEvent,
			),
		],
		'server_request.resolved': (data, runtimeEvent, ctx) => {
			const requestId =
				data['request_id'] !== undefined
					? String(data['request_id'])
					: undefined;
			const resolved = requestId
				? decisionCorrelation.lookupResolved(requestId)
				: null;
			return [
				makeEvent(
					'server.request.resolved',
					'info',
					'system',
					{
						message: ctx.message,
						request_id: requestId,
						resolved_kind: resolved?.kind,
					} satisfies import('../types').ServerRequestResolvedData,
					runtimeEvent,
					resolved ? {parent_event_id: resolved.event_id} : undefined,
				),
			];
		},
		'item.enteredReviewMode.started': reviewRoute,
		'item.enteredReviewMode.completed': reviewRoute,
		'item.exitedReviewMode.started': reviewRoute,
		'item.exitedReviewMode.completed': reviewRoute,
		'item.imageView.started': imageViewRoute,
		'item.imageView.completed': imageViewRoute,
		'item.contextCompaction.started': contextCompactionRoute,
		'item.contextCompaction.completed': contextCompactionRoute,
		'mcp_tool_call.progress': (_data, runtimeEvent, ctx) => [
			makeEvent(
				'mcp.progress',
				'info',
				'system',
				{
					message: ctx.message,
					title: ctx.title,
				} satisfies import('../types').McpProgressData,
				runtimeEvent,
			),
		],
		'command_execution.terminal_interaction': (_data, runtimeEvent, ctx) => [
			makeEvent(
				'terminal.input',
				'info',
				'system',
				{
					message: ctx.message,
					input_preview: ctx.message,
				} satisfies import('../types').TerminalInputData,
				runtimeEvent,
			),
		],
		'skills.changed': (_data, runtimeEvent, ctx) => [
			makeEvent(
				'skills.changed',
				'info',
				'system',
				{
					message: ctx.message,
				} satisfies import('../types').SkillsChangedData,
				runtimeEvent,
			),
		],
		'skills.loaded': (_data, runtimeEvent, ctx) => {
			const payload =
				typeof runtimeEvent.payload === 'object' &&
				runtimeEvent.payload !== null
					? (runtimeEvent.payload as Record<string, unknown>)
					: null;
			return [
				makeEvent(
					'skills.loaded',
					'info',
					'system',
					{
						message: ctx.message,
						count:
							typeof payload?.['count'] === 'number'
								? (payload['count'] as number)
								: undefined,
						error_count:
							typeof payload?.['error_count'] === 'number'
								? (payload['error_count'] as number)
								: undefined,
					} satisfies import('../types').SkillsLoadedData,
					runtimeEvent,
				),
			];
		},
	};

	return {
		mapNotification(event, data) {
			const results = ensureRunArray(event);
			const notificationType = readString(data['notification_type']);
			const message = readString(data['message']) ?? '';
			const title = readString(data['title']);
			const route = notificationType ? routes[notificationType] : undefined;
			if (route && notificationType) {
				results.push(
					...route(data as NotificationData, event, {
						notificationType,
						message,
						title,
					}),
				);
				return results;
			}
			results.push(
				makeEvent(
					'notification',
					'info',
					'system',
					{
						message,
						title,
						notification_type: notificationType,
					} satisfies import('../types').NotificationData,
					event,
				),
			);
			return results;
		},
	};
}
