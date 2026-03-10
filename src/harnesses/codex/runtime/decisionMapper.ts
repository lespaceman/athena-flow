import type {RuntimeEvent, RuntimeDecision} from '../../../core/runtime/types';
import type {CodexApprovalDecision} from '../protocol/items';
import type {ReviewDecision} from '../protocol/generated/ReviewDecision';
import type {CodexToolRequestUserInputResponse} from '../protocol';
import * as M from '../protocol/methods';

const LEGACY_APPROVAL_METHODS = new Set([
	M.APPLY_PATCH_APPROVAL,
	M.EXEC_COMMAND_APPROVAL,
]);

/**
 * Maps a v2 approval decision string to its legacy ReviewDecision equivalent.
 *
 * The legacy `applyPatchApproval` and `execCommandApproval` methods use
 * ReviewDecision values ("approved" / "denied" / "abort") instead of the
 * v2 CommandExecutionApprovalDecision values ("accept" / "decline" / "cancel").
 */
function toLegacyDecision(v2: CodexApprovalDecision): {
	decision: ReviewDecision;
} {
	switch (v2) {
		case 'accept':
		case 'acceptForSession':
			return {decision: 'approved'};
		case 'decline':
			return {decision: 'denied'};
		case 'cancel':
			return {decision: 'abort'};
		default:
			return {decision: 'approved'};
	}
}

/**
 * Maps a RuntimeDecision to a Codex JSON-RPC approval response result object.
 * Returns the `result` field to send in the JSON-RPC response.
 */
export function mapDecisionToCodexResult(
	event: RuntimeEvent,
	decision: RuntimeDecision,
):
	| {decision: CodexApprovalDecision}
	| {decision: ReviewDecision}
	| CodexToolRequestUserInputResponse {
	if (event.hookName === M.TOOL_REQUEST_USER_INPUT) {
		if (decision.intent?.kind !== 'question_answer') {
			return {answers: {}};
		}

		return {
			answers: Object.fromEntries(
				Object.entries(decision.intent.answers).map(([id, answer]) => [
					id,
					{answers: [answer]},
				]),
			),
		};
	}

	const isLegacy = LEGACY_APPROVAL_METHODS.has(event.hookName);
	const v2Result = mapToV2Decision(decision);
	return isLegacy ? toLegacyDecision(v2Result.decision) : v2Result;
}

function mapToV2Decision(decision: RuntimeDecision): {
	decision: CodexApprovalDecision;
} {
	if (decision.type === 'passthrough') {
		return {decision: 'accept'};
	}

	if (decision.type === 'block') {
		return {decision: 'decline'};
	}

	// decision.type === 'json'
	if (!decision.intent) {
		return {decision: 'accept'};
	}

	switch (decision.intent.kind) {
		case 'permission_allow':
		case 'pre_tool_allow':
			return {decision: 'accept'};

		case 'permission_deny':
		case 'pre_tool_deny':
			return {decision: 'decline'};

		case 'question_answer':
			return {decision: 'accept'};

		case 'stop_block':
			return {decision: 'cancel'};

		default:
			return {decision: 'accept'};
	}
}
