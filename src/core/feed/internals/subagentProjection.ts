import type {RuntimeEvent} from '../../runtime/types';
import type {ActorRegistry} from '../entities';
import type {FeedEvent} from '../types';
import type {RunLifecycle} from './runLifecycle';
import type {SubagentTracker} from './subagentTracker';
import {
	type EnsureRun,
	type FeedEventBuilder,
	readBoolean,
	readString,
} from './projection';

export type SubagentProjection = {
	mapSubagentEvent(
		event: RuntimeEvent,
		data: Record<string, unknown>,
	): FeedEvent[];
};

export function createSubagentProjection(args: {
	ensureRunArray: EnsureRun;
	makeEvent: FeedEventBuilder;
	runLifecycle: RunLifecycle;
	actors: ActorRegistry;
	subagents: SubagentTracker;
}): SubagentProjection {
	const {ensureRunArray, makeEvent, runLifecycle, actors, subagents} = args;

	return {
		mapSubagentEvent(event, data) {
			const results = ensureRunArray(event);
			const agentId = event.agentId ?? readString(data['agent_id']);
			const agentType = event.agentType ?? readString(data['agent_type']);

			if (event.kind === 'subagent.start') {
				if (agentId) {
					actors.ensureSubagent(agentId, agentType ?? 'unknown');
					const currentRun = runLifecycle.getCurrentRun();
					if (currentRun) currentRun.actors.subagent_ids.push(agentId);
					subagents.pushActor(`subagent:${agentId}`);
				}
				const description =
					subagents.consumePendingDescription() ?? readString(data['prompt']);
				results.push(
					makeEvent(
						'subagent.start',
						'info',
						'agent:root',
						{
							agent_id: agentId ?? '',
							agent_type: agentType ?? '',
							description: description ?? undefined,
							tool: readString(data['tool']),
							sender_thread_id: readString(data['sender_thread_id']),
							receiver_thread_id: readString(data['receiver_thread_id']),
							new_thread_id: readString(data['new_thread_id']),
							agent_status: readString(data['agent_status']),
						} satisfies import('../types').SubagentStartData,
						event,
					),
				);
				if (agentId && description)
					subagents.setDescription(agentId, description);
				return results;
			}

			if (agentId) subagents.popActor(`subagent:${agentId}`);
			results.push(
				makeEvent(
					'subagent.stop',
					'info',
					`subagent:${agentId ?? 'unknown'}`,
					{
						agent_id: agentId ?? '',
						agent_type: agentType ?? '',
						stop_hook_active: readBoolean(data['stop_hook_active']) ?? false,
						agent_transcript_path: readString(data['agent_transcript_path']),
						last_assistant_message: readString(data['last_assistant_message']),
						description: subagents.description(agentId ?? ''),
						tool: readString(data['tool']),
						status: readString(data['status']),
						sender_thread_id: readString(data['sender_thread_id']),
						receiver_thread_id: readString(data['receiver_thread_id']),
						new_thread_id: readString(data['new_thread_id']),
						agent_status: readString(data['agent_status']),
					} satisfies import('../types').SubagentStopData,
					event,
				),
			);
			return results;
		},
	};
}
