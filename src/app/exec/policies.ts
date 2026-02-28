import type {RuntimeDecision, RuntimeEvent} from '../../core/runtime/types';
import type {ExecPermissionPolicy, ExecQuestionPolicy} from './types';

export type PolicyResolution =
	| {action: 'respond'; decision: RuntimeDecision}
	| {action: 'fail'; reason: string};

function resolveToolName(event: RuntimeEvent): string | undefined {
	const fromData = (event.data as {tool_name?: unknown}).tool_name;
	const toolName = event.toolName ?? fromData;
	return typeof toolName === 'string' && toolName.length > 0
		? toolName
		: undefined;
}

export function resolvePermissionPolicy(
	policy: ExecPermissionPolicy,
	event: RuntimeEvent,
): PolicyResolution {
	if (policy === 'allow') {
		return {
			action: 'respond',
			decision: {
				type: 'json',
				source: 'rule',
				intent: {kind: 'permission_allow'},
			},
		};
	}

	if (policy === 'deny') {
		return {
			action: 'respond',
			decision: {
				type: 'json',
				source: 'rule',
				intent: {
					kind: 'permission_deny',
					reason: 'Denied by non-interactive policy --on-permission=deny',
				},
			},
		};
	}

	const toolName = resolveToolName(event) ?? 'unknown';
	return {
		action: 'fail',
		reason: `Permission request for "${toolName}" requires input (set --on-permission=allow or --on-permission=deny).`,
	};
}

export function resolveQuestionPolicy(
	policy: ExecQuestionPolicy,
): PolicyResolution {
	if (policy === 'empty') {
		return {
			action: 'respond',
			decision: {
				type: 'json',
				source: 'rule',
				intent: {kind: 'question_answer', answers: {}},
			},
		};
	}

	return {
		action: 'fail',
		reason:
			'AskUserQuestion interaction requires input (set --on-question=empty).',
	};
}

export function isAskUserQuestionEvent(event: RuntimeEvent): boolean {
	return (
		event.kind === 'tool.pre' && resolveToolName(event) === 'AskUserQuestion'
	);
}
