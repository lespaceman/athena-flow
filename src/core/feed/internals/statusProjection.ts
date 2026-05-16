import type {RuntimeEvent} from '../../runtime/types';
import type {FeedEvent} from '../types';
import {type EnsureRun, type FeedEventBuilder, readString} from './projection';

export type StatusProjection = {
	mapStatusEvent(
		event: RuntimeEvent,
		data: Record<string, unknown>,
	): FeedEvent[];
};

export function createStatusProjection(args: {
	ensureRunArray: EnsureRun;
	makeEvent: FeedEventBuilder;
}): StatusProjection {
	const {ensureRunArray, makeEvent} = args;

	return {
		mapStatusEvent(event, data) {
			const results = ensureRunArray(event);

			if (event.kind === 'teammate.idle') {
				const idleEvt = makeEvent(
					'teammate.idle',
					'info',
					'system',
					{
						teammate_name: readString(data['teammate_name']) ?? '',
						team_name: readString(data['team_name']) ?? '',
					} satisfies import('../types').TeammateIdleData,
					event,
				);
				idleEvt.ui = {collapsed_default: true};
				results.push(idleEvt);
				return results;
			}

			if (event.kind === 'task.created') {
				results.push(
					makeEvent(
						'task.created',
						'info',
						'system',
						{
							task_id: readString(data['task_id']) ?? '',
							task_subject: readString(data['task_subject']) ?? '',
							task_description: readString(data['task_description']),
							teammate_name: readString(data['teammate_name']),
							team_name: readString(data['team_name']),
						} satisfies import('../types').TaskCreatedData,
						event,
					),
				);
				return results;
			}

			if (event.kind === 'task.completed') {
				results.push(
					makeEvent(
						'task.completed',
						'info',
						'system',
						{
							task_id: readString(data['task_id']) ?? '',
							task_subject: readString(data['task_subject']) ?? '',
							task_description: readString(data['task_description']),
							teammate_name: readString(data['teammate_name']),
							team_name: readString(data['team_name']),
						} satisfies import('../types').TaskCompletedData,
						event,
					),
				);
			}

			return results;
		},
	};
}
