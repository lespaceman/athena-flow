/**
 * Hook result types and helper functions.
 *
 * These types define the actions that can be taken in response to hook events
 * and mirror the documented Claude Code hook output schema.
 */

import type {ElicitationAction} from './events';

/**
 * Action to take in response to a hook event.
 */
export type HookAction = 'passthrough' | 'block_with_stderr' | 'json_output';

/**
 * Universal output fields supported on every hook response.
 * See https://code.claude.com/docs/en/hooks.md#common-output-schema.
 */
export type UniversalOutputFields = {
	continue?: boolean;
	stopReason?: string;
	suppressOutput?: boolean;
	systemMessage?: string;
};

export type PreToolUsePermissionDecision = 'allow' | 'deny' | 'ask' | 'defer';

export type PreToolUseOutput = UniversalOutputFields & {
	hookSpecificOutput: {
		hookEventName: 'PreToolUse';
		permissionDecision?: PreToolUsePermissionDecision;
		permissionDecisionReason?: string;
		updatedInput?: Record<string, unknown>;
		additionalContext?: string;
	};
};

export type PostToolUseOutput = UniversalOutputFields & {
	decision?: 'block';
	reason?: string;
	hookSpecificOutput?: {
		hookEventName: 'PostToolUse';
		additionalContext?: string;
		updatedMCPToolOutput?: unknown;
	};
};

export type PostToolUseFailureOutput = UniversalOutputFields & {
	hookSpecificOutput?: {
		hookEventName: 'PostToolUseFailure';
		additionalContext?: string;
	};
};

export type PermissionRequestDecisionBehavior = 'allow' | 'deny';

export type PermissionRequestOutput = UniversalOutputFields & {
	hookSpecificOutput: {
		hookEventName: 'PermissionRequest';
		decision: {
			behavior: PermissionRequestDecisionBehavior;
			updatedInput?: Record<string, unknown>;
			updatedPermissions?: unknown[];
			message?: string;
			reason?: string;
		};
	};
};

export type PermissionDeniedOutput = UniversalOutputFields & {
	hookSpecificOutput?: {
		hookEventName: 'PermissionDenied';
		retry?: boolean;
	};
};

export type UserPromptSubmitOutput = UniversalOutputFields & {
	decision?: 'block';
	reason?: string;
	hookSpecificOutput?: {
		hookEventName: 'UserPromptSubmit';
		additionalContext?: string;
		sessionTitle?: string;
	};
};

export type SessionStartOutput = UniversalOutputFields & {
	hookSpecificOutput?: {
		hookEventName: 'SessionStart';
		additionalContext?: string;
	};
};

export type StopOutput = UniversalOutputFields & {
	decision?: 'block';
	reason?: string;
};

export type SubagentStopOutput = StopOutput;

export type NotificationOutput = UniversalOutputFields & {
	hookSpecificOutput?: {
		hookEventName: 'Notification';
		additionalContext?: string;
	};
};

export type SubagentStartOutput = UniversalOutputFields & {
	hookSpecificOutput?: {
		hookEventName: 'SubagentStart';
		additionalContext?: string;
	};
};

export type PreCompactOutput = UniversalOutputFields & {
	decision?: 'block';
	reason?: string;
};

export type PostCompactOutput = UniversalOutputFields;

export type ConfigChangeOutput = UniversalOutputFields & {
	decision?: 'block';
	reason?: string;
};

export type CwdChangedOutput = UniversalOutputFields;

export type FileChangedOutput = UniversalOutputFields;

export type WorktreeCreateOutput = UniversalOutputFields & {
	hookSpecificOutput?: {
		hookEventName: 'WorktreeCreate';
		worktreePath?: string;
	};
};

export type TaskCreatedOutput = UniversalOutputFields & {
	decision?: 'block';
	reason?: string;
};

export type TaskCompletedOutput = TaskCreatedOutput;

export type TeammateIdleOutput = UniversalOutputFields & {
	decision?: 'block';
	reason?: string;
};

export type ElicitationOutput = UniversalOutputFields & {
	hookSpecificOutput: {
		hookEventName: 'Elicitation';
		action: ElicitationAction;
		content?: Record<string, unknown>;
	};
};

export type ElicitationResultOutput = UniversalOutputFields & {
	hookSpecificOutput: {
		hookEventName: 'ElicitationResult';
		action: ElicitationAction;
		content?: Record<string, unknown>;
	};
};

/**
 * Discriminated union of all per-event hook output shapes.
 * A `UniversalOutputFields`-only response is also valid (events with no
 * hook-specific output).
 */
export type HookOutput =
	| UniversalOutputFields
	| PreToolUseOutput
	| PostToolUseOutput
	| PostToolUseFailureOutput
	| PermissionRequestOutput
	| PermissionDeniedOutput
	| UserPromptSubmitOutput
	| SessionStartOutput
	| StopOutput
	| NotificationOutput
	| SubagentStartOutput
	| PreCompactOutput
	| PostCompactOutput
	| ConfigChangeOutput
	| CwdChangedOutput
	| FileChangedOutput
	| WorktreeCreateOutput
	| TaskCreatedOutput
	| TaskCompletedOutput
	| TeammateIdleOutput
	| ElicitationOutput
	| ElicitationResultOutput;

export type HookResultPayload = {
	action: HookAction;
	stderr?: string;
	stdout_json?: HookOutput;
};

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
		} satisfies PreToolUseOutput,
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
		} satisfies PreToolUseOutput,
	};
}

/**
 * Helper to create an "ask user" result for PreToolUse hooks.
 * Surfaces Claude Code's permission UI.
 */
export function createPreToolUseAskResult(reason?: string): HookResultPayload {
	return {
		action: 'json_output',
		stdout_json: {
			hookSpecificOutput: {
				hookEventName: 'PreToolUse',
				permissionDecision: 'ask',
				...(reason ? {permissionDecisionReason: reason} : {}),
			},
		} satisfies PreToolUseOutput,
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
		} satisfies PreToolUseOutput,
	};
}

/**
 * Helper to create an allow result for PermissionRequest hooks.
 * This tells Claude Code to allow the tool and skip its own permission dialog.
 */
export function createPermissionRequestAllowResult(
	updatedInput?: Record<string, unknown>,
): HookResultPayload {
	const decision: PermissionRequestOutput['hookSpecificOutput']['decision'] = {
		behavior: 'allow',
	};
	if (updatedInput) decision.updatedInput = updatedInput;
	return {
		action: 'json_output',
		stdout_json: {
			hookSpecificOutput: {
				hookEventName: 'PermissionRequest',
				decision,
			},
		} satisfies PermissionRequestOutput,
	};
}

/**
 * Helper to create a deny result for PermissionRequest hooks.
 * This tells Claude Code to deny the tool and show the denial reason.
 */
export function createPermissionRequestDenyResult(
	reason: string,
): HookResultPayload {
	return {
		action: 'json_output',
		stdout_json: {
			hookSpecificOutput: {
				hookEventName: 'PermissionRequest',
				decision: {behavior: 'deny', reason},
			},
		} satisfies PermissionRequestOutput,
	};
}

/**
 * Helper for Elicitation responses (MCP-initiated form prompts).
 */
export function createElicitationResult(
	action: ElicitationAction,
	content?: Record<string, unknown>,
): HookResultPayload {
	return {
		action: 'json_output',
		stdout_json: {
			hookSpecificOutput: {
				hookEventName: 'Elicitation',
				action,
				...(content ? {content} : {}),
			},
		} satisfies ElicitationOutput,
	};
}

/**
 * Helper for WorktreeCreate responses.
 */
export function createWorktreeCreateResult(
	worktreePath: string,
): HookResultPayload {
	return {
		action: 'json_output',
		stdout_json: {
			hookSpecificOutput: {
				hookEventName: 'WorktreeCreate',
				worktreePath,
			},
		} satisfies WorktreeCreateOutput,
	};
}

/**
 * Helper to block a Stop/SubagentStop/PreCompact/etc. event with a reason.
 */
export function createStopBlockResult(reason: string): HookResultPayload {
	return {
		action: 'json_output',
		stdout_json: {
			decision: 'block',
			reason,
		} satisfies StopOutput,
	};
}
