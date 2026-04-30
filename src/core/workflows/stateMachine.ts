import type {AthenaHarness} from '../../infra/plugins/config';
import protocolBody from './stateMachine.md';

/**
 * Shared stateless session protocol.
 *
 * The agent-facing prose lives in `stateMachine.md` (single source of truth,
 * easy to diff). This module wraps it with harness-specific task-tool
 * instructions via the `{{TASK_TOOL_INSTRUCTIONS}}` placeholder.
 *
 * The marketplace mirrors this protocol at `shared/state-machine.md`; keep
 * them in sync.
 */

function buildTaskToolInstructions(harness: AthenaHarness): string {
	switch (harness) {
		case 'openai-codex':
			return `Use the \`update_plan\` tool to create and maintain the task list shown to the user for the full harness session.

- As soon as orientation yields a credible plan, create a detailed task list from the tracker; each item should be a concrete, verifiable unit of work, not a vague phase
- At the start of every fresh harness session, recreate the full task list from the tracker before resuming execution
- Do not carry forward prior session task IDs or assume prior session plan items still exist in the tool
- Keep the task list accurate throughout the session: when scope, ordering, status, or completion changes, update \`update_plan\` immediately in the same working phase as the tracker
- Keep task state consistent and non-stale: reconcile the task list against the tracker before moving on, and before ending the session
- Maintain exactly one \`in_progress\` task unless the tracker explicitly records parallel active work`;
		case 'claude-code':
		case 'opencode':
		default:
			return `Use \`TaskCreate\` and \`TaskUpdate\` to create and maintain the task list shown to the user for the full harness session.

- As soon as orientation yields a credible plan, create a detailed task list from the tracker; each item should be a concrete, verifiable unit of work, not a vague phase
- At the start of every fresh harness session, recreate the full task list from the tracker instead of trying to resume prior session task IDs
- Do not refer to task IDs created in earlier sessions; they are session-scoped UI artifacts, not durable workflow state
- Keep the task list accurate throughout the session: when scope, ordering, status, or completion changes, update the task list in the same working phase as the tracker
- Keep task state consistent and non-stale: reconcile the task list against the tracker before moving on, and before ending the session
- Maintain exactly one active task unless the tracker explicitly records parallel active work`;
	}
}

export function buildStateMachineContent(
	harness: AthenaHarness = 'claude-code',
): string {
	return protocolBody.replace(
		'{{TASK_TOOL_INSTRUCTIONS}}',
		buildTaskToolInstructions(harness),
	);
}

export const STATE_MACHINE_CONTENT = buildStateMachineContent();
