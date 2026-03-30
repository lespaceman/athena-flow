import type {RuntimeEvent, RuntimeDecision} from '../../../core/runtime/types';
import type {
	CodexMcpServerElicitationRequestResponse,
	CodexPermissionGrantScope,
	CodexPermissionsRequestApprovalResponse,
	CodexRequestPermissionProfile,
} from '../protocol';
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
	| CodexMcpServerElicitationRequestResponse
	| CodexPermissionsRequestApprovalResponse
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

	if (event.hookName === M.PERMISSIONS_REQUEST_APPROVAL) {
		return mapPermissionsApprovalResponse(event, decision);
	}

	if (event.hookName === M.MCP_SERVER_ELICITATION_REQUEST) {
		return mapMcpElicitationResponse(decision, event.payload);
	}

	const isLegacy = LEGACY_APPROVAL_METHODS.has(event.hookName);
	const v2Result = mapToV2Decision(decision);
	return isLegacy ? toLegacyDecision(v2Result.decision) : v2Result;
}

function mapMcpElicitationResponse(
	decision: RuntimeDecision,
	payload: unknown,
): CodexMcpServerElicitationRequestResponse {
	const v2Result = mapToV2Decision(decision);
	if (v2Result.decision === 'decline') {
		return {action: 'decline', content: null, _meta: null};
	}
	if (v2Result.decision === 'cancel') {
		return {action: 'cancel', content: null, _meta: null};
	}

	const record =
		typeof payload === 'object' && payload !== null
			? (payload as Record<string, unknown>)
			: {};
	return {
		action: 'accept',
		content: record['mode'] === 'form' ? {} : null,
		_meta: null,
	};
}

function mapPermissionsApprovalResponse(
	event: RuntimeEvent,
	decision: RuntimeDecision,
): CodexPermissionsRequestApprovalResponse {
	const eventData = event.data as Record<string, unknown>;
	const toolInput =
		typeof eventData['tool_input'] === 'object' &&
		eventData['tool_input'] !== null
			? (eventData['tool_input'] as Record<string, unknown>)
			: {};
	const requestedPermissions = toolInput['permissions'] as
		| CodexRequestPermissionProfile
		| null
		| undefined;
	const scope = resolvePermissionScope(decision);

	if (
		decision.type === 'block' ||
		decision.intent?.kind === 'permission_deny' ||
		decision.intent?.kind === 'pre_tool_deny' ||
		decision.intent?.kind === 'stop_block'
	) {
		return {permissions: {}, scope: 'turn'};
	}

	if (!requestedPermissions) {
		return {permissions: {}, scope};
	}

	return {
		permissions: {
			...(requestedPermissions.network != null
				? {network: requestedPermissions.network}
				: {}),
			...(requestedPermissions.fileSystem != null
				? {fileSystem: requestedPermissions.fileSystem}
				: {}),
		},
		scope,
	};
}

function resolvePermissionScope(
	decision: RuntimeDecision,
): CodexPermissionGrantScope {
	const rawScope =
		typeof decision.data === 'object' &&
		decision.data !== null &&
		'scope' in decision.data
			? (decision.data as {scope?: unknown}).scope
			: undefined;
	return rawScope === 'session' ? 'session' : 'turn';
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
