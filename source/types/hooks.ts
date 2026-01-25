// Protocol version for hook communication
export const PROTOCOL_VERSION = 1;

// Hook event names as defined by Claude Code
export type HookEventName =
	| 'PreToolUse'
	| 'PostToolUse'
	| 'Notification'
	| 'Stop'
	| 'SubagentStop'
	| 'UserPromptSubmit'
	| 'SessionStart'
	| 'SessionEnd';

// Claude Code stdin format for hook input
export type ClaudeHookInput = {
	session_id: string;
	transcript_path: string;
	cwd: string;
	hook_event_name: HookEventName;
	// PreToolUse/PostToolUse only
	tool_name?: string;
	tool_input?: Record<string, unknown>;
	// PostToolUse only
	tool_response?: unknown;
	// Notification only
	title?: string;
	message?: string;
	// Stop/SubagentStop only
	stop_reason?: string;
	stop_ts?: number;
	stop_hook_active?: boolean;
	// SessionStart/SessionEnd only
	session_type?: string;
};

// Envelope sent from forwarder to Ink CLI via UDS
export type HookEventEnvelope = {
	v: number;
	kind: 'hook_event';
	request_id: string;
	ts: number;
	session_id: string;
	hook_event_name: HookEventName;
	payload: ClaudeHookInput;
};

// Action to take in response to a hook event
export type HookAction = 'passthrough' | 'block_with_stderr' | 'json_output';

// Payload for hook result
export type HookResultPayload = {
	action: HookAction;
	stderr?: string;
	stdout_json?: Record<string, unknown>;
};

// Envelope sent from Ink CLI back to forwarder via UDS
export type HookResultEnvelope = {
	v: number;
	kind: 'hook_result';
	request_id: string;
	ts: number;
	payload: HookResultPayload;
};

// Parsed transcript summary for SessionEnd events
export type ParsedTranscriptSummary = {
	lastAssistantText: string | null;
	lastAssistantTimestamp: Date | null;
	messageCount: number;
	toolCallCount: number;
	error?: string;
};

// UI display state for hook events
export type HookEventDisplay = {
	id: string;
	requestId: string;
	timestamp: Date;
	hookName: HookEventName;
	toolName?: string;
	payload: ClaudeHookInput;
	status: 'pending' | 'passthrough' | 'blocked' | 'json_output';
	result?: HookResultPayload;
	transcriptSummary?: ParsedTranscriptSummary;
};

// Helper to create a passthrough result
export function createPassthroughResult(): HookResultPayload {
	return {action: 'passthrough'};
}

// Helper to create a block result
export function createBlockResult(reason: string): HookResultPayload {
	return {
		action: 'block_with_stderr',
		stderr: reason,
	};
}

// Helper to create a JSON output result
export function createJsonOutputResult(
	json: Record<string, unknown>,
): HookResultPayload {
	return {
		action: 'json_output',
		stdout_json: json,
	};
}

// Helper to create a deny result for PreToolUse hooks
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

// Valid hook event names for validation
const VALID_HOOK_EVENT_NAMES = new Set<string>([
	'PreToolUse',
	'PostToolUse',
	'Notification',
	'Stop',
	'SubagentStop',
	'UserPromptSubmit',
	'SessionStart',
	'SessionEnd',
]);

// Type guard to validate HookEventEnvelope structure
export function isValidHookEventEnvelope(
	obj: unknown,
): obj is HookEventEnvelope {
	if (typeof obj !== 'object' || obj === null) {
		return false;
	}

	const envelope = obj as Record<string, unknown>;

	return (
		typeof envelope['v'] === 'number' &&
		envelope['v'] === PROTOCOL_VERSION && // Validate version matches
		envelope['kind'] === 'hook_event' &&
		typeof envelope['request_id'] === 'string' &&
		envelope['request_id'].length > 0 &&
		typeof envelope['ts'] === 'number' &&
		typeof envelope['session_id'] === 'string' &&
		typeof envelope['hook_event_name'] === 'string' &&
		VALID_HOOK_EVENT_NAMES.has(envelope['hook_event_name']) &&
		typeof envelope['payload'] === 'object' &&
		envelope['payload'] !== null
	);
}

// Helper to generate unique IDs
export function generateId(): string {
	return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
