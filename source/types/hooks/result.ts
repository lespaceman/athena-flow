/**
 * Hook result types and helper functions.
 *
 * These types define the actions that can be taken in response to hook events.
 */

/**
 * Action to take in response to a hook event.
 */
export type HookAction = 'passthrough' | 'block_with_stderr' | 'json_output';

/**
 * Payload for hook result.
 */
export type HookResultPayload = {
	action: HookAction;
	stderr?: string;
	stdout_json?: Record<string, unknown>;
};

/**
 * PreToolUse hook-specific output structure for deny decision.
 */
export type PreToolUseOutput = {
	hookSpecificOutput: {
		hookEventName: 'PreToolUse';
		permissionDecision: 'deny';
		permissionDecisionReason: string;
	};
};

/**
 * Helper to create a passthrough result.
 */
export function createPassthroughResult(): HookResultPayload {
	return {action: 'passthrough'};
}

/**
 * Helper to create a block result with stderr message.
 */
export function createBlockResult(reason: string): HookResultPayload {
	return {
		action: 'block_with_stderr',
		stderr: reason,
	};
}

/**
 * Helper to create a JSON output result.
 */
export function createJsonOutputResult(
	json: Record<string, unknown>,
): HookResultPayload {
	return {
		action: 'json_output',
		stdout_json: json,
	};
}

/**
 * Helper to create an allow result for PreToolUse hooks.
 * This explicitly tells Claude Code to skip its own permission prompt.
 */
export function createPreToolUseAllowResult(): HookResultPayload {
	return {
		action: 'json_output',
		stdout_json: {
			hookSpecificOutput: {
				hookEventName: 'PreToolUse',
				permissionDecision: 'allow',
			},
		},
	};
}

/**
 * Helper to create a deny result for PreToolUse hooks.
 */
export function createPreToolUseDenyResult(reason: string): HookResultPayload {
	return {
		action: 'json_output',
		stdout_json: {
			hookSpecificOutput: {
				hookEventName: 'PreToolUse',
				permissionDecision: 'deny',
				permissionDecisionReason: reason,
			},
		},
	};
}

/**
 * Helper to create an AskUserQuestion result for PreToolUse hooks.
 * Sends back the user's answers via updatedInput so Claude Code receives them.
 * Also includes additionalContext as a belt-and-suspenders approach.
 */
export function createAskUserQuestionResult(
	answers: Record<string, string>,
): HookResultPayload {
	const formatted = Object.entries(answers)
		.map(([q, a]) => `Q: ${q}\nA: ${a}`)
		.join('\n');
	return {
		action: 'json_output',
		stdout_json: {
			hookSpecificOutput: {
				hookEventName: 'PreToolUse',
				permissionDecision: 'allow',
				updatedInput: {
					answers,
				},
				additionalContext: `User answered via athena-cli:\n${formatted}`,
			},
		},
	};
}

/**
 * Helper to create an allow result for PermissionRequest hooks.
 * This tells Claude Code to allow the tool and skip its own permission dialog.
 */
export function createPermissionRequestAllowResult(
	updatedInput?: Record<string, unknown>,
): HookResultPayload {
	const decision: Record<string, unknown> = {behavior: 'allow'};
	if (updatedInput) decision.updatedInput = updatedInput;
	return {
		action: 'json_output',
		stdout_json: {
			hookSpecificOutput: {
				hookEventName: 'PermissionRequest',
				decision,
			},
		},
	};
}
