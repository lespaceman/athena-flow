// source/feed/titleGen.ts
import type {FeedEvent} from './types.js';

const MAX_TITLE_LEN = 80;

function truncate(s: string, max = MAX_TITLE_LEN): string {
	return s.length <= max ? s : s.slice(0, max - 1) + '…';
}

export function generateTitle(event: FeedEvent): string {
	switch (event.kind) {
		case 'session.start':
			return `Session started (${event.data.source})`;
		case 'session.end':
			return `Session ended (${event.data.reason})`;
		case 'run.start':
			return event.data.trigger.prompt_preview
				? truncate(`Run: ${event.data.trigger.prompt_preview}`)
				: 'Run started';
		case 'run.end':
			return `Run ${event.data.status}`;
		case 'user.prompt':
			return truncate(event.data.prompt);
		case 'tool.pre':
			return `● ${event.data.tool_name}`;
		case 'tool.post':
			return `⎿ ${event.data.tool_name} result`;
		case 'tool.failure':
			return truncate(`✗ ${event.data.tool_name} failed: ${event.data.error}`);
		case 'permission.request':
			return `⚠ Permission: ${event.data.tool_name}`;
		case 'permission.decision':
			switch (event.data.decision_type) {
				case 'allow':
					return '✓ Allowed';
				case 'deny':
					return `✗ Denied: ${event.data.message}`;
				case 'no_opinion':
					return `⏳ No opinion: ${event.data.reason ?? 'timeout'}`;
				case 'ask':
					return '? Ask';
			}
			break;
		case 'stop.request':
			return '⛔ Stop requested';
		case 'stop.decision':
			switch (event.data.decision_type) {
				case 'block':
					return `⛔ Blocked: ${event.data.reason}`;
				case 'allow':
					return '✓ Stop allowed';
				case 'no_opinion':
					return '⏳ Stop: no opinion';
			}
			break;
		case 'subagent.start':
			return `⚡ Subagent: ${event.data.agent_type}`;
		case 'subagent.stop':
			return `⏹ Subagent done: ${event.data.agent_type}`;
		case 'notification':
			return truncate(event.data.message);
		case 'compact.pre':
			return `Compacting context (${event.data.trigger})`;
		case 'setup':
			return `Setup (${event.data.trigger})`;
		case 'teammate.idle':
			return `⏸ Teammate idle: ${event.data.teammate_name}`;
		case 'task.completed':
			return truncate(`✅ Task completed: ${event.data.task_subject}`);
		case 'config.change':
			return `⚙ Config changed: ${event.data.source}`;
		case 'unknown.hook':
			return `? ${event.data.hook_event_name}`;
		case 'todo.add':
			return truncate(`📋 Todo: ${event.data.text}`);
		case 'todo.update':
			return `📋 Todo updated: ${event.data.todo_id}`;
		case 'todo.done':
			return `✅ Todo done: ${event.data.todo_id}`;
		case 'agent.message':
			return event.data.scope === 'subagent'
				? truncate('💬 Subagent response')
				: truncate('💬 Agent response');
	}
	return 'Unknown event';
}
