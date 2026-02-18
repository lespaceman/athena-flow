// source/feed/entities.ts

export type Session = {
	session_id: string;
	started_at: number;
	ended_at?: number;
	source?: string;
	model?: string;
	agent_type?: string;
};

export type RunStatus =
	| 'running'
	| 'blocked'
	| 'completed'
	| 'failed'
	| 'aborted';

export type Run = {
	run_id: string;
	session_id: string;
	started_at: number;
	ended_at?: number;
	trigger: {
		type: 'user_prompt_submit' | 'resume' | 'other';
		request_id?: string;
		prompt_preview?: string;
	};
	status: RunStatus;
	actors: {root_agent_id: string; subagent_ids: string[]};
	counters: {
		tool_uses: number;
		tool_failures: number;
		permission_requests: number;
		blocks: number;
	};
};

export type ActorKind = 'user' | 'agent' | 'subagent' | 'system';

export type Actor = {
	actor_id: string;
	kind: ActorKind;
	display_name: string;
	agent_type?: string;
	parent_actor_id?: string;
};

/** Mutable actor registry — used internally by the mapper. */
export class ActorRegistry {
	private actors = new Map<string, Actor>();

	constructor() {
		// Pre-register well-known actors
		this.actors.set('user', {
			actor_id: 'user',
			kind: 'user',
			display_name: 'You',
		});
		this.actors.set('agent:root', {
			actor_id: 'agent:root',
			kind: 'agent',
			display_name: 'Claude',
		});
		this.actors.set('system', {
			actor_id: 'system',
			kind: 'system',
			display_name: 'System',
		});
	}

	get(id: string): Actor | undefined {
		return this.actors.get(id);
	}

	register(actor: Actor): void {
		this.actors.set(actor.actor_id, actor);
	}

	ensureSubagent(agentId: string, agentType: string): Actor {
		const actorId = `subagent:${agentId}`;
		let actor = this.actors.get(actorId);
		if (!actor) {
			actor = {
				actor_id: actorId,
				kind: 'subagent',
				display_name: agentType || agentId,
				agent_type: agentType,
				parent_actor_id: 'agent:root',
			};
			this.actors.set(actorId, actor);
		}
		return actor;
	}

	all(): Actor[] {
		return Array.from(this.actors.values());
	}
}
