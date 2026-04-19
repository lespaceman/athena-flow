/**
 * Maps RuntimeDecision (UI semantic) → HookResultPayload (Claude wire protocol).
 *
 * This is the ONLY place that constructs Claude-specific JSON stdout shapes.
 * The controller expresses intent; this module translates to protocol.
 */

import {
	type HookOutput,
	type HookResultPayload,
	createAskUserQuestionResult,
	createPermissionRequestAllowResult,
	createPermissionRequestDenyResult,
	createPreToolUseAllowResult,
	createPreToolUseDenyResult,
	createStopBlockResult,
} from '../protocol/result';
import type {RuntimeEvent, RuntimeDecision} from '../../../core/runtime/types';

export function mapDecisionToResult(
	_event: RuntimeEvent,
	decision: RuntimeDecision,
): HookResultPayload {
	if (decision.type === 'passthrough') {
		return {action: 'passthrough'};
	}

	if (decision.type === 'block') {
		return {
			action: 'block_with_stderr',
			stderr: decision.reason ?? 'Blocked',
		};
	}

	if (!decision.intent) {
		return {
			action: 'json_output',
			stdout_json: decision.data as HookOutput,
		};
	}

	const {intent} = decision;

	switch (intent.kind) {
		case 'permission_allow':
			return createPermissionRequestAllowResult();
		case 'permission_deny':
			return createPermissionRequestDenyResult(intent.reason);
		case 'question_answer':
			return createAskUserQuestionResult(intent.answers);
		case 'pre_tool_allow':
			return createPreToolUseAllowResult();
		case 'pre_tool_deny':
			return createPreToolUseDenyResult(intent.reason);
		case 'stop_block':
			return createStopBlockResult(intent.reason);
		default:
			return {action: 'passthrough'};
	}
}
